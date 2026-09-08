import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidEmail, isValidThaiPhone, NAME_TITLES, formatUserName } from "@/lib/utils";

function mapRequest(r: any) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** STUDENT sees only their own requests; ADMIN sees every request (the review queue). */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roles: string[] = (session.user as any).roles ?? [session.user.role];

  const where = roles.includes("ADMIN") ? {} : { requestedById: session.user.id };
  const requests = await prisma.externalCommitteeRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(requests.map(mapRequest));
}

/** STUDENT-only: request a new กรรมการภายนอก (EXTERNAL) account — see "Committee accounts must
 *  pre-exist" in AGENTS.md. Independent of any specific submission; ADMIN reviews and either
 *  approves (creates the real account via POST /api/users, which links back here) or rejects. */
export async function POST(req: NextRequest) {
  const session = await auth();
  const roles: string[] = (session?.user as any)?.roles ?? [session?.user?.role ?? ""];
  if (!session?.user || !roles.includes("STUDENT"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { title, name, email, affiliation, phone } = await req.json();

  if (!name?.trim())  return NextResponse.json({ error: "กรุณาระบุชื่อ-นามสกุล" }, { status: 400 });
  if (!email?.trim()) return NextResponse.json({ error: "กรุณาระบุอีเมล" }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ error: "รูปแบบอีเมลไม่ถูกต้อง" }, { status: 400 });
  if (phone?.trim() && !isValidThaiPhone(phone))
    return NextResponse.json({ error: "เบอร์โทรศัพท์ไม่ถูกต้อง (ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0)" }, { status: 400 });
  if (title !== undefined && title !== null && !NAME_TITLES.includes(title))
    return NextResponse.json({ error: "คำนำหน้าชื่อไม่ถูกต้อง" }, { status: 400 });

  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) return NextResponse.json({ error: "อีเมลนี้มีบัญชีในระบบอยู่แล้ว — สามารถเลือกได้จากรายชื่อในคำร้องโดยตรง" }, { status: 409 });

  const pending = await prisma.externalCommitteeRequest.findFirst({
    where: { email: normalizedEmail, status: "PENDING" },
  });
  if (pending) return NextResponse.json({ error: "มีคำขอสำหรับอีเมลนี้รอการอนุมัติอยู่แล้ว" }, { status: 409 });

  const request = await prisma.externalCommitteeRequest.create({
    data: {
      title: title || null,
      name: name.trim(),
      email: normalizedEmail,
      affiliation: affiliation?.trim() || null,
      phone: phone?.trim() || null,
      requestedById: session.user.id,
    },
  });

  const admins = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } } });
  if (admins.length) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        recipientId: a.id,
        message: `คำขอเพิ่มกรรมการภายนอกใหม่ — ${formatUserName(request)}`,
        detail: request.email,
        submissionId: null,
        type: "pending",
      })),
    });
  }

  return NextResponse.json(mapRequest(request), { status: 201 });
}
