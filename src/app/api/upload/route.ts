import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/supabase";
import { FORM_SHORT, getStepName, ROLE_LABELS } from "@/lib/utils";
import { sendStepEmail } from "@/lib/email";
import type { FormType } from "@/types";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const submissionId = formData.get("submissionId") as string;
  const formType = formData.get("formType") as string;

  if (!file || !submissionId || !formType)
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const ALLOWED_FORM_TYPES = ["BW1A", "BW1B", "B1C", "B1D", "B2", "B3", "B4", "THESIS", "SIGNED", "FINANCE_DOC", "FINANCE_ATTACH", "EXAM_RESULT", "INVITE_LETTER", "VERY_GOOD_EVAL"];
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
  if (!isPdf && !isJpeg && !isPng)
    return NextResponse.json({ error: "อนุญาตเฉพาะไฟล์ PDF, JPEG หรือ PNG" }, { status: 400 });

  const ext = isPdf ? "pdf" : isJpeg ? "jpg" : "png";

  // Verify the caller is involved in this submission (or is an admin/program_chair) —
  // submission workflow is ADMIN's exclusive responsibility, SUPER_ADMIN doesn't get a bypass
  const sessionRoles: string[] = (session.user as any).roles ?? [session.user.role as string];
  const sessionIsProgramChair = (session.user as any).isProgramChair === true;
  const isAdminRole = sessionRoles.includes("ADMIN") || sessionIsProgramChair;
  if (!isAdminRole) {
    const subCheck = await prisma.submission.findUnique({ where: { id: submissionId } });
    if (!subCheck) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    const uid = session.user.id;
    const involved =
      subCheck.studentId === uid ||
      subCheck.advisorId === uid ||
      (subCheck.coAdvisorIds as string[]).includes(uid) ||
      (subCheck.committeeIds as string[]).includes(uid) ||
      subCheck.headCommitteeId === uid ||
      subCheck.invitedCommitteeId === uid ||
      (subCheck as any).programChairId === uid;
    if (!involved) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // SIGNED uploads (committee's own signed copies) keep their original filename — it's already descriptive.
  // All other form types get renamed: e.g. "บ.วศ.1ก_6300001.pdf"
  let displayFileName: string;
  if (formType === "SIGNED") {
    displayFileName = file.name;
  } else {
    const sub = await prisma.submission.findUnique({ where: { id: submissionId }, select: { studentCode: true } });
    const shortLabel = FORM_SHORT[formType as FormType] ?? formType;
    displayFileName = sub?.studentCode
      ? `${shortLabel}_${sub.studentCode}.${ext}`
      : `${shortLabel}.${ext}`;
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
    },
  });

  // Auto-advance PROPOSAL step 4 when FINANCE_DOC completes the parallel requirement.
  // Wrapped in try/catch so a failure here never breaks the upload response.
  if (formType === "FINANCE_DOC") {
    try {
      const subWithUploads = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: { workflowSteps: { orderBy: { stepOrder: "asc" } }, uploads: true },
      });
      if (subWithUploads?.submissionType === "PROPOSAL") {
        const step4 = subWithUploads.workflowSteps.find(
          (s: any) => s.stepOrder === 4 && s.status === "PENDING" && s.role === "STUDENT"
        );
        if (step4) {
          const types = new Set(subWithUploads.uploads.map((u: any) => u.formType));

          // Always email admin when FINANCE_DOC arrives (whether or not student has submitted yet)
          try {
            await sendStepEmail({ role: "ADMIN", sub: subWithUploads, stepName: "รับเอกสารการเงิน — ขั้นตอนที่ 4" });
          } catch (e) { console.error("[email/finance-doc-admin]", e); }

          if (types.has("B1C") && types.has("B1D") && types.has("FINANCE_DOC")) {
            const now = new Date();
            await prisma.workflowStep.update({
              where: { id: step4.id },
              data: { status: "APPROVED", actedAt: now, actedByName: "ระบบ (อัตโนมัติ)", actedById: null },
            });
            const nextStep = subWithUploads.workflowSteps.find(
              (s: any) => s.stepOrder > 4 && s.status === "PENDING"
            );
            await prisma.submission.update({
              where: { id: submissionId },
              data: { status: nextStep ? "IN_PROGRESS" : "COMPLETED" },
            });
            if (nextStep) {
              let recipientId: string | null = null;
              if (nextStep.role === "HEAD_EXAM_COMMITTEE") {
                recipientId = (subWithUploads as any).headCommitteeId ?? null;
              } else if (nextStep.role === "ADVISOR") {
                recipientId = (subWithUploads as any).advisorId ?? null;
              } else {
                const u = await prisma.user.findFirst({ where: { roles: { has: nextStep.role as any } } });
                recipientId = u?.id ?? null;
              }
              if (recipientId) {
                const stepName = getStepName(nextStep.stepOrder, "PROPOSAL") || ROLE_LABELS[nextStep.role as keyof typeof ROLE_LABELS];
                await prisma.notification.create({
                  data: { recipientId, message: `ถึงคิวของท่าน: ${stepName}`, detail: subWithUploads.title, submissionId, type: "pending" },
                });
                try { await sendStepEmail({ role: nextStep.role, sub: subWithUploads, stepName }); } catch (e) { console.error("[email/step4-auto]", e); }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("[upload/step4-auto-advance]", e);
    }
  }

  return NextResponse.json({ ...upload, uploadedAt: upload.uploadedAt.toISOString() });
}
