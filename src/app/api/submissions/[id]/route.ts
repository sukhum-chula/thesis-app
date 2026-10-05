import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStepName, ROLE_LABELS, PROGRAM_LABELS, formatUserName, freshUploadCutoff, isHiddenFromStudent, FORM_SHORT, examResultFromNotes, examResultNote, VERY_GOOD_RESULT, DEFENSE_EXAM_RESULTS } from "@/lib/utils";
import type { FormType } from "@/types";
import { sendStepEmail, sendFinanceEmail } from "@/lib/email";
import { deleteFolder } from "@/lib/supabase";
import { buildWorkflowSteps, planCommitteeStepSync, currentTurn, THESIS_STEP, committeeRoster, previousActiveStep } from "@/lib/workflowSteps";
import { stepNumbering } from "@/lib/stepNumbering";
import { validatePeople, validateCommitteeAccountRoles, validateResolvedCommitteeAccountRoles, validateResolvedCommitteeCounts, resolvePeople, validatePeopleLenient, resolvePeoplePartial, type PersonInput } from "@/lib/committee";
import { getProgramChairUserId, getProgramChairsOfUser, getDepartmentChairUserId } from "@/lib/systemSettings";

function mapSub(s: any, viewerId: string) {
  return {
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    workflowSteps: s.workflowSteps?.map((st: any) => ({
      ...st,
      createdAt: st.createdAt.toISOString(),
      actedAt: st.actedAt?.toISOString() ?? null,
    })) ?? [],
    uploads: s.uploads
      // The submission's own student never receives its hidden (finance) documents
      ?.filter((u: { formType: string }) => viewerId !== s.studentId || !isHiddenFromStudent(s.submissionType, u.formType))
      .map((u: any) => ({
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

/** A แบบประเมินวิทยานิพนธ์ดีมาก uploaded since the Faculty email was forwarded to the student
 *  (THESIS_STEP.ADMIN_FORWARD) — what a ดีมาก defense result requires */
function hasVeryGoodEval(sub: { workflowSteps: { stepOrder: number; actedAt: Date | null }[]; uploads: { formType: string; uploadedAt: Date }[] }): boolean {
  const forwarded = sub.workflowSteps.find((s) => s.stepOrder === THESIS_STEP.ADMIN_FORWARD)?.actedAt;
  const since = forwarded ? new Date(forwarded).getTime() : 0;
  return sub.uploads.some((u) => u.formType === "VERY_GOOD_EVAL" && new Date(u.uploadedAt).getTime() > since);
}

async function notifyRole(role: string, sub: any, message: string, type: string) {
  let recipientId: string | null = null;
  if (role === "STUDENT")              recipientId = sub.studentId;
  else if (role === "ADVISOR")         recipientId = sub.advisorId;
  else if (role === "HEAD_EXAM_COMMITTEE") recipientId = sub.headCommitteeId;
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
  } else if (role === "INVITED_EXAM_COMMITTEE") {
    const firstId: string | undefined = sub.invitedCommitteeIds?.[0];
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
  } else if (role === "DEPARTMENT_CHAIR") {
    recipientId = await getDepartmentChairUserId();
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
    (sub.invitedCommitteeIds as string[]).includes(userId) ||
    (sub as any).programChairId === userId ||
    (sub.submissionType === "THESIS_DEFENSE" && (await getDepartmentChairUserId()) === userId);
  if (!isPrivileged && !isInvolved)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(mapSub(sub, userId));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { action } = body;
  const { id: userId } = session.user;
  const userName = formatUserName(session.user);

  // Always look up roles from DB — JWT role can be stale after a role change. If the id encoded
  // in the session's JWT no longer resolves to a user (e.g. the account was edited/recreated
  // since login), fail clearly instead of silently falling back to the same stale JWT roles the
  // DB lookup exists to bypass — that fallback previously surfaced as a confusing generic
  // "Forbidden" on approve/reject with no indication a re-login would fix it.
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { roles: true } });
  if (!dbUser)
    return NextResponse.json({ error: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  const userChairedPrograms = await getProgramChairsOfUser(userId);
  const userRoles: string[] = dbUser.roles as string[];
  const role: string = userRoles[0] ?? "";

  const sub = await getSub(id);
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // The department chair is involved in every defense (they sign its ใบรายงานผลการสอบ)
  const isDeptChair = sub.submissionType === "THESIS_DEFENSE" && (await getDepartmentChairUserId()) === userId;
  if ((sub as any).cancelRequested && !["accept_cancel", "decline_cancel"].includes(action))
    return NextResponse.json({ error: "คำร้องนี้มีคำขอยกเลิกที่รอการอนุมัติ ไม่สามารถดำเนินการอื่นได้ในขณะนี้" }, { status: 400 });

  const now = new Date();

  if (action === "approve") {
    // Block approval while submission is REJECTED — student must resubmit to reset the rejected step
    if (sub.status === "REJECTED")
      return NextResponse.json({ error: "คำร้องถูกปฏิเสธ — รอนิสิตยืนยันการแก้ไขก่อน" }, { status: 400 });

    const step = sub.workflowSteps.find((s: any) => s.status === "PENDING");
    if (!step) return NextResponse.json({ error: "No pending step" }, { status: 400 });

    // CO_ADVISOR, EXAM_COMMITTEE and INVITED_EXAM_COMMITTEE use sequential committee signing via /sign — block here
    if (step.role === "CO_ADVISOR" || step.role === "EXAM_COMMITTEE" || step.role === "INVITED_EXAM_COMMITTEE") {
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
      if (step.role === "PROGRAM_CHAIR")
        return (sub as any).programChairId
          ? (sub as any).programChairId === userId
          : !!sub.program && userChairedPrograms.includes(sub.program);
      if (step.role === "DEPARTMENT_CHAIR")      return isDeptChair;
      return userRoles.includes(step.role); // ADMIN, EXAM_COMMITTEE
    })();
    if (!canApprove) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Enforce required uploads before certain steps can advance
    {
      // PROPOSAL step 4: student and admin upload in parallel — only student docs required here;
      // FINANCE_DOC is checked separately and auto-advances the step when both sides are ready.
      const REQUIRED_UPLOADS: Record<string, Record<number, string[]>> = {
        PROPOSAL:       { 1: ["B1"], 2: ["FINANCE_ATTACH"], 4: ["B1"], 12: ["COVER_PAGE", "LESSPAPER_RECEIPT"] },
        THESIS_DEFENSE: {
          [THESIS_STEP.STUDENT_B2_B3]:  ["B2", "B3"],
          [THESIS_STEP.ADMIN_CHECK]:    ["FINANCE_ATTACH"],
          [THESIS_STEP.ADMIN_RELAY]:    ["COVER_PAGE"], // cover page sent to the Faculty with บ.2 + บ.3
          [THESIS_STEP.STUDENT_REPORT]: ["SIGNED", "EXAM_RESULT"], // from the Faculty email the admin forwarded
          [THESIS_STEP.ADMIN_RESULT_SEND]: ["COVER_PAGE"], // a new one (freshUploadCutoff) — sent with the result
          [THESIS_STEP.ADMIN_THESIS_CHECK]: ["COVER_PAGE"], // a new one (freshUploadCutoff) — sent with the thesis
          [THESIS_STEP.STUDENT_THESIS]: ["B4", "THESIS"],
        },
      };
      const subType = sub.submissionType ?? "PROPOSAL";
      const required = REQUIRED_UPLOADS[subType]?.[step.stepOrder] ?? [];
      // A required type that already existed before this step only counts as a newer copy
      // (PROPOSAL step 4's B1 — see freshUploadCutoff)
      const cutoff = freshUploadCutoff(sub.workflowSteps, subType, step.stepOrder);
      const uploaded = new Set(
        sub.uploads
          .filter((u) => cutoff === null || !required.includes(u.formType) || new Date(u.uploadedAt).getTime() > cutoff)
          .map((u: any) => u.formType)
      );
      const missing = required.filter((f) => !uploaded.has(f));
      if (missing.length > 0) {
        // The ADMIN check (financeStepOf): the finance file is generated by the admin, not uploaded
        if (step.role === "ADMIN" && missing.includes("FINANCE_ATTACH"))
          return NextResponse.json({ error: "กรุณากดสร้างเอกสารการเงินก่อนอนุมัติ" }, { status: 400 });
        return NextResponse.json(
          { error: `กรุณาอัปโหลดเอกสารให้ครบก่อน: ${missing.map((f) => FORM_SHORT[f as FormType] ?? f).join(", ")}` },
          { status: 400 }
        );
      }
    }

    // THESIS step 1: บ.3 is collected outside the system, one signed copy per committee member —
    // every member on the submission's committee must have their own upload (FormUpload.memberId)
    if (sub.submissionType === "THESIS_DEFENSE" && step.stepOrder === THESIS_STEP.STUDENT_B2_B3 && step.role === "STUDENT") {
      const roster = committeeRoster(sub);
      const missingIds = roster.map((m) => m.id).filter(
        (mid) => !sub.uploads.some((u) => u.formType === "B3" && u.memberId === mid)
      );
      if (missingIds.length > 0) {
        const people = await prisma.user.findMany({ where: { id: { in: missingIds } }, select: { id: true, title: true, name: true } });
        const names = missingIds.map((mid) => { const p = people.find((x) => x.id === mid); return p ? formatUserName(p) : mid; });
        return NextResponse.json(
          { error: `กรุณาอัปโหลด บ.3 ที่ลงนามแล้วให้ครบทุกท่าน — ยังขาด: ${names.join(", ")}` },
          { status: 400 }
        );
      }
    }

    // THESIS student-report step: the student picks the exam result (the note's `ผลการสอบ: …` line);
    // ดีมาก also needs แบบประเมินวิทยานิพนธ์ดีมาก, uploaded since the Faculty email was forwarded
    if (sub.submissionType === "THESIS_DEFENSE" && step.stepOrder === THESIS_STEP.STUDENT_REPORT) {
      const result = examResultFromNotes(body.notes);
      if (!result || !(DEFENSE_EXAM_RESULTS as readonly string[]).includes(result))
        return NextResponse.json({ error: "กรุณาเลือกผลการสอบวิทยานิพนธ์" }, { status: 400 });
      if (result === VERY_GOOD_RESULT && !hasVeryGoodEval(sub))
        return NextResponse.json({ error: "ผลการสอบ ดีมาก — กรุณาอัปโหลดแบบประเมินวิทยานิพนธ์ดีมากก่อน" }, { status: 400 });
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
            : nextStep.role === "INVITED_EXAM_COMMITTEE" ? (sub.invitedCommitteeIds as string[])?.[0]
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
      // After the THESIS program chair's บ.2 signature, notify all admins to collect + send to Faculty
      if (step.stepOrder === THESIS_STEP.CHAIR_B2 && step.role === "PROGRAM_CHAIR" && sub.submissionType === "THESIS_DEFENSE") {
        try {
          const adminUsers = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } } });
          if (adminUsers.length) {
            await prisma.notification.createMany({
              data: adminUsers.map((a) => ({ recipientId: a.id, message: "บ.2 + บ.3 ลงนามครบแล้ว — กรุณานำส่งไปยังคณะ", detail: sub.title, submissionId: id, type: "info" })),
            });
          }
        } catch (e) { console.error("[email/thesis/chair-b2]", e); }
      }
    }

    // THESIS finance email: the ADMIN's step-2 approval, once the finance form is generated (moved
    // from the program chair's บ.2 signature 2026-09-30, same as PROPOSAL)
    if (step.stepOrder === THESIS_STEP.ADMIN_CHECK && step.role === "ADMIN" && sub.submissionType === "THESIS_DEFENSE") {
      try {
        const invitedIds = ((sub as any).invitedCommitteeIds as string[] | undefined) ?? [];
        const [advisorUser, headUser, committeeUsers, invitedUsers, financeAttach] = await Promise.all([
          sub.advisorId ? prisma.user.findUnique({ where: { id: sub.advisorId }, select: { title: true, name: true } }) : null,
          sub.headCommitteeId ? prisma.user.findUnique({ where: { id: sub.headCommitteeId }, select: { title: true, name: true } }) : null,
          (sub.committeeIds as string[] | undefined)?.length
            ? prisma.user.findMany({ where: { id: { in: sub.committeeIds as string[] } }, select: { title: true, name: true } })
            : Promise.resolve([]),
          invitedIds.length
            ? prisma.user.findMany({ where: { id: { in: invitedIds } }, select: { title: true, name: true, email: true, affiliation: true, phone: true } })
            : Promise.resolve([]),
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
          invitedProfs: invitedUsers.map((u) => ({
            name: formatUserName(u),
            affiliation: u.affiliation ?? undefined,
            email: u.email ?? undefined,
            phone: u.phone ?? undefined,
          })),
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

    // PROPOSAL finance paperwork is finished at step 2: the ADMIN generates (and may edit) the
    // FINANCE_ATTACH there, and approving step 2 is what emails it to the finance contact.
    // Nothing from step 3 on involves finance.
    if (step.stepOrder === 2 && step.role === "ADMIN" && sub.submissionType === "PROPOSAL") {
      try {
        const invitedIds = ((sub as any).invitedCommitteeIds as string[] | undefined) ?? [];
        const [advisorUser, headUser, committeeUsers, invitedUsers, financeAttach] = await Promise.all([
          sub.advisorId ? prisma.user.findUnique({ where: { id: sub.advisorId }, select: { title: true, name: true } }) : null,
          sub.headCommitteeId ? prisma.user.findUnique({ where: { id: sub.headCommitteeId }, select: { title: true, name: true } }) : null,
          (sub.committeeIds as string[] | undefined)?.length
            ? prisma.user.findMany({ where: { id: { in: sub.committeeIds as string[] } }, select: { title: true, name: true } })
            : Promise.resolve([]),
          invitedIds.length
            ? prisma.user.findMany({ where: { id: { in: invitedIds } }, select: { title: true, name: true, email: true, affiliation: true, phone: true } })
            : Promise.resolve([]),
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
          invitedProfs: invitedUsers.map((u) => ({
            name: formatUserName(u),
            affiliation: u.affiliation ?? undefined,
            email: u.email ?? undefined,
            phone: u.phone ?? undefined,
          })),
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
      return NextResponse.json({ error: "คำร้องถูกปฏิเสธ — รอนิสิตยืนยันการแก้ไขก่อน" }, { status: 400 });

    const step = sub.workflowSteps.find((s: any) => s.status === "PENDING");
    if (!step) return NextResponse.json({ error: "No pending step" }, { status: 400 });

    // Use the step's role label so the message names the actual role (e.g. "อาจารย์ที่ปรึกษาร่วม"),
    // not the user's DB role ("อาจารย์") which is the same for all faculty types.
    const stepRoleLabel = ROLE_LABELS[step.role as keyof typeof ROLE_LABELS] ?? step.role;
    const byLabel = stepRoleLabel;

    const isPrivileged = userRoles.includes("ADMIN");

    // ADMIN steps offer อนุมัติ + ส่งกลับ only — ส่งกลับ (`return_to_prev`) replaces ปฏิเสธ there
    if (step.role === "ADMIN")
      return NextResponse.json({ error: "ขั้นตอนนี้ใช้การส่งกลับแทนการปฏิเสธ" }, { status: 400 });

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
        (sub.invitedCommitteeIds as string[]).includes(userId) ||
        (sub as any).programChairId === userId ||
        isDeptChair;
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

    const prevStep = previousActiveStep(sub.workflowSteps, step);

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
    // The student always hears about a send-back — unless notifyRole above already told them
    if (prevStep.role !== "STUDENT") {
      await prisma.notification.create({
        data: { recipientId: sub.studentId, message: notifyNote, detail: sub.title, submissionId: id, type: "rejected" },
      });
    }
  }

  else if (action === "request_cancel") {
    if (sub.studentId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (sub.status === "CANCELLED")
      return NextResponse.json({ error: "คำร้องนี้ถูกยกเลิกไปแล้ว" }, { status: 400 });
    // A completed submission is a finished record — it can no longer be cancelled.
    if (sub.status === "COMPLETED")
      return NextResponse.json({ error: "คำร้องนี้เสร็จสิ้นแล้ว ไม่สามารถยกเลิกได้" }, { status: 400 });
    await prisma.submission.update({ where: { id }, data: { cancelRequested: true, cancelRequestedAt: now } });
    await notifyRole("ADMIN", sub, "นิสิตขอยกเลิกคำร้อง — รอการอนุมัติ", "warning");
  }

  else if (action === "accept_cancel") {
    if (!userRoles.includes("ADMIN")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!(sub as any).cancelRequested) return NextResponse.json({ error: "ไม่มีคำขอยกเลิกที่รอดำเนินการ" }, { status: 400 });
    // Defense-in-depth: a pending request freezes every other action, so a submission can't reach
    // COMPLETED with one open — but a request filed before this rule existed could still be. The
    // admin declines it instead, which clears the flag.
    if (sub.status === "COMPLETED")
      return NextResponse.json({ error: "คำร้องนี้เสร็จสิ้นแล้ว ไม่สามารถยกเลิกได้ — กรุณาปฏิเสธคำขอยกเลิก" }, { status: 400 });

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

  else if (action === "resubmit") {
    if (sub.studentId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const rejectedStep = sub.workflowSteps.find((s: any) => s.status === "REJECTED");
    if (!rejectedStep) return NextResponse.json({ error: "No rejected step" }, { status: 400 });

    // The advisor rejected the exam result: the student may send a corrected one, which replaces the
    // result line on the student-report step's note (where defenseExamResult reads it)
    if (body.examResult !== undefined) {
      const reportStep = sub.workflowSteps.find((s: any) => s.stepOrder === THESIS_STEP.STUDENT_REPORT);
      if (sub.submissionType !== "THESIS_DEFENSE" || rejectedStep.stepOrder !== THESIS_STEP.ADVISOR_RESULT || !reportStep)
        return NextResponse.json({ error: "แก้ไขผลการสอบได้เฉพาะเมื่ออาจารย์ที่ปรึกษาปฏิเสธผลการสอบ" }, { status: 400 });
      if (!(DEFENSE_EXAM_RESULTS as readonly string[]).includes(body.examResult))
        return NextResponse.json({ error: "ผลการสอบไม่ถูกต้อง" }, { status: 400 });
      if (body.examResult === VERY_GOOD_RESULT && !hasVeryGoodEval(sub))
        return NextResponse.json({ error: "ผลการสอบ ดีมาก — กรุณาอัปโหลดแบบประเมินวิทยานิพนธ์ดีมากก่อน" }, { status: 400 });
      const rest = (reportStep.notes ?? "").split("\n").slice(1).join("\n");
      await prisma.workflowStep.update({
        where: { id: reportStep.id },
        data: { notes: [examResultNote(body.examResult), rest].filter(Boolean).join("\n") },
      });
    }

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
        : rejectedStep.role === "INVITED_EXAM_COMMITTEE" ? (sub.invitedCommitteeIds as string[])?.[0]
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

    // Check the committee rules against the state this save would leave behind, but only when it
    // actually touches something that can break them. `program` counts: switching a submission to
    // PHD invalidates an internal ประธานกรรมการสอบ without touching a committee field. Skipping the
    // check otherwise means an unrelated edit (an exam date, say) is never blocked by a committee
    // that predates the rules.
    const touchesCommittee =
      b.advisorId !== undefined || b.headCommitteeId !== undefined || b.coAdvisorIds !== undefined ||
      b.committeeIds !== undefined || b.invitedCommitteeIds !== undefined || b.programChairId !== undefined ||
      b.program !== undefined;
    if (touchesCommittee) {
      const next = {
        advisorId:           b.advisorId           !== undefined ? (b.advisorId || null)       : sub.advisorId,
        headCommitteeId:     b.headCommitteeId     !== undefined ? (b.headCommitteeId || null) : sub.headCommitteeId,
        programChairId:      b.programChairId      !== undefined ? (b.programChairId || null)  : sub.programChairId,
        coAdvisorIds:        b.coAdvisorIds        !== undefined ? b.coAdvisorIds              : sub.coAdvisorIds,
        committeeIds:        b.committeeIds        !== undefined ? b.committeeIds              : sub.committeeIds,
        invitedCommitteeIds: b.invitedCommitteeIds !== undefined ? b.invitedCommitteeIds       : sub.invitedCommitteeIds,
      };
      // Role counts — only past DRAFT: a draft is allowed to be incomplete (the student's own draft
      // save skips counts for the same reason), and it gets the full check when it's confirmed.
      const countError = sub.status === "DRAFT" ? null : validateResolvedCommitteeCounts(next);
      if (countError) return NextResponse.json({ error: countError }, { status: 400 });
      const committeeError = await validateResolvedCommitteeAccountRoles(
        next,
        b.program !== undefined ? (b.program || null) : sub.program
      );
      if (committeeError) return NextResponse.json({ error: committeeError }, { status: 400 });
    }
    const submissionUpdate = prisma.submission.update({
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
        invitedCommitteeIds:  b.invitedCommitteeIds  !== undefined ? b.invitedCommitteeIds        : undefined,
        examDate:             b.examDate             !== undefined ? (b.examDate             || null) : undefined,
        examTime:             b.examTime             !== undefined ? (b.examTime             || null) : undefined,
        roomNeeded:           b.roomNeeded           !== undefined ? Boolean(b.roomNeeded)          : undefined,
        parkingNeeded:        b.parkingNeeded        !== undefined ? Boolean(b.parkingNeeded)        : undefined,
        carPlate:             b.carPlate             !== undefined ? (b.carPlate             || null) : undefined,
      },
    });

    // Multi-member steps snapshot their member list when built, and signing reads only that
    // snapshot — bring every still-open step in line with the edited committee in the same
    // transaction, so a step never keeps waiting on someone who is no longer on it.
    const stepPatches = planCommitteeStepSync(
      sub.workflowSteps as any[],
      {
        coAdvisorIds:        b.coAdvisorIds        !== undefined ? b.coAdvisorIds        : sub.coAdvisorIds,
        committeeIds:        b.committeeIds        !== undefined ? b.committeeIds        : sub.committeeIds,
        invitedCommitteeIds: b.invitedCommitteeIds !== undefined ? b.invitedCommitteeIds : sub.invitedCommitteeIds,
      },
      sub.status,
      now
    );
    if (stepPatches.length === 0) {
      await submissionUpdate;
    } else {
      await prisma.$transaction([
        submissionUpdate,
        ...stepPatches.map((p) => prisma.workflowStep.update({ where: { id: p.id }, data: p.data as any })),
      ]);

      // A sync can skip the rejected step (its last co-advisor removed) or approve the current one
      // (its last unsigned member removed), so re-derive the status from the steps as they are now.
      const updated = await prisma.submission.findUnique({
        where: { id },
        include: { workflowSteps: { orderBy: { stepOrder: "asc" } } },
      });
      if (updated) {
        const hasRejected = updated.workflowSteps.some((s) => s.status === "REJECTED");
        const hasPending  = updated.workflowSteps.some((s) => s.status === "PENDING");
        const status = hasRejected ? "REJECTED" : hasPending ? "IN_PROGRESS" : "COMPLETED";
        if (status !== updated.status)
          await prisma.submission.update({ where: { id }, data: { status } });

        // Tell whoever it's now waiting on, if the edit changed that.
        const before = currentTurn(sub.workflowSteps as any[]);
        const after  = currentTurn(updated.workflowSteps as any[]);
        // (No cancel-request check needed: the top-level guard already refuses admin_update then.)
        if (after && (after.stepId !== before?.stepId || after.memberId !== before?.memberId)) {
          const turnStep = updated.workflowSteps.find((s) => s.id === after.stepId)!;
          const stepName = getStepName(turnStep.stepOrder, updated.submissionType) || ROLE_LABELS[after.role as keyof typeof ROLE_LABELS];
          const msg = `ถึงคิวของท่าน: ${stepName}`;
          if (after.memberId) {
            await prisma.notification.create({
              data: { recipientId: after.memberId, message: msg, detail: updated.title, submissionId: id, type: "pending" },
            });
          } else {
            await notifyRole(after.role, updated, msg, "pending");
          }
          try {
            await sendStepEmail({ role: after.role, sub: updated, stepName, specificMemberId: after.memberId });
          } catch (e) { console.error("[email/committee-edit]", e); }
        }
        if (status === "COMPLETED") {
          await prisma.notification.create({
            data: { recipientId: updated.studentId, message: "วิทยานิพนธ์ผ่านการอนุมัติครบทุกขั้นตอน 🎉", detail: updated.title, submissionId: id, type: "approved" },
          });
        }
      }
    }
  }

  else if (action === "admin_reset") {
    if (!userRoles.includes("ADMIN")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // Revive ALL steps, not just non-SKIPPED ones — cancel marks pending steps SKIPPED, so a
    // reset that skips them would truncate the workflow (it would "complete" after the
    // pre-cancel steps). This also makes reset the way to undo a cancelled submission.
    // CO_ADVISOR steps stay SKIPPED when the submission has no co-advisors.
    const hasCoAdvisors = ((sub.coAdvisorIds as string[]) ?? []).length > 0;
    // Re-snapshot each multi-member step's member list from the submission's current committee —
    // the lists were taken when the steps were built and may predate a committee edit.
    for (const [role, ids] of [
      ["CO_ADVISOR", sub.coAdvisorIds], ["EXAM_COMMITTEE", sub.committeeIds], ["INVITED_EXAM_COMMITTEE", sub.invitedCommitteeIds],
    ] as const) {
      await prisma.workflowStep.updateMany({
        where: { submissionId: id, role },
        data: { committeeMembers: [...new Set(((ids as string[]) ?? []).filter(Boolean))] },
      });
    }
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
            : nextPending.role === "INVITED_EXAM_COMMITTEE" ? (sub.invitedCommitteeIds as string[])?.[0]
            : undefined;
          await sendStepEmail({ role: nextPending.role, sub, stepName, specificMemberId });
        } catch (e) { console.error("[email/override-next]", e); }
      }
      // Always notify student when admin overrides
      const isComplete = !hasPending && !hasRejected;
      // Same number the student sees on screen (5.1–5.x sub-steps), not the internal stepOrder
      const stepLabel = stepNumbering(sub.workflowSteps, sub.submissionType).label(stepOrder) || String(stepOrder);
      const overrideMsg = isComplete && decision === "APPROVED"
        ? "วิทยานิพนธ์ผ่านการอนุมัติครบทุกขั้นตอน 🎉"
        : decision === "APPROVED"
        ? `ผู้ดูแลระบบอนุมัติขั้นตอนที่ ${stepLabel} แทน — คำร้องของท่านคืบหน้าแล้ว`
        : `ผู้ดูแลระบบรีเซตขั้นตอนที่ ${stepLabel} — กรุณาตรวจสอบคำร้องของท่าน`;
      await prisma.notification.create({
        data: { recipientId: sub.studentId, message: overrideMsg, detail: sub.title, submissionId: id, type: isComplete ? "approved" : decision === "APPROVED" ? "info" : "rejected" },
      });
    }

  }

  // Blank PROPOSAL draft (see POST /api/submissions/auto-draft-proposal) — the student fills in
  // the title/program/committee/exam logistics here, either just saving (confirm: false, stays
  // DRAFT) or confirming (confirm: true — starts the real workflow).
  else if (action === "save_proposal_draft") {
    if (sub.studentId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (sub.submissionType !== "PROPOSAL" || sub.status !== "DRAFT")
      return NextResponse.json({ error: "คำร้องนี้ไม่ใช่ฉบับร่างที่รอกรอกข้อมูล" }, { status: 400 });

    const confirm = body.confirm === true;

    // A plain save (confirm: false) is allowed to be incomplete — a student may leave the tab and
    // come back later. Only formats that are outright wrong (not merely blank) are rejected either
    // way; "must be present" checks only apply when actually confirming into the real workflow.
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (title.length > 500) return NextResponse.json({ error: "ชื่อหัวข้อยาวเกิน 500 ตัวอักษร" }, { status: 400 });
    if (confirm && !title) return NextResponse.json({ error: "กรุณาระบุชื่อหัวข้อวิทยานิพนธ์" }, { status: 400 });

    const program = typeof body.program === "string" ? body.program : "";
    if (program && !["PHD", "ME_MECH", "ME_CPS"].includes(program))
      return NextResponse.json({ error: "หลักสูตรไม่ถูกต้อง" }, { status: 400 });
    if (confirm && !program) return NextResponse.json({ error: "กรุณาเลือกหลักสูตร" }, { status: 400 });

    const studentPhone = typeof body.studentPhone === "string" ? body.studentPhone.trim() : "";

    const examDate = typeof body.examDate === "string" ? body.examDate.trim() : "";
    if (examDate && (!/^\d{4}-\d{2}-\d{2}$/.test(examDate) || isNaN(Date.parse(examDate))))
      return NextResponse.json({ error: "กรุณาระบุวันที่สอบให้ถูกต้อง" }, { status: 400 });
    if (confirm) {
      if (!examDate) return NextResponse.json({ error: "กรุณาระบุวันที่สอบ" }, { status: 400 });
      const todayBkk = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
      if (examDate < todayBkk)
        return NextResponse.json({ error: "วันที่สอบต้องเป็นวันนี้หรือวันในอนาคต" }, { status: 400 });
    }
    const examTime = typeof body.examTime === "string" ? body.examTime.trim() : "";
    if (examTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(examTime))
      return NextResponse.json({ error: "กรุณาระบุเวลาสอบให้ถูกต้อง (เช่น 13:00)" }, { status: 400 });
    if (confirm && !examTime) return NextResponse.json({ error: "กรุณาระบุเวลาสอบ" }, { status: 400 });

    const roomNeeded = !!body.roomNeeded;
    const parkingNeeded = !!body.parkingNeeded;
    const carPlate = typeof body.carPlate === "string" ? body.carPlate.trim() : "";
    if (carPlate.length > 50) return NextResponse.json({ error: "เลขทะเบียนรถยาวเกินไป" }, { status: 400 });
    if (confirm && parkingNeeded && !carPlate)
      return NextResponse.json({ error: "กรุณาระบุเลขทะเบียนรถ" }, { status: 400 });

    const studentOwnEmails = new Set(
      [session.user.email, sub.studentEmail].filter((e): e is string => !!e).map((e) => e.trim().toLowerCase())
    );
    const people: PersonInput[] = Array.isArray(body.people) ? body.people : [];

    const baseData = {
      title,
      program: program || null,
      studentPhone: studentPhone || null,
      examDate: examDate || null,
      examTime: examTime || null,
      roomNeeded,
      parkingNeeded,
      carPlate: parkingNeeded ? (carPlate || null) : null,
    };

    if (!confirm) {
      const peopleError = validatePeopleLenient(people, studentOwnEmails);
      if (peopleError) return NextResponse.json({ error: peopleError }, { status: 400 });
      // A draft may be incomplete, but it may not carry a member who cannot be used — a deleted
      // account, or one that no longer fits the degree rule. Those used to be dropped silently.
      const invalidError = await validateCommitteeAccountRoles(people, program, { requireAccount: true });
      if (invalidError) return NextResponse.json({ error: invalidError }, { status: 400 });
      const partial = await resolvePeoplePartial(people);

      await prisma.submission.update({
        where: { id },
        data: {
          ...baseData,
          advisorId: partial.advisorId,
          headCommitteeId: partial.headCommitteeId,
          committeeIds: partial.committeeIds,
          coAdvisorIds: partial.coAdvisorIds,
          invitedCommitteeIds: partial.invitedCommitteeIds,
          programChairId: partial.programChairId,
        },
      });
    } else {
      const peopleError = validatePeople(people, studentOwnEmails);
      if (peopleError) return NextResponse.json({ error: peopleError }, { status: 400 });
      const accountRoleError = await validateCommitteeAccountRoles(people, program);
      if (accountRoleError) return NextResponse.json({ error: accountRoleError }, { status: 400 });
      const resolved = await resolvePeople(people);
      if (!resolved.ok)
        return NextResponse.json(
          { error: `ยังมีกรรมการที่ยังไม่มีบัญชีในระบบ: ${resolved.missingEmails.join(", ")}` },
          { status: 400 }
        );

      await prisma.submission.update({
        where: { id },
        data: {
          ...baseData,
          advisorId: resolved.advisorId,
          headCommitteeId: resolved.headCommitteeId,
          committeeIds: resolved.committeeIds,
          coAdvisorIds: resolved.coAdvisorIds,
          invitedCommitteeIds: resolved.invitedCommitteeIds,
          programChairId: resolved.programChairId,
          status: "IN_PROGRESS",
        },
      });

      await prisma.workflowStep.createMany({
        data: buildWorkflowSteps(sub.submissionType, resolved.coAdvisorIds, resolved.committeeIds, resolved.invitedCommitteeIds)
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

  // Auto-imported THESIS_DEFENSE draft (see POST /api/submissions/auto-draft-defense) — the
  // student reviews/edits the imported committee + fills in exam logistics here, either just
  // saving (confirm: false, stays DRAFT) or confirming (confirm: true — starts the real workflow,
  // same resolution pipeline as a normal creation).
  else if (action === "save_defense_draft") {
    if (sub.studentId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (sub.submissionType !== "THESIS_DEFENSE" || sub.status !== "DRAFT")
      return NextResponse.json({ error: "คำร้องนี้ไม่ใช่ฉบับร่างที่นำเข้าอัตโนมัติ" }, { status: 400 });

    const confirm = body.confirm === true;

    // Same relaxation as save_proposal_draft — a plain save may be incomplete; "must be present"
    // checks only apply when confirming into the real workflow.
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (title.length > 500) return NextResponse.json({ error: "ชื่อหัวข้อยาวเกิน 500 ตัวอักษร" }, { status: 400 });
    if (confirm && !title) return NextResponse.json({ error: "กรุณาระบุชื่อหัวข้อวิทยานิพนธ์" }, { status: 400 });

    const examDate = typeof body.examDate === "string" ? body.examDate.trim() : "";
    if (examDate && (!/^\d{4}-\d{2}-\d{2}$/.test(examDate) || isNaN(Date.parse(examDate))))
      return NextResponse.json({ error: "กรุณาระบุวันที่สอบให้ถูกต้อง" }, { status: 400 });
    if (confirm) {
      if (!examDate) return NextResponse.json({ error: "กรุณาระบุวันที่สอบ" }, { status: 400 });
      const todayBkk = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
      if (examDate < todayBkk)
        return NextResponse.json({ error: "วันที่สอบต้องเป็นวันนี้หรือวันในอนาคต" }, { status: 400 });
    }
    const examTime = typeof body.examTime === "string" ? body.examTime.trim() : "";
    if (examTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(examTime))
      return NextResponse.json({ error: "กรุณาระบุเวลาสอบให้ถูกต้อง (เช่น 13:00)" }, { status: 400 });
    if (confirm && !examTime) return NextResponse.json({ error: "กรุณาระบุเวลาสอบ" }, { status: 400 });

    const roomNeeded = !!body.roomNeeded;
    const parkingNeeded = !!body.parkingNeeded;
    const carPlate = typeof body.carPlate === "string" ? body.carPlate.trim() : "";
    if (carPlate.length > 50) return NextResponse.json({ error: "เลขทะเบียนรถยาวเกินไป" }, { status: 400 });
    if (confirm && parkingNeeded && !carPlate)
      return NextResponse.json({ error: "กรุณาระบุเลขทะเบียนรถ" }, { status: 400 });

    const studentOwnEmails = new Set(
      [session.user.email, sub.studentEmail].filter((e): e is string => !!e).map((e) => e.trim().toLowerCase())
    );
    const people: PersonInput[] = Array.isArray(body.people) ? body.people : [];

    const baseData = {
      title,
      examDate: examDate || null,
      examTime: examTime || null,
      roomNeeded,
      parkingNeeded,
      carPlate: parkingNeeded ? (carPlate || null) : null,
    };

    if (!confirm) {
      const peopleError = validatePeopleLenient(people, studentOwnEmails);
      if (peopleError) return NextResponse.json({ error: peopleError }, { status: 400 });
      // Same rule as the proposal draft above — an unusable member blocks the save outright.
      const invalidError = await validateCommitteeAccountRoles(people, sub.program, { requireAccount: true });
      if (invalidError) return NextResponse.json({ error: invalidError }, { status: 400 });
      const partial = await resolvePeoplePartial(people);

      await prisma.submission.update({
        where: { id },
        data: {
          ...baseData,
          advisorId: partial.advisorId,
          headCommitteeId: partial.headCommitteeId,
          committeeIds: partial.committeeIds,
          coAdvisorIds: partial.coAdvisorIds,
          invitedCommitteeIds: partial.invitedCommitteeIds,
          programChairId: partial.programChairId,
        },
      });
    } else {
      const peopleError = validatePeople(people, studentOwnEmails);
      if (peopleError) return NextResponse.json({ error: peopleError }, { status: 400 });
      // A defense inherits its program from the source proposal and never edits it here.
      const accountRoleError = await validateCommitteeAccountRoles(people, sub.program);
      if (accountRoleError) return NextResponse.json({ error: accountRoleError }, { status: 400 });
      const resolved = await resolvePeople(people);
      if (!resolved.ok)
        return NextResponse.json(
          { error: `ยังมีกรรมการที่ยังไม่มีบัญชีในระบบ: ${resolved.missingEmails.join(", ")}` },
          { status: 400 }
        );

      await prisma.submission.update({
        where: { id },
        data: {
          ...baseData,
          advisorId: resolved.advisorId,
          headCommitteeId: resolved.headCommitteeId,
          committeeIds: resolved.committeeIds,
          coAdvisorIds: resolved.coAdvisorIds,
          invitedCommitteeIds: resolved.invitedCommitteeIds,
          programChairId: resolved.programChairId,
          status: "IN_PROGRESS",
        },
      });

      await prisma.workflowStep.createMany({
        data: buildWorkflowSteps(sub.submissionType, resolved.coAdvisorIds, resolved.committeeIds, resolved.invitedCommitteeIds)
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
  return NextResponse.json(mapSub(result, userId));
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
    // delete and silently orphan the defense. Any linked defense — whatever its status,
    // COMPLETED and CANCELLED included — blocks the delete; the defense must be deleted first.
    const linkedDefense = await prisma.submission.findFirst({
      where: { sourceProposalId: id },
      select: { id: true, title: true },
    });
    if (linkedDefense) {
      return NextResponse.json(
        { error: `ไม่สามารถลบคำร้องนี้ได้ เนื่องจากมีคำร้องขอสอบวิทยานิพนธ์ "${linkedDefense.title}" ที่สร้างจากคำร้องนี้ กรุณาลบคำร้องขอสอบวิทยานิพนธ์ก่อน` },
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
