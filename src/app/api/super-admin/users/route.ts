import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Read-only, system-wide user directory for SUPER_ADMIN oversight — every account,
// including STUDENT/PROFESSOR. This is view-only: management of STUDENT/PROFESSOR/ADMIN
// accounts still belongs exclusively to ADMIN (POST/PATCH/DELETE stay gated by
// src/lib/accountScope.ts and are untouched by this route).
const ROLE_SORT_ORDER: Record<string, number> = {
  SUPER_ADMIN: 0,
  ADMIN: 1,
  PROFESSOR: 2,
  STUDENT: 3,
};

function primaryRole(roles: string[]): string {
  return roles.find((r) => r in ROLE_SORT_ORDER) ?? roles[0] ?? "";
}

export async function GET() {
  const session = await auth();
  const roles: string[] = (session?.user as any)?.roles ?? [session?.user?.role ?? ""];
  if (!session?.user || !roles.includes("SUPER_ADMIN"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });

  const mapped = users
    .map((u) => ({
      id: u.id,
      title: u.title ?? null,
      name: u.name,
      email: u.email,
      roles: u.roles,
      role: primaryRole(u.roles),
      studentId: u.studentId ?? undefined,
    }))
    .sort((a, b) => {
      const roleDiff = (ROLE_SORT_ORDER[a.role] ?? 9) - (ROLE_SORT_ORDER[b.role] ?? 9);
      return roleDiff !== 0 ? roleDiff : a.name.localeCompare(b.name, "th");
    });

  return NextResponse.json(mapped);
}
