import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

/** Get-or-create the student's THESIS_DEFENSE draft for their completed, not-yet-used PROPOSAL —
 *  called as a side effect when the student opens the "สอบวิทยานิพนธ์" tab. Committee/student info
 *  is imported straight onto the row (never through pendingPeople, since it's already resolved on
 *  the source proposal) so it lands in DRAFT with no workflow steps, purely for the student to
 *  review/edit before confirming via PATCH .../[id] action "save_defense_draft" (confirm: true).
 *  Idempotent — a second call while the draft still exists just returns it. */
export async function POST() {
  const session = await auth();
  const roles: string[] = (session?.user as any)?.roles ?? [session?.user?.role ?? ""];
  if (!session?.user || !roles.includes("STUDENT"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = session.user.id;

  // Proposal-first blocks creating a new PROPOSAL while an existing one is non-cancelled, so a
  // student can have at most one COMPLETED proposal in play at a time.
  const sourceProposal = await prisma.submission.findFirst({
    where: { studentId: userId, submissionType: "PROPOSAL", status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
  });
  if (!sourceProposal)
    return NextResponse.json({ error: "ยังไม่มีคำร้องขอสอบโครงร่างที่เสร็จสมบูรณ์" }, { status: 400 });

  const existingDefense = await prisma.submission.findFirst({
    where: { sourceProposalId: sourceProposal.id, status: { not: "CANCELLED" } },
    include: { workflowSteps: { orderBy: { stepOrder: "asc" } }, uploads: true },
  });
  if (existingDefense) return NextResponse.json(mapSub(existingDefense));

  const created = await prisma.submission.create({
    data: {
      title: sourceProposal.title,
      submissionType: "THESIS_DEFENSE",
      status: "DRAFT",
      studentId: userId,
      sourceProposalId: sourceProposal.id,
      studentFullName: sourceProposal.studentFullName,
      studentCode: sourceProposal.studentCode,
      program: sourceProposal.program,
      studentEmail: sourceProposal.studentEmail,
      studentPhone: sourceProposal.studentPhone,
      advisorId: sourceProposal.advisorId,
      headCommitteeId: sourceProposal.headCommitteeId,
      committeeIds: sourceProposal.committeeIds,
      coAdvisorIds: sourceProposal.coAdvisorIds,
      invitedCommitteeId: sourceProposal.invitedCommitteeId,
      programChairId: sourceProposal.programChairId,
      invitedProfName: sourceProposal.invitedProfName,
      invitedProfAffiliation: sourceProposal.invitedProfAffiliation,
      invitedProfEmail: sourceProposal.invitedProfEmail,
      invitedProfPhone: sourceProposal.invitedProfPhone,
    },
    include: { workflowSteps: { orderBy: { stepOrder: "asc" } }, uploads: true },
  });

  return NextResponse.json(mapSub(created));
}
