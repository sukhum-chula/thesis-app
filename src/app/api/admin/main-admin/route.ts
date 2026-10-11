import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setMainAdmin } from "@/lib/systemSettings";

function isAdmin(session: { user?: { roles?: string[]; role?: string } } | null) {
  const roles: string[] = session?.user?.roles ?? [session?.user?.role ?? ""];
  return !!session?.user && roles.includes("ADMIN");
}

// Admin-only: designate the ผู้รับผิดชอบหลัก — the one ADMIN account named where a specific staff
// member is needed (the UI otherwise says "เจ้าหน้าที่ภาควิชา"). Display only (see setMainAdmin()).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await req.json();

  if (userId) {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) return NextResponse.json({ error: "ไม่พบผู้ใช้งาน" }, { status: 404 });
    if (!target.roles.includes("ADMIN"))
      return NextResponse.json({ error: "ต้องเป็นบัญชีเจ้าหน้าที่ (ADMIN) เท่านั้น" }, { status: 400 });
  }

  await setMainAdmin(userId || null);

  return NextResponse.json({ success: true });
}
