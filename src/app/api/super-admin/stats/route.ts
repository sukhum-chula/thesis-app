import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Read-only, system-wide oversight numbers for SUPER_ADMIN. Deliberately counts only —
// SUPER_ADMIN has no access to individual STUDENT/PROFESSOR records or submissions
// (see src/lib/accountScope.ts), so this is the one place it can still "see" the whole system.
export async function GET() {
  const session = await auth();
  const roles: string[] = (session?.user as any)?.roles ?? [session?.user?.role ?? ""];
  if (!session?.user || !roles.includes("SUPER_ADMIN"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [superAdmin, admin, professor, student, total, inProgress, completed, rejected] = await Promise.all([
    prisma.user.count({ where: { roles: { has: "SUPER_ADMIN" } } }),
    prisma.user.count({ where: { roles: { has: "ADMIN" } } }),
    prisma.user.count({ where: { roles: { has: "PROFESSOR" } } }),
    prisma.user.count({ where: { roles: { has: "STUDENT" } } }),
    prisma.submission.count(),
    prisma.submission.count({ where: { status: "IN_PROGRESS" } }),
    prisma.submission.count({ where: { status: "COMPLETED" } }),
    prisma.submission.count({ where: { status: "REJECTED" } }),
  ]);

  return NextResponse.json({
    users: { superAdmin, admin, professor, student, total: superAdmin + admin + professor + student },
    submissions: { total, inProgress, completed, rejected },
  });
}
