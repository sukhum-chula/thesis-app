import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatUserName } from "@/lib/utils";
import { buildCoverMemoDocx, buildDefenseResultMemoDocx } from "@/lib/coverMemoDoc";
import { DOCX_MIME } from "@/lib/financeDoc";
import { PROPOSAL_STEP, THESIS_STEP } from "@/lib/workflowSteps";
import { stepNumbering } from "@/lib/stepNumbering";
import { getDepartmentChairUser } from "@/lib/systemSettings";

/** The ADMIN step each submission type generates its บันทึกข้อความ at */
const MEMO_STEP: Record<string, number> = {
  PROPOSAL:       PROPOSAL_STEP.ADMIN_COVER,       // ขอส่งแบบอนุมัติโครงร่างฯ (shown as step 8)
  THESIS_DEFENSE: THESIS_STEP.ADMIN_RESULT_CHECK,  // ขอส่งผลสอบวิทยานิพนธ์ (shown as step 9)
};

/**
 * POST — ADMIN generates a submission's บันทึกข้อความส่งคณะฯ (.docx) from the submission's own data and
 * downloads it. Nothing is stored: the ADMIN converts it to PDF and uploads that as the COVER_PAGE
 * on the same step (MEMO_STEP), which the department chair then signs at the next step. Only while
 * that step is current.
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
  const memoStep = sub.submissionType ? MEMO_STEP[sub.submissionType] : undefined;
  if (!memoStep)
    return NextResponse.json({ error: "ไม่รองรับคำร้องประเภทนี้" }, { status: 400 });
  if (sub.cancelRequested)
    return NextResponse.json({ error: "คำร้องนี้มีคำขอยกเลิกที่รอการอนุมัติ" }, { status: 400 });
  const current = sub.workflowSteps.find((s) => s.status === "PENDING");
  if (sub.status !== "IN_PROGRESS" || current?.stepOrder !== memoStep)
    return NextResponse.json({ error: `สร้างบันทึกข้อความได้เฉพาะขั้นตอนที่ ${stepNumbering(sub.workflowSteps, sub.submissionType).label(memoStep)}` }, { status: 400 });

  const studentCode = sub.studentCode ?? sub.student.studentId ?? "";
  const studentName = sub.studentFullName ?? formatUserName(sub.student);
  let buffer: Buffer;
  try {
    buffer = sub.submissionType === "THESIS_DEFENSE"
      ? await buildDefenseResultMemoDocx({
          studentName,
          studentCode,
          program: sub.program,
          title: sub.title,
          chair: await getDepartmentChairUser(),
          date: new Date(),
        })
      : await buildCoverMemoDocx({
          studentName,
          studentCode,
          program: sub.program,
          title: sub.title,
          examDate: sub.examDate,
        });
  } catch (e) {
    console.error("[cover-memo/generate]", e);
    return NextResponse.json({ error: "สร้างบันทึกข้อความไม่สำเร็จ" }, { status: 500 });
  }

  const fileName = studentCode ? `บันทึกข้อความ_${studentCode}.docx` : "บันทึกข้อความ.docx";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename="cover-memo.docx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
