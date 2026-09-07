import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setFinanceContact } from "@/lib/systemSettings";

function isAdmin(session: any) {
  const roles: string[] = session?.user?.roles ?? [session?.user?.role ?? ""];
  return !!session?.user && roles.includes("ADMIN");
}

// Admin-only: designate one ADMIN-tier user as the finance contact — sendFinanceEmail()
// (src/lib/email.ts) uses that user's email as the recipient instead of the old hardcoded
// FINANCE_EMAIL env var. Assigning a new user automatically replaces whoever previously held it
// (see setFinanceContact() in src/lib/systemSettings.ts).
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

  await setFinanceContact(userId || null);

  return NextResponse.json({ success: true });
}
