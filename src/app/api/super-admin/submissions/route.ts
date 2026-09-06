import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStepName } from "@/lib/utils";

// Read-only, system-wide submission directory for SUPER_ADMIN oversight. View-only — no
// approve/reject/override/upload, and deliberately no per-submission detail link: acting on a
// submission stays exclusively ADMIN's job (see src/lib/accountScope.ts and AGENTS.md).
export async function GET() {
  const session = await auth();
  const roles: string[] = (session?.user as any)?.roles ?? [session?.user?.role ?? ""];
  if (!session?.user || !roles.includes("SUPER_ADMIN"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const submissions = await prisma.submission.findMany({
    orderBy: { createdAt: "desc" },
    include: { workflowSteps: true },
  });

  const mapped = submissions.map((sub) => {
    const visibleSteps = sub.workflowSteps.filter((s) => s.status !== "SKIPPED");
    const doneCount = visibleSteps.filter((s) => s.status === "APPROVED").length;
    const currentStep = sub.workflowSteps.find((s) => s.status === "PENDING");
    const currentStepName = currentStep
      ? getStepName(currentStep.stepOrder, sub.submissionType) || currentStep.role
      : null;

    return {
      id: sub.id,
      title: sub.title,
      submissionType: sub.submissionType,
      status: sub.status,
      cancelRequested: sub.cancelRequested,
      studentName: sub.studentFullName,
      studentCode: sub.studentCode,
      createdAt: sub.createdAt,
      currentStepName,
      doneCount,
      totalSteps: visibleSteps.length,
    };
  });

  return NextResponse.json(mapped);
}
