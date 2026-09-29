import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/supabase";
import { FORM_SHORT, formatUserName } from "@/lib/utils";
import { buildProposalFinanceDocx, DOCX_MIME, FINANCE_POSITION, type FinanceMember } from "@/lib/financeDoc";
import { keepOnlyLatestVersion } from "@/lib/uploadVersions";

/**
 * POST — ADMIN generates the PROPOSAL's เอกสารการเงินแนบกรรมการสอบ from the submission's own
 * student info + committee and stores it as a new FINANCE_ATTACH version (the file step 3's
 * finance email attaches). Only while PROPOSAL step 2 (ADMIN review) is the current step. The file
 * is single-version: generating again (or the admin uploading an edited copy) replaces it.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Roles from the DB, not the JWT — same reasoning as PATCH /api/submissions/[id]
  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { roles: true } });
  if (!dbUser) return NextResponse.json({ error: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  if (!(dbUser.roles as string[]).includes("ADMIN"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const sub = await prisma.submission.findUnique({
    where: { id },
    include: {
      student: { select: { title: true, name: true, studentId: true } },
      workflowSteps: { select: { stepOrder: true, status: true }, orderBy: { stepOrder: "asc" } },
    },
  });
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (sub.submissionType !== "PROPOSAL")
    return NextResponse.json({ error: "สร้างเอกสารการเงินได้เฉพาะคำร้องสอบโครงร่าง" }, { status: 400 });
  if (sub.cancelRequested)
    return NextResponse.json({ error: "คำร้องนี้มีคำขอยกเลิกที่รอการอนุมัติ" }, { status: 400 });
  const current = sub.workflowSteps.find((s) => s.status === "PENDING");
  if (sub.status !== "IN_PROGRESS" || current?.stepOrder !== 2)
    return NextResponse.json({ error: "สร้างเอกสารการเงินได้เฉพาะขั้นตอนที่ 2 (เจ้าหน้าที่ตรวจรับ)" }, { status: 400 });

  // Committee in the form's row order; a role with nobody in it simply produces no row
  const slots: { id: string; position: string }[] = [
    ...(sub.headCommitteeId ? [{ id: sub.headCommitteeId, position: FINANCE_POSITION.HEAD_EXAM_COMMITTEE }] : []),
    ...(sub.advisorId ? [{ id: sub.advisorId, position: FINANCE_POSITION.ADVISOR }] : []),
    ...sub.coAdvisorIds.map((uid) => ({ id: uid, position: FINANCE_POSITION.CO_ADVISOR })),
    ...sub.invitedCommitteeIds.map((uid) => ({ id: uid, position: FINANCE_POSITION.INVITED_EXAM_COMMITTEE })),
    ...sub.committeeIds.map((uid) => ({ id: uid, position: FINANCE_POSITION.EXAM_COMMITTEE })),
  ];
  const people = await prisma.user.findMany({
    where: { id: { in: slots.map((s) => s.id) } },
    select: { id: true, title: true, name: true },
  });
  const byId = new Map(people.map((p) => [p.id, p]));
  const missing = slots.filter((s) => !byId.has(s.id));
  if (missing.length)
    return NextResponse.json({ error: "มีกรรมการบางท่านไม่มีบัญชีในระบบแล้ว กรุณาแก้ไขคณะกรรมการก่อน" }, { status: 400 });
  const members: FinanceMember[] = slots.map((s) => ({ name: formatUserName(byId.get(s.id)!), position: s.position }));

  const studentCode = sub.studentCode ?? sub.student.studentId ?? "";
  let buffer: Buffer;
  try {
    buffer = await buildProposalFinanceDocx({
      studentName: sub.studentFullName ?? formatUserName(sub.student),
      studentCode,
      program: sub.program,
      members,
    });
  } catch (e) {
    console.error("[finance-attach/generate]", e);
    return NextResponse.json({ error: "สร้างเอกสารการเงินไม่สำเร็จ" }, { status: 500 });
  }

  const fileName = studentCode ? `${FORM_SHORT.FINANCE_ATTACH}_${studentCode}.docx` : `${FORM_SHORT.FINANCE_ATTACH}.docx`;
  const path = `${sub.id}/FINANCE_ATTACH_${Date.now()}.docx`;
  try {
    await uploadFile(new File([new Uint8Array(buffer)], fileName, { type: DOCX_MIME }), path);
  } catch (e) {
    console.error("[finance-attach/upload]", e);
    return NextResponse.json({ error: "บันทึกไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง" }, { status: 500 });
  }

  const upload = await prisma.formUpload.create({
    data: {
      formType: "FINANCE_ATTACH",
      fileName,
      fileSize: buffer.length,
      fileUrl: path,
      submissionId: sub.id,
      uploadedById: session.user.id,
    },
  });
  await keepOnlyLatestVersion(sub.id, "FINANCE_ATTACH", upload.id);
  return NextResponse.json({ upload: { ...upload, uploadedAt: upload.uploadedAt.toISOString() } });
}
