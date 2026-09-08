import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendExamReminderEmail } from "@/lib/email";
import { getProgramChairUserId } from "@/lib/systemSettings";
import { formatUserName } from "@/lib/utils";

export const runtime = "nodejs";

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const todayStr    = new Date().toISOString().slice(0, 10);
  const target14Str = addDays(todayStr, 14);
  const target7Str  = addDays(todayStr, 7);

  const submissions = await prisma.submission.findMany({
    where: {
      status: { in: ["IN_PROGRESS", "DRAFT"] },
      examDate: { in: [target14Str, target7Str] },
    },
    include: { workflowSteps: { orderBy: { stepOrder: "asc" } } },
  });

  const admins = await prisma.user.findMany({
    where: { roles: { has: "ADMIN" } },
    select: { id: true },
  });
  const adminIds = admins.map((a) => a.id);

  let sent14 = 0;
  let sent7   = 0;

  for (const sub of submissions) {
    if (!sub.examDate) continue;
    const examDisplay = sub.examDate + (sub.examTime ? ` เวลา ${sub.examTime} น.` : "");

    // ── 14-day reminder ──────────────────────────────────────────────────────
    if (sub.examDate === target14Str) {
      const msg = "แจ้งเตือน: วันสอบอีก 14 วัน";
      const exists = await prisma.notification.findFirst({
        where: { submissionId: sub.id, message: msg },
      });
      if (!exists) {
        const recipIds = Array.from(
          new Set([sub.studentId, ...adminIds, ...(sub.advisorId ? [sub.advisorId] : [])])
        );
        await prisma.notification.createMany({
          data: recipIds.map((rid) => ({
            recipientId: rid,
            message: msg,
            detail: `${sub.title} — วันที่สอบ: ${examDisplay}`,
            submissionId: sub.id,
            type: "warning",
          })),
        });

        const student = await prisma.user.findUnique({
          where: { id: sub.studentId },
          select: { id: true, title: true, name: true, email: true },
        });
        if (student) {
          await sendExamReminderEmail({
            recipientId:    student.id,
            recipientName:  formatUserName(student),
            recipientEmail: student.email,
            submissionId:   sub.id,
            thesisTitle:    sub.title,
            studentDisplay: sub.studentFullName ?? formatUserName(student),
            examDate:       sub.examDate,
            examTime:       sub.examTime,
            daysUntil:      14,
            redirectTo:     `/dashboard/student/${sub.id}`,
          });
        }
        sent14++;
      }
    }

    // ── 7-day reminder ───────────────────────────────────────────────────────
    if (sub.examDate === target7Str) {
      const msg = "แจ้งเตือน: เหลือ 7 วันก่อนวันสอบ — กรุณาดำเนินการให้แล้วเสร็จ";
      const exists = await prisma.notification.findFirst({
        where: { submissionId: sub.id, message: msg },
      });
      if (!exists) {
        const recipIds = new Set<string>([
          sub.studentId,
          ...adminIds,
          ...(sub.advisorId ? [sub.advisorId] : []),
        ]);

        // Notify whoever holds the current pending step
        const pendingStep = sub.workflowSteps.find((s) => s.status === "PENDING");
        if (pendingStep) {
          const role = pendingStep.role;
          if (role === "ADVISOR"               && sub.advisorId)           recipIds.add(sub.advisorId);
          if (role === "HEAD_EXAM_COMMITTEE"   && sub.headCommitteeId)     recipIds.add(sub.headCommitteeId);
          if (role === "INVITED_EXAM_COMMITTEE"&& sub.invitedCommitteeId)  recipIds.add(sub.invitedCommitteeId);
          if (role === "EXAM_COMMITTEE"        && sub.committeeIds?.[0])   recipIds.add(sub.committeeIds[0]);
          if (role === "CO_ADVISOR"            && sub.coAdvisorIds?.[0])   recipIds.add(sub.coAdvisorIds[0]);
          if (role === "PROGRAM_CHAIR") {
            if ((sub as any).programChairId) {
              recipIds.add((sub as any).programChairId);
            } else if (sub.program) {
              const chairId = await getProgramChairUserId(sub.program);
              if (chairId) recipIds.add(chairId);
            }
          }
        }

        await prisma.notification.createMany({
          data: Array.from(recipIds).map((rid) => ({
            recipientId: rid,
            message: msg,
            detail: `${sub.title} — วันที่สอบ: ${examDisplay} — ทุกขั้นตอนต้องเสร็จสิ้นก่อนวันสอบ`,
            submissionId: sub.id,
            type: "warning",
          })),
        });

        const student = await prisma.user.findUnique({
          where: { id: sub.studentId },
          select: { id: true, title: true, name: true, email: true },
        });
        if (student) {
          await sendExamReminderEmail({
            recipientId:    student.id,
            recipientName:  formatUserName(student),
            recipientEmail: student.email,
            submissionId:   sub.id,
            thesisTitle:    sub.title,
            studentDisplay: sub.studentFullName ?? formatUserName(student),
            examDate:       sub.examDate,
            examTime:       sub.examTime,
            daysUntil:      7,
            redirectTo:     `/dashboard/student/${sub.id}`,
          });
        }
        sent7++;
      }
    }
  }

  return NextResponse.json({ ok: true, sent14, sent7 });
}
