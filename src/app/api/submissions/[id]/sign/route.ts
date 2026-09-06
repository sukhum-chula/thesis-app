import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStepName, ROLE_LABELS } from "@/lib/utils";
import { sendStepEmail } from "@/lib/email";

function mapSub(s: any) {
  return {
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    workflowSteps: s.workflowSteps?.map((st: any) => ({
      ...st,
      createdAt: st.createdAt.toISOString(),
      actedAt: st.actedAt?.toISOString() ?? null,
    })) ?? [],
    uploads: s.uploads?.map((u: any) => ({
      ...u,
      uploadedAt: u.uploadedAt.toISOString(),
    })) ?? [],
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: submissionId } = await params;
  const { decision, notes } = await req.json();
  const { id: userId, name: userName } = session.user;

  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { workflowSteps: { orderBy: { stepOrder: "asc" } }, uploads: true },
  });
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (["COMPLETED", "CANCELLED"].includes(sub.status))
    return NextResponse.json({ error: "คำร้องนี้ปิดแล้ว ไม่สามารถลงนามได้" }, { status: 400 });
  if ((sub as any).cancelRequested)
    return NextResponse.json({ error: "คำร้องนี้มีคำขอยกเลิกที่รอการอนุมัติ ไม่สามารถลงนามได้" }, { status: 400 });
  // Mirror the approve action: no signing while rejected — student must resubmit first.
  if (sub.status === "REJECTED")
    return NextResponse.json({ error: "คำร้องถูกปฏิเสธ — รอนักศึกษายืนยันการแก้ไขก่อน" }, { status: 400 });

  // All steps are created PENDING up front, so "any pending committee step where I'm a
  // member" is NOT enough — that would let a member sign their step (e.g. step 9) while
  // the workflow is still at an earlier step. The current step is the LOWEST-order PENDING
  // step; a member may only sign when THAT step is their committee step.
  const currentStep = sub.workflowSteps.find((s: any) => s.status === "PENDING");
  if (
    !currentStep ||
    !["EXAM_COMMITTEE", "CO_ADVISOR"].includes(currentStep.role) ||
    !(currentStep.committeeMembers as string[])?.includes(userId)
  ) {
    return NextResponse.json({ error: "ยังไม่ถึงคิวของท่าน หรือท่านไม่ได้เป็นกรรมการของขั้นตอนนี้" }, { status: 403 });
  }
  const step = currentStep;
  const userRole = step.role as string;
  const stepRoleLabel = ROLE_LABELS[userRole as keyof typeof ROLE_LABELS] ?? userRole;

  // Quick pre-tx check (double-click guard; re-checked inside tx)
  const prevActionsCheck: any[] = (step.committeeActions as any[]) ?? [];
  if (prevActionsCheck.some((a) => a.userId === userId))
    return NextResponse.json({ error: "Already signed" }, { status: 400 });

  // Enforce sequential order: all members before this one must have approved
  const memberIndex = (step.committeeMembers as string[]).indexOf(userId);
  const notYetSigned = (step.committeeMembers as string[])
    .slice(0, memberIndex)
    .filter((mid) => prevActionsCheck.find((a) => a.userId === mid)?.decision !== "APPROVED");
  if (notYetSigned.length > 0)
    return NextResponse.json({ error: "รอลำดับก่อนหน้าลงนามและอัปโหลดก่อน" }, { status: 400 });

  const now = new Date();

  // Serializable transaction — prevents concurrent-write race on committeeActions JSON column.
  // Two simultaneous requests for the same member will both re-read inside the tx; the second
  // will find their userId already present and abort before writing.
  let txResult!: { outcome: "REJECTED" | "PARTIAL" | "ALL_APPROVED"; nextMemberId?: string; isComplete: boolean };
  try {
    txResult = await prisma.$transaction(async (tx) => {
      const freshStep = await tx.workflowStep.findUnique({
        where: { id: step.id },
        select: { committeeActions: true, committeeMembers: true },
      });
      const prevActions = (freshStep?.committeeActions as any[]) ?? [];

      // Re-check inside tx (catches the race that the pre-tx check misses)
      if (prevActions.some((a: any) => a.userId === userId)) throw new Error("ALREADY_SIGNED");

      const newActions = [
        ...prevActions,
        { userId, name: userName, decision, notes, actedAt: now.toISOString() },
      ];
      const members = (freshStep?.committeeMembers as string[]) ?? [];

      if (decision === "REJECTED") {
        await tx.workflowStep.update({
          where: { id: step.id },
          data: {
            status: "REJECTED",
            committeeActions: newActions,
            actedAt: now,
            actedByName: userName,
            actedById: userId,
          },
        });
        await tx.submission.update({ where: { id: submissionId }, data: { status: "REJECTED" } });
        return { outcome: "REJECTED" as const, isComplete: false };
      }

      const allApproved = members.every(
        (mid: string) => newActions.find((a: any) => a.userId === mid)?.decision === "APPROVED"
      );

      if (!allApproved) {
        await tx.workflowStep.update({ where: { id: step.id }, data: { committeeActions: newActions } });
        const nextMemberId = members.find(
          (mid: string) => !newActions.find((a: any) => a.userId === mid && a.decision === "APPROVED")
        );
        return { outcome: "PARTIAL" as const, nextMemberId, isComplete: false };
      }

      // All members approved — advance the step
      await tx.workflowStep.update({
        where: { id: step.id },
        data: {
          status: "APPROVED",
          committeeActions: newActions,
          actedAt: now,
          actedByName: userRole === "CO_ADVISOR" ? "อาจารย์ที่ปรึกษาร่วมครบทุกท่าน" : "กรรมการสอบครบทุกท่าน",
          actedById: userId,
        },
      });

      // Count remaining PENDING steps (from DB, not stale sub)
      const pendingCount = await tx.workflowStep.count({ where: { submissionId, status: "PENDING" } });
      const isComplete = pendingCount === 0;
      await tx.submission.update({
        where: { id: submissionId },
        data: { status: isComplete ? "COMPLETED" : "IN_PROGRESS" },
      });
      return { outcome: "ALL_APPROVED" as const, isComplete };
    }, { isolationLevel: "Serializable" });
  } catch (e: any) {
    if (e.message === "ALREADY_SIGNED")
      return NextResponse.json({ error: "Already signed" }, { status: 400 });
    throw e;
  }

  const { outcome, nextMemberId, isComplete } = txResult;

  // ── Post-transaction: notifications & emails ──────────────────────────────────

  const currentStepName = getStepName(step.stepOrder, sub.submissionType) || stepRoleLabel;

  // Helper: notify all admins
  async function notifyAdmins(message: string, type: string) {
    const admins = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } } });
    if (admins.length) {
      await prisma.notification.createMany({
        data: admins.map((a: any) => ({ recipientId: a.id, message, detail: sub!.title, submissionId, type })),
      });
    }
  }

  if (outcome === "REJECTED") {
    // Use the actual step-role label so student knows who rejected, not generic "กรรมการ"
    const rejectionNote = notes
      ? `${stepRoleLabel}ปฏิเสธ — "${notes}" — กรุณาแก้ไขและยื่นใหม่`
      : `ปฏิเสธโดย${stepRoleLabel} (${userName}) — กรุณาแก้ไขและยื่นใหม่`;
    await prisma.notification.create({
      data: { recipientId: sub.studentId, message: rejectionNote, detail: sub.title, submissionId, type: "rejected" },
    });
    try {
      await sendStepEmail({ role: "STUDENT", sub, stepName: currentStepName, isRejection: true, rejectionNote: notes });
    } catch (e) { console.error("[email/reject/committee]", e); }
    await notifyAdmins(`${stepRoleLabel}ปฏิเสธ — ${currentStepName}`, "rejected");
  }

  else if (outcome === "PARTIAL") {
    if (nextMemberId) {
      await prisma.notification.create({
        data: { recipientId: nextMemberId, message: `ถึงคิวของท่าน: ${currentStepName}`, detail: sub.title, submissionId, type: "pending" },
      });
      try {
        await sendStepEmail({ role: userRole, sub, stepName: currentStepName, specificMemberId: nextMemberId });
      } catch (e) { console.error("[email/committee-chain]", e); }
    }
    await notifyAdmins(`${stepRoleLabel}ลงนาม (${userName}) — ${currentStepName}`, "info");
  }

  else { // ALL_APPROVED
    await notifyAdmins(`${stepRoleLabel}ครบทุกท่านแล้ว — ${currentStepName}`, "info");
    if (isComplete) {
      await prisma.notification.create({
        data: { recipientId: sub.studentId, message: "วิทยานิพนธ์ผ่านการอนุมัติครบทุกขั้นตอน 🎉", detail: sub.title, submissionId, type: "approved" },
      });
    } else {
      // Notify student that their submission progressed
      await prisma.notification.create({
        data: { recipientId: sub.studentId, message: `คำร้องคืบหน้า — ${stepRoleLabel}อนุมัติ: ${currentStepName}`, detail: sub.title, submissionId, type: "info" },
      });
      // Notify the next step's assignee using submission-specific IDs
      const nextStep = sub.workflowSteps.find((s: any) => s.stepOrder > step.stepOrder && s.status === "PENDING");
      if (nextStep) {
        const stepName = getStepName(nextStep.stepOrder, sub.submissionType) || ROLE_LABELS[nextStep.role as keyof typeof ROLE_LABELS];
        const msg = `ถึงคิวของท่าน: ${stepName}`;
        const nextRole = nextStep.role as string;

        let recipientId: string | null = null;
        let specificMemberId: string | undefined;

        if (nextRole === "STUDENT") {
          recipientId = sub.studentId;
        } else if (nextRole === "ADVISOR") {
          recipientId = (sub as any).advisorId ?? null;
        } else if (nextRole === "HEAD_EXAM_COMMITTEE") {
          recipientId = (sub as any).headCommitteeId ?? null;
        } else if (nextRole === "INVITED_EXAM_COMMITTEE") {
          recipientId = (sub as any).invitedCommitteeId ?? null;
        } else if (nextRole === "PROGRAM_CHAIR") {
          if ((sub as any).programChairId) {
            recipientId = (sub as any).programChairId;
          } else {
            const chair = await prisma.user.findFirst({ where: { isProgramChair: true } });
            recipientId = chair?.id ?? null;
          }
        } else if (nextRole === "CO_ADVISOR") {
          const coIds: string[] = (sub as any).coAdvisorIds ?? [];
          specificMemberId = coIds[0];
          if (coIds[0]) recipientId = coIds[0];
        } else if (nextRole === "EXAM_COMMITTEE") {
          const firstId: string | undefined = (sub as any).committeeIds?.[0];
          specificMemberId = firstId;
          if (firstId) recipientId = firstId;
        } else if (nextRole === "ADMIN") {
          const admins = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } } });
          if (admins.length) {
            await prisma.notification.createMany({
              data: admins.map((a: any) => ({ recipientId: a.id, message: msg, detail: sub.title, submissionId, type: "pending" })),
            });
          }
          recipientId = null;
        }

        if (recipientId) {
          await prisma.notification.create({ data: { recipientId, message: msg, detail: sub.title, submissionId, type: "pending" } });
        }
        try {
          await sendStepEmail({ role: nextRole, sub, stepName, specificMemberId });
        } catch (e) { console.error("[email/step]", e); }
      }
    }
  }

  const updated = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { workflowSteps: { orderBy: { stepOrder: "asc" } }, uploads: true },
  });
  return NextResponse.json(mapSub(updated));
}
