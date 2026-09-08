import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatUserName } from "@/lib/utils";

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

/** Get-or-create the student's blank PROPOSAL draft — called when the student clicks "สร้าง"
 *  on the disabled template shown before any proposal exists. Unlike the pendingPeople DRAFT
 *  flavor (unresolved committee emails), this draft starts with no committee/program/exam info
 *  at all — only the student's own account fields are pre-filled — so it's told apart the same
 *  way an auto-draft defense is: `status === "DRAFT" && no pendingPeople entries`. The student
 *  then fills it in and saves/confirms via PATCH .../[id] action "save_proposal_draft".
 *  Idempotent — a second call while a non-cancelled PROPOSAL already exists just returns it. */
export async function POST() {
  const session = await auth();
  const roles: string[] = (session?.user as any)?.roles ?? [session?.user?.role ?? ""];
  if (!session?.user || !roles.includes("STUDENT"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = session.user.id;

  // Proposal-first: at most one non-cancelled PROPOSAL per student at a time.
  const existing = await prisma.submission.findFirst({
    where: { studentId: userId, submissionType: "PROPOSAL", status: { not: "CANCELLED" } },
    include: { workflowSteps: { orderBy: { stepOrder: "asc" } }, uploads: true },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return NextResponse.json(mapSub(existing));

  const account = await prisma.user.findUnique({ where: { id: userId } });
  if (!account) return NextResponse.json({ error: "ไม่พบบัญชีผู้ใช้" }, { status: 400 });

  const created = await prisma.submission.create({
    data: {
      title: "",
      submissionType: "PROPOSAL",
      status: "DRAFT",
      studentId: userId,
      studentFullName: formatUserName(account),
      studentCode: account.studentId ?? "",
      studentEmail: account.email,
      studentPhone: account.phone ?? null,
    },
    include: { workflowSteps: { orderBy: { stepOrder: "asc" } }, uploads: true },
  });

  return NextResponse.json(mapSub(created));
}
