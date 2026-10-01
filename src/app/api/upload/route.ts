import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/supabase";
import { FORM_SHORT, formFileKind, isSingleVersionForm, formatUserName } from "@/lib/utils";
import type { FormType } from "@/types";
import { keepOnlyLatestVersion } from "@/lib/uploadVersions";
import { allCommitteeIds, isPerMemberForm, THESIS_STEP } from "@/lib/workflowSteps";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const submissionId = formData.get("submissionId") as string;
  const formType = formData.get("formType") as string;
  const memberIdRaw = formData.get("memberId");
  const memberId = typeof memberIdRaw === "string" && memberIdRaw ? memberIdRaw : null;

  if (!file || !submissionId || !formType)
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const ALLOWED_FORM_TYPES = ["B1", "B1A", "B1B", "B1C", "B1D", "B2", "B3", "B4", "THESIS", "SIGNED", "FINANCE_DOC", "FINANCE_ATTACH", "EXAM_RESULT", "INVITE_LETTER", "VERY_GOOD_EVAL", "COVER_PAGE"];
  if (!ALLOWED_FORM_TYPES.includes(formType))
    return NextResponse.json({ error: "Invalid form type" }, { status: 400 });

  const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "ไฟล์มีขนาดใหญ่เกิน 20MB" }, { status: 400 });

  // Server-side magic-byte validation — do not trust client-supplied MIME type alone
  const buffer = Buffer.from(await file.arrayBuffer());
  const isPdf  = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46; // %PDF
  const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8;
  const isPng  = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  // .docx is a ZIP (magic bytes 50 4B 03 04) whose entry names are stored uncompressed — a Word document
  // always contains word/document.xml, which tells it apart from any other ZIP.
  const isDocx = buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04
    && buffer.includes("word/document.xml");

  // Per-form format rule, shared with the client picker (formFileKind in lib/utils.ts)
  let ext: string;
  if (formFileKind(formType) === "docx") {
    if (!isDocx || !/\.docx$/i.test(file.name))
      return NextResponse.json({ error: "อนุญาตเฉพาะไฟล์ Word (.docx)" }, { status: 400 });
    ext = "docx";
  } else if (formType === "B1") {
    if (!isPdf) return NextResponse.json({ error: "อนุญาตเฉพาะไฟล์ PDF" }, { status: 400 });
    ext = "pdf";
  } else {
    if (!isPdf && !isJpeg && !isPng)
      return NextResponse.json({ error: "อนุญาตเฉพาะไฟล์ PDF, JPEG หรือ PNG" }, { status: 400 });
    ext = isPdf ? "pdf" : isJpeg ? "jpg" : "png";
  }

  // Verify the caller is involved in this submission (or is an admin/program_chair) —
  // submission workflow is ADMIN's exclusive responsibility, SUPER_ADMIN doesn't get a bypass
  const sessionRoles: string[] = (session.user as any).roles ?? [session.user.role as string];
  const sessionProgramChairFor = ((session.user as any).programChairFor as string[] | null | undefined) ?? [];
  const subCheck = await prisma.submission.findUnique({ where: { id: submissionId } });
  if (!subCheck) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (subCheck.status === "CANCELLED")
    return NextResponse.json({ error: "คำร้องนี้ถูกยกเลิกแล้ว" }, { status: 400 });
  if ((subCheck as any).cancelRequested)
    return NextResponse.json({ error: "คำร้องนี้มีคำขอยกเลิกที่รอการอนุมัติ" }, { status: 400 });
  const isAdminRole = sessionRoles.includes("ADMIN") || (!!subCheck.program && sessionProgramChairFor.includes(subCheck.program));
  if (!isAdminRole) {
    const uid = session.user.id;
    const involved =
      subCheck.studentId === uid ||
      subCheck.advisorId === uid ||
      (subCheck.coAdvisorIds as string[]).includes(uid) ||
      (subCheck.committeeIds as string[]).includes(uid) ||
      subCheck.headCommitteeId === uid ||
      (subCheck.invitedCommitteeIds as string[]).includes(uid) ||
      (subCheck as any).programChairId === uid;
    if (!involved) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // PROPOSAL files that only the ADMIN uploads, and only at their own step: the finance
  // attachment at stepOrder 2 (generated, optionally edited and re-uploaded) and the Faculty cover
  // page at stepOrder 12 (shown as step 8).
  // THESIS_DEFENSE: the finance attachment is the ADMIN's check-step file too (THESIS_STEP.ADMIN_CHECK,
  // step 2), and the cover page that goes to the Faculty with บ.2 + บ.3 is the relay step's
  // (THESIS_STEP.ADMIN_RELAY, step 4).
  const ADMIN_ONLY_AT_STEP: Record<string, Record<string, { step: number; label: string }>> = {
    PROPOSAL: {
      FINANCE_ATTACH: { step: 2,  label: "เอกสารการเงินของคำร้องสอบโครงร่างอัปโหลดได้โดยเจ้าหน้าที่ในขั้นตอนที่ 2 เท่านั้น" },
      COVER_PAGE:     { step: 12, label: "ใบปะหน้าอัปโหลดได้โดยเจ้าหน้าที่ในขั้นตอนที่ 8 เท่านั้น" },
    },
    THESIS_DEFENSE: {
      FINANCE_ATTACH: { step: THESIS_STEP.ADMIN_CHECK, label: `เอกสารการเงินของคำร้องสอบวิทยานิพนธ์อัปโหลดได้โดยเจ้าหน้าที่ในขั้นตอนที่ ${THESIS_STEP.ADMIN_CHECK} เท่านั้น` },
      COVER_PAGE:     { step: THESIS_STEP.ADMIN_RELAY, label: `ใบปะหน้าอัปโหลดได้โดยเจ้าหน้าที่ในขั้นตอนที่ ${THESIS_STEP.ADMIN_RELAY} เท่านั้น` },
    },
  };
  const adminOnly = ADMIN_ONLY_AT_STEP[subCheck.submissionType ?? "PROPOSAL"]?.[formType];
  if (adminOnly) {
    const current = await prisma.workflowStep.findFirst({
      where: { submissionId, status: "PENDING" }, orderBy: { stepOrder: "asc" }, select: { stepOrder: true },
    });
    if (!sessionRoles.includes("ADMIN") || subCheck.status !== "IN_PROGRESS" || current?.stepOrder !== adminOnly.step)
      return NextResponse.json({ error: adminOnly.label }, { status: 400 });
  }

  // Per-member forms (the defense's บ.3, one signed copy per committee member) must name a member
  // of this submission's committee; every other upload carries no member.
  let memberName: string | null = null;
  if (isPerMemberForm(subCheck.submissionType, formType)) {
    if (!memberId || !allCommitteeIds(subCheck).includes(memberId))
      return NextResponse.json({ error: "กรุณาระบุกรรมการของไฟล์ บ.3 นี้" }, { status: 400 });
    const member = await prisma.user.findUnique({ where: { id: memberId }, select: { title: true, name: true } });
    memberName = member ? formatUserName(member) : null;
  }

  // SIGNED uploads (committee's own signed copies) keep their original filename — it's already descriptive.
  // All other form types get renamed: e.g. "บ.วศ.1ก_6300001.pdf"
  let displayFileName: string;
  if (formType === "SIGNED") {
    displayFileName = file.name;
  } else {
    const sub = await prisma.submission.findUnique({ where: { id: submissionId }, select: { studentCode: true } });
    const shortLabel = FORM_SHORT[formType as FormType] ?? formType;
    const memberPart = memberName ? `_${memberName}` : "";
    displayFileName = sub?.studentCode
      ? `${shortLabel}_${sub.studentCode}${memberPart}.${ext}`
      : `${shortLabel}${memberPart}.${ext}`;
  }

  const safeFormType = formType.replace(/[^A-Z0-9_]/g, "");
  const path = `${submissionId}/${safeFormType}_${Date.now()}.${ext}`;
  let fileUrl: string | undefined;

  try {
    await uploadFile(file, path);
    // Bucket is private — store the storage path, not a public URL. Resolved to a
    // short-lived signed URL on demand via GET /api/upload/[uploadId]/signed-url.
    fileUrl = path;
  } catch {
    // Store without URL if Supabase storage not configured yet
  }

  const upload = await prisma.formUpload.create({
    data: {
      formType: formType as any,
      fileName: displayFileName,
      fileSize: file.size,
      fileUrl: fileUrl ?? null,
      submissionId,
      uploadedById: session.user.id,
      memberId: isPerMemberForm(subCheck.submissionType, formType) ? memberId : null,
    },
  });

  if (isSingleVersionForm(subCheck.submissionType, formType))
    await keepOnlyLatestVersion(submissionId, formType as FormType, upload.id);

  return NextResponse.json({ ...upload, uploadedAt: upload.uploadedAt.toISOString() });
}
