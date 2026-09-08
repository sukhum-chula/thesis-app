import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStepName, ROLE_LABELS, PROGRAM_LABELS, formatUserName } from "@/lib/utils";
import { sendStepEmail, sendFinanceEmail } from "@/lib/email";
import { deleteFolder } from "@/lib/supabase";
import { buildWorkflowSteps } from "@/lib/workflowSteps";
import { validatePeople, resolvePeople, type PersonInput } from "@/lib/committee";
import { getProgramChairUserId, getProgramChairsOfUser } from "@/lib/systemSettings";

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

async function getSub(id: string) {
  return prisma.submission.findUnique({
    where: { id },
    include: { workflowSteps: { orderBy: { stepOrder: "asc" } }, uploads: true },
  });
}

async function notifyRole(role: string, sub: any, message: string, type: string) {
  let recipientId: string | null = null;
  if (role === "STUDENT")              recipientId = sub.studentId;
  else if (role === "ADVISOR")         recipientId = sub.advisorId;
  else if (role === "HEAD_EXAM_COMMITTEE") recipientId = sub.headCommitteeId;
  else if (role === "INVITED_EXAM_COMMITTEE") recipientId = sub.invitedCommitteeId;
  else if (role === "EXAM_COMMITTEE") {
    const firstId: string | undefined = sub.committeeIds?.[0];
    if (firstId) {
      await prisma.notification.create({
        data: { recipientId: firstId, message, detail: sub.title, submissionId: sub.id, type },
      });
    }
    return;
  } else if (role === "CO_ADVISOR") {
    const firstId: string | undefined = sub.coAdvisorIds?.[0];
    if (firstId) {
      await prisma.notification.create({
        data: { recipientId: firstId, message, detail: sub.title, submissionId: sub.id, type },
      });
    }
    return;
  } else if (role === "ADMIN") {
    // Fix #3: notify ALL admins, not just the first one found
    const admins = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } } });
    if (admins.length) {
      await prisma.notification.createMany({
        data: admins.map((a: any) => ({ recipientId: a.id, message, detail: sub.title, submissionId: sub.id, type })),
      });
    }
    return;
  } else if (role === "PROGRAM_CHAIR") {
    // Per-submission chair (assigned by the student) with per-program admin-designated fallback
    if ((sub as any).programChairId) {
      recipientId = (sub as any).programChairId;
    } else if ((sub as any).program) {
      recipientId = await getProgramChairUserId((sub as any).program);
    }
  } else {
    const user = await prisma.user.findFirst({ where: { roles: { has: role as any } } });
    recipientId = user?.id ?? null;
  }
  if (recipientId) {
    await prisma.notification.create({
      data: { recipientId, message, detail: sub.title, submissionId: sub.id, type },
    });
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const sub = await getSub(id);
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { id: userId, role } = session.user;
  // Submission workflow is ADMIN's exclusive responsibility — SUPER_ADMIN is account/user management only
  const isPrivileged = role === "ADMIN" || (!!sub.program && (await getProgramChairsOfUser(userId)).includes(sub.program));
  const isInvolved =
    sub.studentId === userId ||
    sub.advisorId === userId ||
    (sub.coAdvisorIds as string[]).includes(userId) ||
    (sub.committeeIds as string[]).includes(userId) ||
    sub.headCommitteeId === userId ||
    sub.invitedCommitteeId === userId ||
    (sub as any).programChairId === userId;
  if (!isPrivileged && !isInvolved)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(mapSub(sub));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { action } = body;
  const { id: userId } = session.user;
  const userName = formatUserName(session.user);

  // Always look up roles from DB — JWT role can be stale after a role change
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { roles: true } });
  const userChairedPrograms = await getProgramChairsOfUser(userId);
  const userRoles: string[] = dbUser?.roles as string[] ?? (session.user as any).roles ?? [session.user.role as string];
  const role: string = userRoles[0] ?? "";

  const sub = await getSub(id);
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((sub as any).cancelRequested && !["accept_cancel", "decline_cancel"].includes(action))
    return NextResponse.json({ error: "คำร้องนี้มีคำขอยกเลิกที่รอการอนุมัติ ไม่สามารถดำเนินการอื่นได้ในขณะนี้" }, { status: 400 });

  const now = new Date();

  if (action === "approve") {
    // Block approval while submission is REJECTED — student must resubmit to reset the rejected step
    if (sub.status === "REJECTED")
      return NextResponse.json({ error: "คำร้องถูกปฏิเสธ — รอนักศึกษายืนยันการแก้ไขก่อน" }, { status: 400 });

    const step = sub.workflowSteps.find((s: any) => s.status === "PENDING");
    if (!step) return NextResponse.json({ error: "No pending step" }, { status: 400 });

    // CO_ADVISOR and EXAM_COMMITTEE use sequential committee signing via /sign — block here
    if (step.role === "CO_ADVISOR" || step.role === "EXAM_COMMITTEE") {
      return NextResponse.json(
        { error: "กรุณาใช้เส้นทาง /sign สำหรับการลงนามแบบคณะกรรมการ" },
        { status: 400 }
      );
    }

    // Involvement-based approval check
    const canApprove = (() => {
      if (step.role === "STUDENT")               return sub.studentId === userId;
      if (step.role === "ADVISOR")               return sub.advisorId === userId;
      if (step.role === "CO_ADVISOR")            return (sub.coAdvisorIds as string[]).includes(userId);
      if (step.role === "HEAD_EXAM_COMMITTEE")   return sub.headCommitteeId === userId;
      if (step.role === "INVITED_EXAM_COMMITTEE")return sub.invitedCommitteeId === userId;
      if (step.role === "PROGRAM_CHAIR")
        return (sub as any).programChairId
          ? (sub as any).programChairId === userId
          : !!sub.program && userChairedPrograms.includes(sub.program);
      return userRoles.includes(step.role); // ADMIN, EXAM_COMMITTEE
    })();
    if (!canApprove) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Enforce required uploads before certain steps can advance
    {
      // PROPOSAL step 4: student and admin upload in parallel — only student docs required here;
      // FINANCE_DOC is checked separately and auto-advances the step when both sides are ready.
      const REQUIRED_UPLOADS: Record<string, Record<number, string[]>> = {
        PROPOSAL:       { 1: ["BW1A", "BW1B", "FINANCE_ATTACH"], 4: ["B1C", "B1D"] },
        THESIS_DEFENSE: { 1: ["B2", "B3", "FINANCE_ATTACH"], 9: ["SIGNED"], 16: ["B4", "THESIS"] },
      };
      const subType = sub.submissionType ?? "PROPOSAL";
      const required = REQUIRED_UPLOADS[subType]?.[step.stepOrder] ?? [];
      const uploaded = new Set(sub.uploads.map((u: any) => u.formType));
      const missing = required.filter((f) => !uploaded.has(f));
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `กรุณาอัปโหลดเอกสารให้ครบก่อน: ${missing.join(", ")}` },
          { status: 400 }
        );
      }
      // PROPOSAL step 4 parallel gate: student docs are ready — check if FINANCE_DOC is also done.
      // If not, acknowledge the student's submission, notify admin, and keep the step PENDING.
      if ((sub.submissionType ?? "PROPOSAL") === "PROPOSAL" && step.stepOrder === 4) {
        if (!uploaded.has("FINANCE_DOC")) {
          // Notify all admins to upload their FINANCE_DOC
          const admins = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } } });
          if (admins.length) {
            await prisma.notification.createMany({
              data: admins.map((a: any) => ({
                recipientId: a.id,
                message: "นิสิตอัปโหลด บ.วศ.1ค + บ.วศ.1ง แล้ว — กรุณาอัปโหลดเอกสารการเงิน",
                detail: sub.title,
                submissionId: sub.id,
                type: "pending",
              })),
            });
          }
          try {
            await sendStepEmail({ role: "ADMIN", sub, stepName: "อัปโหลดเอกสารการเงิน (ขั้นที่ 4)" });
          } catch (e) { console.error("[email/step4-finance]", e); }
          const result = await getSub(id);
          return NextResponse.json({ ...mapSub(result!), waitingForFinance: true });
        }
      }
    }

    // THESIS step 8 (ADMIN upload): require all 4 document types uploaded AFTER step 7 completed
    if (sub.submissionType === "THESIS_DEFENSE" && step.stepOrder === 8 && step.role === "ADMIN") {
      const step7 = sub.workflowSteps.find((s: any) => s.stepOrder === 7);
      const step7ActedAt = step7?.actedAt ? new Date(step7.actedAt).getTime() : 0;
      const requiredTypes = ["SIGNED", "EXAM_RESULT", "INVITE_LETTER", "FINANCE_DOC"];
      const missing = requiredTypes.filter(
        (ft) => !sub.uploads.some(
          (u: any) => u.formType === ft && new Date(u.uploadedAt).getTime() >= step7ActedAt
        )
      );
      if (missing.length > 0) {
        return NextResponse.json(
          { error: "กรุณาอัปโหลดเอกสารให้ครบทั้ง 4 ประเภทก่อนอนุมัติ" },
          { status: 400 }
        );
      }
    }

    // THESIS step 9 (STUDENT แบบรายงานฯ): require a SIGNED uploaded AFTER step 8 completed.
    // Admin uploads SIGNED at step 8 — without this gate the general check above would pass
    // on the admin's upload, letting the student skip their own signed document entirely.
    if (sub.submissionType === "THESIS_DEFENSE" && step.stepOrder === 9 && step.role === "STUDENT") {
      const step8 = sub.workflowSteps.find((s: any) => s.stepOrder === 8);
      const step8ActedAt = step8?.actedAt ? new Date(step8.actedAt).getTime() : 0;
      const hasStudentSigned = sub.uploads.some(
        (u: any) => u.formType === "SIGNED" && new Date(u.uploadedAt).getTime() > step8ActedAt
      );
      if (!hasStudentSigned) {
        return NextResponse.json(
          { error: "กรุณาอัปโหลดแบบรายงานการเสนอผลงานฯ ที่ลงนามโดยนิสิตก่อน" },
          { status: 400 }
        );
      }
    }

    await prisma.workflowStep.update({
      where: { id: step.id },
      data: { status: "APPROVED", actedAt: now, actedByName: userName, actedById: userId, notes: body.notes ?? null },
    });

    const remainingSteps = sub.workflowSteps.filter((s: any) => s.id !== step.id && s.status === "PENDING");
    const isComplete = remainingSteps.length === 0;
    await prisma.submission.update({ where: { id }, data: { status: isComplete ? "COMPLETED" : "IN_PROGRESS" } });

    if (isComplete) {
      await prisma.notification.create({
        data: { recipientId: sub.studentId, message: "วิทยานิพนธ์ผ่านการอนุมัติครบทุกขั้นตอน 🎉", detail: sub.title, submissionId: id, type: "approved" },
      });
      // Notify all admins when PROPOSAL fully completes
      if (sub.submissionType === "PROPOSAL") {
        const adminUsers = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } } });
        if (adminUsers.length) {
          await prisma.notification.createMany({
            data: adminUsers.map((a) => ({ recipientId: a.id, message: "กระบวนการ Proposal เสร็จสมบูรณ์แล้ว", detail: sub.title, submissionId: id, type: "approved" })),
          });
          try { await sendStepEmail({ role: "ADMIN", sub, stepName: "Proposal เสร็จสมบูรณ์" }); } catch (e) { console.error("[email/proposal-complete]", e); }
        }
      }
    } else {
      const nextStep = sub.workflowSteps.find((s: any) => s.stepOrder > step.stepOrder && s.status === "PENDING");
      if (nextStep) {
        const stepName = getStepName(nextStep.stepOrder, sub.submissionType) || ROLE_LABELS[nextStep.role as keyof typeof ROLE_LABELS];
        const msg = `ถึงคิวของท่าน: ${stepName}`;
        await notifyRole(nextStep.role, sub, msg, "pending");
        try {
          const specificMemberId = nextStep.role === "EXAM_COMMITTEE" ? (sub.committeeIds as string[])?.[0]
            : nextStep.role === "CO_ADVISOR" ? (sub.coAdvisorIds as string[])?.[0]
            : undefined;
          await sendStepEmail({ role: nextStep.role, sub, stepName, specificMemberId });
        } catch (e) { console.error("[email/step]", e); }
      }
      // Notify student that their submission has progressed (unless it was their own step)
      if (step.role !== "STUDENT") {
        const actorLabel = ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role;
        const currentStepName = getStepName(step.stepOrder, sub.submissionType) || actorLabel;
        await prisma.notification.create({
          data: { recipientId: sub.studentId, message: `คำร้องคืบหน้า — ${actorLabel}อนุมัติ: ${currentStepName}`, detail: sub.title, submissionId: id, type: "info" },
        });
      }
      // After THESIS step 6 (PROGRAM_CHAIR sign B2), notify all admins to collect + send to Faculty
      if (step.stepOrder === 6 && step.role === "PROGRAM_CHAIR" && sub.submissionType === "THESIS_DEFENSE") {
        try {
          const adminUsers = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } } });
          if (adminUsers.length) {
            await prisma.notification.createMany({
              data: adminUsers.map((a) => ({ recipientId: a.id, message: "บ.2 + บ.3 ลงนามครบแล้ว — กรุณานำส่งไปยังคณะ", detail: sub.title, submissionId: id, type: "info" })),
            });
          }
        } catch (e) { console.error("[email/thesis/step5]", e); }
      }
      // After THESIS step 8 (ADMIN upload), send invitation letter email to Advisor + External
      if (step.stepOrder === 8 && step.role === "ADMIN" && sub.submissionType === "THESIS_DEFENSE") {
        try {
          if (sub.advisorId) {
            await sendStepEmail({ role: "ADVISOR", sub, stepName: "หนังสือเชิญเข้าร่วมสอบวิทยานิพนธ์" });
          }
          if (sub.invitedCommitteeId) {
            await sendStepEmail({ role: "INVITED_EXAM_COMMITTEE", sub, stepName: "หนังสือเชิญเข้าร่วมสอบวิทยานิพนธ์" });
          }
        } catch (e) { console.error("[email/invitation]", e); }
      }
    }

    if (step.stepOrder === 6 && step.role === "PROGRAM_CHAIR" && sub.submissionType === "THESIS_DEFENSE") {
      try {
        const invitedId = (sub as any).invitedCommitteeId as string | null | undefined;
        const [advisorUser, headUser, committeeUsers, invitedUser, financeAttach] = await Promise.all([
          sub.advisorId ? prisma.user.findUnique({ where: { id: sub.advisorId }, select: { title: true, name: true } }) : null,
          sub.headCommitteeId ? prisma.user.findUnique({ where: { id: sub.headCommitteeId }, select: { title: true, name: true } }) : null,
          (sub.committeeIds as string[] | undefined)?.length
            ? prisma.user.findMany({ where: { id: { in: sub.committeeIds as string[] } }, select: { title: true, name: true } })
            : Promise.resolve([]),
          invitedId ? prisma.user.findUnique({ where: { id: invitedId }, select: { title: true, name: true, email: true } }) : null,
          prisma.formUpload.findFirst({ where: { submissionId: id, formType: "FINANCE_ATTACH" }, orderBy: { uploadedAt: "desc" }, select: { fileUrl: true, fileName: true } }),
        ]);
        await sendFinanceEmail({
          studentName: sub.studentFullName ?? sub.studentId ?? "-",
          studentCode: sub.studentCode ?? "-",
          studentEmail: sub.studentEmail ?? undefined,
          studentPhone: sub.studentPhone ?? undefined,
          program: sub.program ? (PROGRAM_LABELS[sub.program] ?? sub.program) : "-",
          thesisTitle: sub.title,
          submissionId: id,
          advisorName: advisorUser ? formatUserName(advisorUser) : undefined,
          headCommitteeName: headUser ? formatUserName(headUser) : undefined,
          committeeNames: committeeUsers.map((u) => formatUserName(u)),
          invitedProfName: (sub as any).invitedProfName ?? (invitedUser ? formatUserName(invitedUser) : undefined),
          invitedProfAffiliation: (sub as any).invitedProfAffiliation,
          invitedProfEmail: (sub as any).invitedProfEmail ?? invitedUser?.email,
          invitedProfPhone: (sub as any).invitedProfPhone,
          examDate: (sub as any).examDate,
          examTime: (sub as any).examTime,
          roomNeeded: (sub as any).roomNeeded,
          parkingNeeded: (sub as any).parkingNeeded,
          carPlate: (sub as any).carPlate,
          financeAttachUrl: financeAttach?.fileUrl ?? undefined,
          financeAttachName: financeAttach?.fileName ?? undefined,
          emailSubject: `[แจ้งการเงิน] นิสิตขอสอบวิทยานิพนธ์ — ${sub.studentFullName ?? sub.studentId ?? "-"}`,
        });
        const adminUsers = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } } });
        if (adminUsers.length) {
          await prisma.notification.createMany({
            data: adminUsers.map((a) => ({ recipientId: a.id, message: "ส่งอีเมลแจ้งฝ่ายการเงิน (สอบวิทยานิพนธ์) แล้ว", detail: sub.title, submissionId: id, type: "info" })),
          });
        }
      } catch (e) {
        console.error("[email/finance/thesis]", e);
      }
    }

    if (step.stepOrder === 3 && step.role === "PROGRAM_CHAIR" && sub.submissionType === "PROPOSAL") {
      try {
        const invitedId = (sub as any).invitedCommitteeId as string | null | undefined;
        const [advisorUser, headUser, committeeUsers, invitedUser, financeAttach] = await Promise.all([
          sub.advisorId ? prisma.user.findUnique({ where: { id: sub.advisorId }, select: { title: true, name: true } }) : null,
          sub.headCommitteeId ? prisma.user.findUnique({ where: { id: sub.headCommitteeId }, select: { title: true, name: true } }) : null,
          (sub.committeeIds as string[] | undefined)?.length
            ? prisma.user.findMany({ where: { id: { in: sub.committeeIds as string[] } }, select: { title: true, name: true } })
            : Promise.resolve([]),
          invitedId ? prisma.user.findUnique({ where: { id: invitedId }, select: { title: true, name: true, email: true } }) : null,
          prisma.formUpload.findFirst({ where: { submissionId: id, formType: "FINANCE_ATTACH" }, orderBy: { uploadedAt: "desc" }, select: { fileUrl: true, fileName: true } }),
        ]);
        await sendFinanceEmail({
          studentName: sub.studentFullName ?? sub.studentId ?? "-",
          studentCode: sub.studentCode ?? "-",
          studentEmail: sub.studentEmail ?? undefined,
          studentPhone: sub.studentPhone ?? undefined,
          program: sub.program ? (PROGRAM_LABELS[sub.program] ?? sub.program) : "-",
          thesisTitle: sub.title,
          submissionId: id,
          advisorName: advisorUser ? formatUserName(advisorUser) : undefined,
          headCommitteeName: headUser ? formatUserName(headUser) : undefined,
          committeeNames: committeeUsers.map((u) => formatUserName(u)),
          invitedProfName: (sub as any).invitedProfName ?? (invitedUser ? formatUserName(invitedUser) : undefined),
          invitedProfAffiliation: (sub as any).invitedProfAffiliation,
          invitedProfEmail: (sub as any).invitedProfEmail ?? invitedUser?.email,
          invitedProfPhone: (sub as any).invitedProfPhone,
          examDate: (sub as any).examDate,
          examTime: (sub as any).examTime,
          roomNeeded: (sub as any).roomNeeded,
          parkingNeeded: (sub as any).parkingNeeded,
          carPlate: (sub as any).carPlate,
          financeAttachUrl: financeAttach?.fileUrl ?? undefined,
          financeAttachName: financeAttach?.fileName ?? undefined,
        });
        // Notify all admins that finance email was sent
        const adminUsers = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } } });
        if (adminUsers.length) {
          await prisma.notification.createMany({
            data: adminUsers.map((a) => ({ recipientId: a.id, message: "ส่งอีเมลแจ้งฝ่ายการเงินแล้ว", detail: sub.title, submissionId: id, type: "info" })),
          });
        }
      } catch (e) {
        console.error("[email/finance]", e);
      }
    }
    // Always notify all admins about every step completion
    const completedActorLabel = ROLE_LABELS[step.role as keyof typeof ROLE_LABELS] ?? step.role;
    await notifyRole("ADMIN", sub, `${completedActorLabel}ดำเนินการแล้ว — ${getStepName(step.stepOrder, sub.submissionType)}`, "info");
  }

  else if (action === "reject") {
    // Block rejection while submission is already REJECTED — a second reject would create two
    // REJECTED steps; resubmit only resets one of them, leaving the other permanently orphaned.
    if (sub.status === "REJECTED")
      return NextResponse.json({ error: "คำร้องถูกปฏิเสธ — รอนักศึกษายืนยันการแก้ไขก่อน" }, { status: 400 });

    const step = sub.workflowSteps.find((s: any) => s.status === "PENDING");
    if (!step) return NextResponse.json({ error: "No pending step" }, { status: 400 });

    // Use the step's role label so the message names the actual role (e.g. "อาจารย์ที่ปรึกษาร่วม"),
    // not the user's DB role ("อาจารย์") which is the same for all faculty types.
    const stepRoleLabel = ROLE_LABELS[step.role as keyof typeof ROLE_LABELS] ?? step.role;
    const byLabel = stepRoleLabel;

    const isPrivileged = userRoles.includes("ADMIN");

    // Admin/super-admin must provide a reason when rejecting
    if (isPrivileged && !body.notes?.trim())
      return NextResponse.json({ error: "กรุณาระบุเหตุผลในการปฏิเสธ" }, { status: 400 });

    // Non-privileged users must be involved in this submission to reject
    if (!isPrivileged) {
      const isInvolved =
        sub.studentId === userId ||
        sub.advisorId === userId ||
        (sub.coAdvisorIds as string[]).includes(userId) ||
        (sub.committeeIds as string[]).includes(userId) ||
        sub.headCommitteeId === userId ||
        sub.invitedCommitteeId === userId ||
        (sub as any).programChairId === userId;
      if (!isInvolved) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Mark current step REJECTED, stay on this step — student must fix and resubmit
    await prisma.workflowStep.update({
      where: { id: step.id },
      data: { status: "REJECTED", actedAt: now, actedByName: userName, actedById: userId, notes: body.notes?.trim() || null },
    });
    await prisma.submission.update({ where: { id }, data: { status: "REJECTED" } });

    // Notify student to fix and resubmit
    const studentNote = body.notes
      ? `คำร้องถูกปฏิเสธโดย ${byLabel} — "${body.notes}" — กรุณาแก้ไขและยื่นใหม่`
      : `คำร้องถูกปฏิเสธโดย ${byLabel} — กรุณาแก้ไขและยื่นใหม่`;
    await prisma.notification.create({
      data: { recipientId: sub.studentId, message: studentNote, detail: sub.title, submissionId: id, type: "rejected" },
    });
    try {
      await sendStepEmail({ role: "STUDENT", sub, stepName: getStepName(step.stepOrder, sub.submissionType), isRejection: true, rejectionNote: body.notes });
    } catch (e) { console.error("[email/reject]", e); }
    // Always notify all admins about every rejection
    await notifyRole("ADMIN", sub, `${byLabel}ปฏิเสธ — ${getStepName(step.stepOrder, sub.submissionType)}`, "rejected");
  }

  else if (action === "return_to_prev") {
    // Admin sends the current step back to the previous role for re-review
    if (!userRoles.includes("ADMIN"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const step = sub.workflowSteps.find((s: any) => s.status === "PENDING");
    if (!step) return NextResponse.json({ error: "No pending step" }, { status: 400 });

    const prevStep = [...sub.workflowSteps]
      .filter((s: any) => s.stepOrder < step.stepOrder && s.status !== "SKIPPED")
      .sort((a: any, b: any) => b.stepOrder - a.stepOrder)[0];

    if (!prevStep) return NextResponse.json({ error: "ไม่สามารถส่งกลับได้ — นี่คือขั้นตอนแรก" }, { status: 400 });

    const byLabel = ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role;
    const notifyNote = body.notes
      ? `ส่งกลับโดย ${byLabel} — "${body.notes}"`
      : `ส่งกลับโดย ${byLabel}`;

    // Reset BOTH steps to PENDING. Marking the current step REJECTED would strand it:
    // the approve flow only advances through PENDING steps, so a REJECTED step here
    // would be skipped forever once the previous role re-approves.
    await prisma.workflowStep.update({
      where: { id: step.id },
      data: { status: "PENDING", actedAt: null, actedByName: null, actedById: null, notes: null, committeeActions: [] },
    });
    await prisma.workflowStep.update({
      where: { id: prevStep.id },
      data: { status: "PENDING", actedAt: null, actedByName: null, actedById: null, notes: null, committeeActions: [] },
    });
    await prisma.submission.update({ where: { id }, data: { status: "IN_PROGRESS" } });

    await notifyRole(prevStep.role, sub, notifyNote, "rejected");
    try {
      const prevStepName = getStepName(prevStep.stepOrder, sub.submissionType) || ROLE_LABELS[prevStep.role as keyof typeof ROLE_LABELS];
      await sendStepEmail({ role: prevStep.role, sub, stepName: prevStepName });
    } catch (e) { console.error("[email/return_to_prev]", e); }
    await prisma.notification.create({
      data: { recipientId: sub.studentId, message: notifyNote, detail: sub.title, submissionId: id, type: "rejected" },
    });
  }

  else if (action === "request_cancel") {
    if (sub.studentId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (sub.status === "CANCELLED")
      return NextResponse.json({ error: "คำร้องนี้ถูกยกเลิกไปแล้ว" }, { status: 400 });
    await prisma.submission.update({ where: { id }, data: { cancelRequested: true, cancelRequestedAt: now } });
    await notifyRole("ADMIN", sub, "นิสิตขอยกเลิกคำร้อง — รอการอนุมัติ", "warning");
  }

  else if (action === "accept_cancel") {
    if (!userRoles.includes("ADMIN")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!(sub as any).cancelRequested) return NextResponse.json({ error: "ไม่มีคำขอยกเลิกที่รอดำเนินการ" }, { status: 400 });

    await prisma.workflowStep.updateMany({ where: { submissionId: id, status: "PENDING" }, data: { status: "SKIPPED" } });
    await prisma.submission.update({ where: { id }, data: { status: "CANCELLED", cancelRequested: false, cancelRequestedAt: null } });
    await prisma.notification.create({
      data: { recipientId: sub.studentId, message: "คำร้องของท่านถูกยกเลิกแล้วตามคำขอ", detail: sub.title, submissionId: id, type: "info" },
    });

    // Cancelling a PROPOSAL also cancels the defense created off it (if any and still in flight) —
    // this is how a student "starts over": cancel the old proposal, then a new one can be created.
    if (sub.submissionType === "PROPOSAL") {
      const linkedDefense = await prisma.submission.findFirst({
        where: { sourceProposalId: id, status: { notIn: ["CANCELLED", "COMPLETED"] } },
      });
      if (linkedDefense) {
        await prisma.workflowStep.updateMany({ where: { submissionId: linkedDefense.id, status: "PENDING" }, data: { status: "SKIPPED" } });
        await prisma.submission.update({
          where: { id: linkedDefense.id },
          data: { status: "CANCELLED", cancelRequested: false, cancelRequestedAt: null },
        });
        await prisma.notification.create({
          data: { recipientId: linkedDefense.studentId, message: "คำร้องนี้ถูกยกเลิกเนื่องจากคำร้องโครงร่างที่เกี่ยวข้องถูกยกเลิก", detail: linkedDefense.title, submissionId: linkedDefense.id, type: "info" },
        });
      }
    }
  }

  else if (action === "decline_cancel") {
    if (!userRoles.includes("ADMIN")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!(sub as any).cancelRequested) return NextResponse.json({ error: "ไม่มีคำขอยกเลิกที่รอดำเนินการ" }, { status: 400 });

    await prisma.submission.update({ where: { id }, data: { cancelRequested: false, cancelRequestedAt: null } });
    await prisma.notification.create({
      data: { recipientId: sub.studentId, message: "คำขอยกเลิกคำร้องของท่านถูกปฏิเสธ — คำร้องดำเนินการต่อตามปกติ", detail: sub.title, submissionId: id, type: "info" },
    });
  }

  else if (action === "continue_draft") {
    if (sub.studentId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (sub.status !== "DRAFT") return NextResponse.json({ error: "คำร้องนี้ไม่ใช่ฉบับร่าง" }, { status: 400 });

    const pendingPeople = (sub.pendingPeople as PersonInput[] | null) ?? [];
    const result = await resolvePeople(pendingPeople);
    if (!result.ok)
      return NextResponse.json(
        { error: `ยังมีกรรมการที่ยังไม่มีบัญชีในระบบ: ${result.missingEmails.join(", ")}` },
        { status: 400 }
      );

    // An ADMIN may already have edited this DRAFT's committee fields directly (the admin
    // submission-edit form writes these same columns) before the student got around to
    // continuing — never clobber that with the original pendingPeople resolution, only fill
    // in whichever fields are still unset.
    const advisorId          = sub.advisorId          ?? result.advisorId;
    const headCommitteeId    = sub.headCommitteeId    ?? result.headCommitteeId;
    const programChairId     = sub.programChairId     ?? result.programChairId;
    const coAdvisorIds       = sub.coAdvisorIds.length  ? sub.coAdvisorIds  : result.coAdvisorIds;
    const committeeIds       = sub.committeeIds.length  ? sub.committeeIds  : result.committeeIds;
    const invitedCommitteeId = sub.invitedCommitteeId ?? result.invitedCommitteeId;
    const invitedProfName    = sub.invitedProfName    ?? result.invitedProfName;
    const invitedProfEmail   = sub.invitedProfEmail   ?? result.invitedProfEmail;
    const invitedProfPhone   = sub.invitedProfPhone   ?? result.invitedProfPhone;

    await prisma.submission.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        pendingPeople: null as any,
        advisorId, headCommitteeId, committeeIds, coAdvisorIds, invitedCommitteeId,
        programChairId, invitedProfName, invitedProfEmail, invitedProfPhone,
      },
    });
    await prisma.workflowStep.createMany({
      data: buildWorkflowSteps(sub.submissionType, coAdvisorIds, committeeIds, invitedCommitteeId)
        .map((s) => ({ ...s, submissionId: id })),
    });
  }

  else if (action === "resubmit") {
    if (sub.studentId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const rejectedStep = sub.workflowSteps.find((s: any) => s.status === "REJECTED");
    if (!rejectedStep) return NextResponse.json({ error: "No rejected step" }, { status: 400 });

    // Reset only the rejected step itself — the reviewer re-reviews from the same step
    await prisma.workflowStep.update({
      where: { id: rejectedStep.id },
      data: { status: "PENDING", actedAt: null, actedByName: null, actedById: null, notes: null, committeeActions: [] },
    });
    await prisma.submission.update({ where: { id }, data: { status: "IN_PROGRESS" } });

    const stepName = getStepName(rejectedStep.stepOrder, sub.submissionType) || ROLE_LABELS[rejectedStep.role as keyof typeof ROLE_LABELS];
    await notifyRole(rejectedStep.role, sub, `นิสิตแก้ไขแล้ว — กรุณาดำเนินการ: ${stepName}`, "pending");
    try {
      const specificMemberId = rejectedStep.role === "EXAM_COMMITTEE" ? (sub.committeeIds as string[])?.[0]
        : rejectedStep.role === "CO_ADVISOR" ? (sub.coAdvisorIds as string[])?.[0]
        : undefined;
      await sendStepEmail({ role: rejectedStep.role, sub, stepName, specificMemberId });
    } catch (e) { console.error("[email/resubmit]", e); }
    // Always notify all admins when student resubmits
    await notifyRole("ADMIN", sub, `นิสิตยื่นใหม่แล้ว — ${stepName}`, "info");
  }

  else if (action === "admin_set_note") {
    if (!userRoles.includes("ADMIN")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await prisma.submission.update({ where: { id }, data: { adminNote: body.note } });
  }

  else if (action === "admin_update") {
    if (!userRoles.includes("ADMIN")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const b = body;
    const nullOrVal = (v: unknown) => (v === undefined ? undefined : (v || null));
    await prisma.submission.update({
      where: { id },
      data: {
        title:                b.title               ?? undefined,
        advisorId:            nullOrVal(b.advisorId),
        studentFullName:      b.studentFullName      !== undefined ? (b.studentFullName || null) : undefined,
        studentCode:          b.studentCode          !== undefined ? (b.studentCode     || null) : undefined,
        program:              b.program              !== undefined ? (b.program          || null) : undefined,
        studentEmail:         b.studentEmail         !== undefined ? (b.studentEmail     || null) : undefined,
        studentPhone:         b.studentPhone         !== undefined ? (b.studentPhone     || null) : undefined,
        coAdvisorIds:         b.coAdvisorIds         !== undefined ? b.coAdvisorIds             : undefined,
        programChairId:       nullOrVal(b.programChairId),
        headCommitteeId:      nullOrVal(b.headCommitteeId),
        committeeIds:         b.committeeIds         !== undefined ? b.committeeIds              : undefined,
        invitedCommitteeId:   nullOrVal(b.invitedCommitteeId),
        invitedProfName:      b.invitedProfName      !== undefined ? (b.invitedProfName      || null) : undefined,
        invitedProfEmail:     b.invitedProfEmail     !== undefined ? (b.invitedProfEmail     || null) : undefined,
        invitedProfAffiliation: b.invitedProfAffiliation !== undefined ? (b.invitedProfAffiliation || null) : undefined,
        invitedProfPhone:     b.invitedProfPhone     !== undefined ? (b.invitedProfPhone     || null) : undefined,
        examDate:             b.examDate             !== undefined ? (b.examDate             || null) : undefined,
        examTime:             b.examTime             !== undefined ? (b.examTime             || null) : undefined,
        roomNeeded:           b.roomNeeded           !== undefined ? Boolean(b.roomNeeded)          : undefined,
        parkingNeeded:        b.parkingNeeded        !== undefined ? Boolean(b.parkingNeeded)        : undefined,
        carPlate:             b.carPlate             !== undefined ? (b.carPlate             || null) : undefined,
      },
    });
  }

  else if (action === "admin_reset") {
    if (!userRoles.includes("ADMIN")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // Revive ALL steps, not just non-SKIPPED ones — cancel marks pending steps SKIPPED, so a
    // reset that skips them would truncate the workflow (it would "complete" after the
    // pre-cancel steps). This also makes reset the way to undo a cancelled submission.
    // CO_ADVISOR steps stay SKIPPED when the submission has no co-advisors.
    const hasCoAdvisors = ((sub.coAdvisorIds as string[]) ?? []).length > 0;
    await prisma.workflowStep.updateMany({
      where: hasCoAdvisors ? { submissionId: id } : { submissionId: id, NOT: { role: "CO_ADVISOR" } },
      data: { status: "PENDING", actedAt: null, actedByName: null, actedById: null, notes: null, committeeActions: [] },
    });
    if (!hasCoAdvisors) {
      await prisma.workflowStep.updateMany({
        where: { submissionId: id, role: "CO_ADVISOR" },
        data: { status: "SKIPPED", actedAt: null, actedByName: null, actedById: null, notes: null, committeeActions: [] },
      });
    }
    await prisma.submission.update({ where: { id }, data: { status: "IN_PROGRESS" } });
  }

  else if (action === "admin_override_step") {
    if (!userRoles.includes("ADMIN")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { stepOrder, decision, notes } = body;

    // A cancelled submission has its pending steps SKIPPED — overriding one step would
    // recompute status as COMPLETED (nothing pending). Reset the submission first instead.
    if (sub.status === "CANCELLED")
      return NextResponse.json({ error: "คำร้องถูกยกเลิกแล้ว — กรุณารีเซ็ตคำร้องก่อนหากต้องการดำเนินการต่อ" }, { status: 400 });
    if (decision !== "APPROVED" && decision !== "REJECTED")
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 });

    const targetStep = sub.workflowSteps.find((s: any) => s.stepOrder === stepOrder);
    if (!targetStep) return NextResponse.json({ error: "Step not found" }, { status: 404 });

    if (decision === "APPROVED") {
      // Approve target + all non-SKIPPED steps before it that aren't already APPROVED
      const toApprove = sub.workflowSteps
        .filter((s: any) => s.stepOrder <= stepOrder && s.status !== "SKIPPED" && s.status !== "APPROVED")
        .map((s: any) => s.id);
      if (toApprove.length > 0) {
        await prisma.workflowStep.updateMany({
          where: { id: { in: toApprove } },
          data: { status: "APPROVED", actedAt: now, actedByName: userName, actedById: userId, notes: notes ?? null },
        });
      }
      // Clear any REJECTED steps after the approved target back to PENDING.
      // Without this, a prior rejection at step N (which sets step N → REJECTED, step N-1 → PENDING)
      // leaves step N orphaned when admin approves step N-1 — the workflow advances past REJECTED N
      // to PENDING N+1, permanently skipping step N.
      const orphanedRejected = sub.workflowSteps
        .filter((s: any) => s.stepOrder > stepOrder && s.status === "REJECTED")
        .map((s: any) => s.id);
      if (orphanedRejected.length > 0) {
        await prisma.workflowStep.updateMany({
          where: { id: { in: orphanedRejected } },
          data: { status: "PENDING", actedAt: null, actedByName: null, actedById: null, notes: null, committeeActions: [] },
        });
      }
    } else if (decision === "REJECTED") {
      // Reset target + all non-SKIPPED steps after it to PENDING
      const toReset = sub.workflowSteps
        .filter((s: any) => s.stepOrder >= stepOrder && s.status !== "SKIPPED")
        .map((s: any) => s.id);
      if (toReset.length > 0) {
        await prisma.workflowStep.updateMany({
          where: { id: { in: toReset } },
          data: { status: "PENDING", actedAt: null, actedByName: null, actedById: null, notes: null, committeeActions: [] },
        });
      }
    }

    const updatedSub = await getSub(id);
    if (updatedSub) {
      const hasPending  = updatedSub.workflowSteps.some((s: any) => s.status === "PENDING");
      const hasRejected = updatedSub.workflowSteps.some((s: any) => s.status === "REJECTED");
      await prisma.submission.update({ where: { id }, data: { status: hasPending ? "IN_PROGRESS" : hasRejected ? "REJECTED" : "COMPLETED" } });

      // Notify + email the responsible person of the first PENDING step after the override
      const nextPending = updatedSub.workflowSteps.find((s: any) => s.status === "PENDING");
      if (nextPending) {
        const stepName = getStepName(nextPending.stepOrder, sub.submissionType) || ROLE_LABELS[nextPending.role as keyof typeof ROLE_LABELS];
        const msg = decision === "APPROVED"
          ? `ถึงคิวของท่าน: ${stepName}`
          : `กรุณาดำเนินการอีกครั้ง: ${stepName}`;
        await notifyRole(nextPending.role, sub, msg, decision === "APPROVED" ? "pending" : "rejected");
        try {
          const specificMemberId = nextPending.role === "EXAM_COMMITTEE" ? (sub.committeeIds as string[])?.[0]
            : nextPending.role === "CO_ADVISOR" ? (sub.coAdvisorIds as string[])?.[0]
            : undefined;
          await sendStepEmail({ role: nextPending.role, sub, stepName, specificMemberId });
        } catch (e) { console.error("[email/override-next]", e); }
      }
      // Always notify student when admin overrides
      const isComplete = !hasPending && !hasRejected;
      const overrideMsg = isComplete && decision === "APPROVED"
        ? "วิทยานิพนธ์ผ่านการอนุมัติครบทุกขั้นตอน 🎉"
        : decision === "APPROVED"
        ? `ผู้ดูแลระบบอนุมัติขั้นตอนที่ ${stepOrder} แทน — คำร้องของท่านคืบหน้าแล้ว`
        : `ผู้ดูแลระบบรีเซตขั้นตอนที่ ${stepOrder} — กรุณาตรวจสอบคำร้องของท่าน`;
      await prisma.notification.create({
        data: { recipientId: sub.studentId, message: overrideMsg, detail: sub.title, submissionId: id, type: isComplete ? "approved" : decision === "APPROVED" ? "info" : "rejected" },
      });
    }

  }

  // Auto-imported THESIS_DEFENSE draft (see POST /api/submissions/auto-draft-defense) — the
  // student reviews/edits the imported committee + fills in exam logistics here, either just
  // saving (confirm: false, stays DRAFT) or confirming (confirm: true — starts the real workflow,
  // same resolution pipeline as a normal creation). Never touches pendingPeople-style DRAFTs
  // (those are gated out below), since this draft's committee was already fully resolved at
  // import time.
  else if (action === "save_defense_draft") {
    if (sub.studentId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (sub.submissionType !== "THESIS_DEFENSE" || sub.status !== "DRAFT" || ((sub.pendingPeople as any[] | null)?.length ?? 0) > 0)
      return NextResponse.json({ error: "คำร้องนี้ไม่ใช่ฉบับร่างที่นำเข้าอัตโนมัติ" }, { status: 400 });

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ error: "กรุณาระบุชื่อหัวข้อวิทยานิพนธ์" }, { status: 400 });
    if (title.length > 500) return NextResponse.json({ error: "ชื่อหัวข้อยาวเกิน 500 ตัวอักษร" }, { status: 400 });

    const examDate = typeof body.examDate === "string" ? body.examDate.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate) || isNaN(Date.parse(examDate)))
      return NextResponse.json({ error: "กรุณาระบุวันที่สอบให้ถูกต้อง" }, { status: 400 });
    const todayBkk = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    if (examDate < todayBkk)
      return NextResponse.json({ error: "วันที่สอบต้องเป็นวันนี้หรือวันในอนาคต" }, { status: 400 });
    const examTime = typeof body.examTime === "string" ? body.examTime.trim() : "";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(examTime))
      return NextResponse.json({ error: "กรุณาระบุเวลาสอบให้ถูกต้อง (เช่น 13:00)" }, { status: 400 });
    const roomNeeded = !!body.roomNeeded;
    const parkingNeeded = !!body.parkingNeeded;
    const carPlate = typeof body.carPlate === "string" ? body.carPlate.trim() : "";
    if (parkingNeeded && (!carPlate || carPlate.length > 50))
      return NextResponse.json({ error: "กรุณาระบุเลขทะเบียนรถ (ไม่เกิน 50 ตัวอักษร)" }, { status: 400 });

    const studentOwnEmails = new Set(
      [session.user.email, sub.studentEmail].filter((e): e is string => !!e).map((e) => e.trim().toLowerCase())
    );
    const people: PersonInput[] = Array.isArray(body.people) ? body.people : [];
    const peopleError = validatePeople(people, studentOwnEmails);
    if (peopleError) return NextResponse.json({ error: peopleError }, { status: 400 });

    const resolved = await resolvePeople(people);
    if (!resolved.ok)
      return NextResponse.json(
        { error: `ยังมีกรรมการที่ยังไม่มีบัญชีในระบบ: ${resolved.missingEmails.join(", ")}` },
        { status: 400 }
      );

    const confirm = body.confirm === true;

    await prisma.submission.update({
      where: { id },
      data: {
        title,
        advisorId: resolved.advisorId,
        headCommitteeId: resolved.headCommitteeId,
        committeeIds: resolved.committeeIds,
        coAdvisorIds: resolved.coAdvisorIds,
        invitedCommitteeId: resolved.invitedCommitteeId,
        programChairId: resolved.programChairId,
        invitedProfName: resolved.invitedProfName,
        invitedProfEmail: resolved.invitedProfEmail,
        invitedProfPhone: resolved.invitedProfPhone,
        examDate,
        examTime,
        roomNeeded,
        parkingNeeded,
        carPlate: parkingNeeded ? carPlate : null,
        ...(confirm ? { status: "IN_PROGRESS" } : {}),
      },
    });

    if (confirm) {
      await prisma.workflowStep.createMany({
        data: buildWorkflowSteps(sub.submissionType, resolved.coAdvisorIds, resolved.committeeIds, resolved.invitedCommitteeId)
          .map((s) => ({ ...s, submissionId: id })),
      });
      const admins = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } } });
      if (admins.length) {
        await prisma.notification.createMany({
          data: admins.map((a: any) => ({ recipientId: a.id, message: "มีคำร้องวิทยานิพนธ์ใหม่", detail: title, submissionId: id, type: "info" })),
        });
      }
    }
  }

  else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const result = await getSub(id);
  return NextResponse.json(mapSub(result));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { roles: true } });
  const deleteRoles = (dbUser?.roles ?? []) as string[];
  if (!deleteRoles.includes("ADMIN"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const target = await prisma.submission.findUnique({ where: { id }, select: { submissionType: true } });
  if (target?.submissionType === "PROPOSAL") {
    // sourceProposalId is an optional FK, so Prisma would otherwise just SetNull it on
    // delete and silently orphan a still-running defense instead of stopping it — see
    // how accept_cancel (above) deliberately cascades a proposal cancellation to its
    // linked defense. A hard delete must not be allowed to skip that check.
    const linkedDefense = await prisma.submission.findFirst({
      where: { sourceProposalId: id, status: { notIn: ["CANCELLED", "COMPLETED"] } },
      select: { id: true, title: true },
    });
    if (linkedDefense) {
      return NextResponse.json(
        { error: `ไม่สามารถลบคำร้องนี้ได้ เนื่องจากมีคำร้องขอสอบวิทยานิพนธ์ "${linkedDefense.title}" ที่สร้างจากคำร้องนี้และยังดำเนินการอยู่ กรุณายกเลิกคำร้องสอบวิทยานิพนธ์ก่อน` },
        { status: 409 },
      );
    }
  }

  // Remove the submission's files from storage first — the DB delete alone would
  // leave them orphaned in the bucket forever. Storage failure must not block the
  // delete itself (files can be swept later; a half-deleted submission cannot).
  try {
    const removed = await deleteFolder(id);
    if (removed) console.log(`[delete] removed ${removed} storage files for ${id}`);
  } catch (e) {
    console.error(`[delete] storage cleanup failed for ${id}:`, e);
  }
  await prisma.submission.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
