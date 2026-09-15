import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setDepartmentChair } from "@/lib/systemSettings";

function isAdmin(session: any) {
  const roles: string[] = session?.user?.roles ?? [session?.user?.role ?? ""];
  return !!session?.user && roles.includes("ADMIN");
}

// Admin-only: designate one PROFESSOR as หัวหน้าภาควิชา (department chair) — a single
// department-wide holder, unlike programChair:<program> which has one holder per program.
// Assigning a new user automatically replaces whoever previously held it (see
// setDepartmentChair() in src/lib/systemSettings.ts).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await req.json();

  if (userId) {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) return NextResponse.json({ error: "ไม่พบผู้ใช้งาน" }, { status: 404 });
    if (!target.roles.includes("PROFESSOR"))
      return NextResponse.json({ error: "ต้องเป็นบัญชีอาจารย์เท่านั้น" }, { status: 400 });
  }

  await setDepartmentChair(userId || null);

  return NextResponse.json({ success: true });
}
