import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidEmail, isValidStudentId, isValidThaiPhone } from "@/lib/utils";
import { buildWorkflowSteps } from "@/lib/workflowSteps";
import { validatePeople, resolvePeople, type PersonInput } from "@/lib/committee";
import { getProgramChairsOfUser } from "@/lib/systemSettings";

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

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: userId } = session.user;
  if (!userId) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const userRoles: string[] = (session.user as any).roles ?? [session.user.role as string];
  const chairedPrograms = await getProgramChairsOfUser(userId);
  // Submission workflow is ADMIN's exclusive responsibility — SUPER_ADMIN is account/user management only
  const isAdmin = userRoles.includes("ADMIN");

  let where: any = {};
  if (!isAdmin) {
    // Involvement-based: show all submissions where user is directly assigned, plus every
    // submission in any program they're a designated ประธานหลักสูตร for (a professor may chair
    // more than one program)
    const or: any[] = [
      { studentId: userId },
      { advisorId: userId },
      { coAdvisorIds: { hasSome: [userId] } },
      { committeeIds: { hasSome: [userId] } },
      { headCommitteeId: userId },
      { invitedCommitteeId: userId },
      { programChairId: userId },
    ];
    if (chairedPrograms.length) or.push({ program: { in: chairedPrograms } });
    where = { OR: or };
  }
  // ADMIN sees all (no where filter)

  const submissions = await prisma.submission.findMany({
    where,
    include: { workflowSteps: { orderBy: { stepOrder: "asc" } }, uploads: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(submissions.map(mapSub));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const postRoles: string[] = (session?.user as any)?.roles ?? [session?.user?.role ?? ""];
  if (!session?.user || !postRoles.includes("STUDENT"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const data = await req.json();
  const userId = session.user.id;

  // ── Field validation — the form checks these too, but the API must hold on its own ──
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!title)
    return NextResponse.json({ error: "กรุณาระบุชื่อหัวข้อวิทยานิพนธ์" }, { status: 400 });
  if (title.length > 500)
    return NextResponse.json({ error: "ชื่อหัวข้อยาวเกิน 500 ตัวอักษร" }, { status: 400 });
  if (data.submissionType !== "PROPOSAL" && data.submissionType !== "THESIS_DEFENSE")
    return NextResponse.json({ error: "ประเภทคำร้องไม่ถูกต้อง" }, { status: 400 });
  const isDefense = data.submissionType === "THESIS_DEFENSE";
  const studentFullName = typeof data.studentFullName === "string" ? data.studentFullName.trim() : "";
  if (!studentFullName || studentFullName.length > 200)
    return NextResponse.json({ error: "กรุณาระบุชื่อ-นามสกุล (ไม่เกิน 200 ตัวอักษร)" }, { status: 400 });
  const studentCode = typeof data.studentCode === "string" ? data.studentCode.trim() : "";
  if (!isValidStudentId(studentCode))
    return NextResponse.json({ error: "รหัสนิสิตต้องเป็นตัวเลข 10 หลัก" }, { status: 400 });
  if (!["PHD", "ME_MECH", "ME_CPS"].includes(data.program))
    return NextResponse.json({ error: "กรุณาเลือกหลักสูตร" }, { status: 400 });
  const studentEmail = typeof data.studentEmail === "string" ? data.studentEmail.trim() : "";
  if (!isValidEmail(studentEmail))
    return NextResponse.json({ error: "รูปแบบอีเมลของนิสิตไม่ถูกต้อง" }, { status: 400 });
  const studentPhone = typeof data.studentPhone === "string" ? data.studentPhone.trim() : "";
  if (studentPhone && !isValidThaiPhone(studentPhone))
    return NextResponse.json({ error: "เบอร์โทรศัพท์ไม่ถูกต้อง (ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0)" }, { status: 400 });
  const examDate = typeof data.examDate === "string" ? data.examDate.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate) || isNaN(Date.parse(examDate)))
    return NextResponse.json({ error: "กรุณาระบุวันที่สอบให้ถูกต้อง" }, { status: 400 });
  // "Today" in Thailand (UTC+7) — the server runs in UTC
  const todayBkk = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  if (examDate < todayBkk)
    return NextResponse.json({ error: "วันที่สอบต้องเป็นวันนี้หรือวันในอนาคต" }, { status: 400 });
  const examTime = typeof data.examTime === "string" ? data.examTime.trim() : "";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(examTime))
    return NextResponse.json({ error: "กรุณาระบุเวลาสอบให้ถูกต้อง (เช่น 13:00)" }, { status: 400 });
  const parkingNeeded = data.parkingNeeded ?? false;
  const carPlate = typeof data.carPlate === "string" ? data.carPlate.trim() : "";
  if (parkingNeeded && (!carPlate || carPlate.length > 50))
    return NextResponse.json({ error: "กรุณาระบุเลขทะเบียนรถ (ไม่เกิน 50 ตัวอักษร)" }, { status: 400 });

  // ── PROPOSAL: only one active proposal per student at a time — cancel the old one first ──
  if (!isDefense) {
    const activeProposal = await prisma.submission.findFirst({
      where: { studentId: userId, submissionType: "PROPOSAL", status: { not: "CANCELLED" } },
    });
    if (activeProposal)
      return NextResponse.json(
        { error: "คุณมีคำร้องขอสอบโครงร่างที่ใช้งานอยู่แล้ว กรุณายกเลิกคำร้องเดิมก่อนยื่นใหม่" },
        { status: 400 }
      );
  }

  // ── THESIS_DEFENSE: must import committee/student info from an existing completed PROPOSAL ──
  let sourceProposal: Awaited<ReturnType<typeof prisma.submission.findUnique>> | null = null;
  if (isDefense) {
    const sourceProposalId = typeof data.sourceProposalId === "string" ? data.sourceProposalId : "";
    if (!sourceProposalId)
      return NextResponse.json({ error: "กรุณาเลือกคำร้องขอสอบโครงร่างที่เสร็จสมบูรณ์แล้ว" }, { status: 400 });
    sourceProposal = await prisma.submission.findUnique({ where: { id: sourceProposalId } });
    if (!sourceProposal || sourceProposal.studentId !== userId || sourceProposal.submissionType !== "PROPOSAL")
      return NextResponse.json({ error: "ไม่พบคำร้องขอสอบโครงร่างที่เลือก" }, { status: 400 });
    if (sourceProposal.status !== "COMPLETED")
      return NextResponse.json({ error: "คำร้องขอสอบโครงร่างต้องเสร็จสมบูรณ์ก่อนจึงจะยื่นขอสอบวิทยานิพนธ์ได้" }, { status: 400 });
    const existingDefense = await prisma.submission.findFirst({
      where: { sourceProposalId: sourceProposal.id, status: { not: "CANCELLED" } },
    });
    if (existingDefense)
      return NextResponse.json({ error: "มีคำร้องขอสอบวิทยานิพนธ์ที่ใช้งานอยู่แล้วสำหรับข้อเสนอนี้" }, { status: 400 });
  }

  const studentOwnEmails = new Set(
    [session.user.email, studentEmail]
      .filter(Boolean)
      .map((e: string) => e.trim().toLowerCase())
  );

  // ── Committee people: every professor must already have an account. The student enters
  //    name/email/role/phone for everyone responsible for their thesis — for a PROPOSAL that's
  //    entered fresh; for a THESIS_DEFENSE it's prefilled from the source proposal but still
  //    editable, and edits here never touch the proposal's own row (see §THESIS_DEFENSE below).
  //    If any email doesn't resolve to an existing account, nothing is created — the submission
  //    is saved as a DRAFT (no committee fields, no workflow steps) until an admin creates the
  //    missing account(s) and the student explicitly continues (`action: "continue_draft"`).
  const people: PersonInput[] = Array.isArray(data.people) ? data.people : [];
  const peopleError = validatePeople(people, studentOwnEmails);
  if (peopleError) return NextResponse.json({ error: peopleError }, { status: 400 });

  const resolved = await resolvePeople(people);

  // Student info + title actually stored — a defense overrides the student-info fields from the
  // source proposal (ignoring anything the client sent) so the two stay consistent. Committee
  // fields, however, always come from `people` above — never copied from the proposal directly —
  // so an edited defense committee can never write back to the proposal's own row.
  const finalTitle         = title;
  let finalStudentFullName = studentFullName;
  let finalStudentCode     = studentCode;
  let finalProgram: string | null | undefined = data.program;
  let finalStudentEmail    = studentEmail;
  let finalStudentPhone    = studentPhone;
  if (isDefense && sourceProposal) {
    finalStudentFullName = sourceProposal.studentFullName ?? studentFullName;
    finalStudentCode     = sourceProposal.studentCode ?? studentCode;
    finalProgram         = sourceProposal.program ?? data.program;
    finalStudentEmail    = sourceProposal.studentEmail ?? studentEmail;
    finalStudentPhone    = sourceProposal.studentPhone ?? studentPhone;
  }

  const baseData = {
    title: finalTitle,
    submissionType: data.submissionType,
    studentId: userId,
    sourceProposalId: isDefense ? sourceProposal!.id : null,
    studentFullName: finalStudentFullName,
    studentCode: finalStudentCode,
    program: finalProgram as any,
    studentEmail: finalStudentEmail,
    studentPhone: finalStudentPhone || null,
    examDate,
    examTime,
    roomNeeded: data.roomNeeded ?? false,
    parkingNeeded,
    carPlate: parkingNeeded ? carPlate : null,
  };

  let submission: Awaited<ReturnType<typeof prisma.submission.create>>;
  if (!resolved.ok) {
    submission = await prisma.submission.create({
      data: { ...baseData, status: "DRAFT", pendingPeople: people as any },
      include: { workflowSteps: { orderBy: { stepOrder: "asc" } }, uploads: true },
    });
    const admins = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } } });
    if (admins.length) {
      await prisma.notification.createMany({
        data: admins.map((a) => ({
          recipientId: a.id,
          message: "มีคำร้องใหม่ — รอสร้างบัญชีให้อาจารย์/กรรมการที่ยังไม่มีในระบบ",
          detail: data.title,
          submissionId: submission.id,
          type: "info",
        })),
      });
    }
  } else {
    submission = await prisma.submission.create({
      data: {
        ...baseData,
        status: "IN_PROGRESS",
        advisorId: resolved.advisorId,
        headCommitteeId: resolved.headCommitteeId,
        committeeIds: resolved.committeeIds,
        coAdvisorIds: resolved.coAdvisorIds,
        invitedCommitteeId: resolved.invitedCommitteeId,
        programChairId: resolved.programChairId,
        invitedProfName: resolved.invitedProfName,
        invitedProfAffiliation: null,
        invitedProfEmail: resolved.invitedProfEmail,
        invitedProfPhone: resolved.invitedProfPhone,
        workflowSteps: {
          create: buildWorkflowSteps(data.submissionType, resolved.coAdvisorIds, resolved.committeeIds, resolved.invitedCommitteeId),
        },
      },
      include: { workflowSteps: { orderBy: { stepOrder: "asc" } }, uploads: true },
    });
    // Step 1 starts as PENDING — student must upload required files and click submit.
    // The approve action will notify step 2 automatically when step 1 is completed.
    const admins = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } } });
    if (admins.length) {
      await prisma.notification.createMany({
        data: admins.map((a) => ({ recipientId: a.id, message: "มีคำร้องวิทยานิพนธ์ใหม่", detail: data.title, submissionId: submission.id, type: "info" })),
      });
    }
  }

  const updated = await prisma.submission.findUnique({
    where: { id: submission.id },
    include: { workflowSteps: { orderBy: { stepOrder: "asc" } }, uploads: true },
  });

  return NextResponse.json(mapSub(updated));
}
