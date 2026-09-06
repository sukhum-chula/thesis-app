import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendWelcomeEmail } from "@/lib/email";
import { isValidEmail, isValidThaiPhone } from "@/lib/utils";
import type { PersonInput } from "@/lib/committee";

// Admin approves a professor named by a student who has no account yet — creates the account
// (with the same welcome-email flow as any other new PROFESSOR) and notifies every student whose
// DRAFT submission is now fully resolved (every named person has an account).
export async function POST(req: NextRequest) {
  const session = await auth();
  const roles: string[] = (session?.user as any)?.roles ?? [session?.user?.role ?? ""];
  if (!session?.user || !roles.includes("ADMIN"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  if (!name) return NextResponse.json({ error: "กรุณากรอกชื่อ-นามสกุล" }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ error: "รูปแบบอีเมลไม่ถูกต้อง" }, { status: 400 });
  if (phone && !isValidThaiPhone(phone))
    return NextResponse.json({ error: "เบอร์โทรศัพท์ไม่ถูกต้อง (ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0)" }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "อีเมลนี้มีบัญชีอยู่แล้ว" }, { status: 409 });

  const tempPassword = randomBytes(8).toString("hex");
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const created = await prisma.user.create({
    data: { name, email, roles: ["PROFESSOR"], passwordHash },
  });

  try {
    await sendWelcomeEmail({ userId: created.id, name: created.name, email: created.email, password: tempPassword, role: "PROFESSOR" });
  } catch (e) {
    console.error("[email/pending-professor-welcome]", email, e);
  }

  // Notify every student whose draft is now fully resolved (this was its last missing person)
  const drafts = await prisma.submission.findMany({
    where: { status: "DRAFT" },
    select: { id: true, title: true, studentId: true, pendingPeople: true },
  });
  const unblocked: string[] = [];
  for (const draft of drafts) {
    const people = (draft.pendingPeople as unknown as PersonInput[] | null) ?? [];
    if (people.length === 0) continue;
    const emails = people.map((p) => p.email?.trim().toLowerCase()).filter(Boolean) as string[];
    if (!emails.includes(email)) continue;

    const stillMissing = await prisma.user.findMany({ where: { email: { in: emails } } });
    const resolvedEmails = new Set(stillMissing.map((u) => u.email.toLowerCase()));
    if (emails.every((e) => resolvedEmails.has(e))) {
      await prisma.notification.create({
        data: {
          recipientId: draft.studentId,
          message: "คำร้องของท่านพร้อมดำเนินการต่อ — กรุณาเข้าสู่ระบบเพื่อยืนยันการส่ง",
          detail: draft.title,
          submissionId: draft.id,
          type: "info",
        },
      });
      unblocked.push(draft.id);
    }
  }

  return NextResponse.json({ id: created.id, name: created.name, email: created.email, unblockedSubmissionIds: unblocked }, { status: 201 });
}
