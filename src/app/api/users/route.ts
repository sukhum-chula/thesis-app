import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { canGrantRole } from "@/lib/accountScope";
import { generatePassword, isValidPasscode, isValidThaiPhone } from "@/lib/utils";
import { sendWelcomeEmail } from "@/lib/email";
import { attachSystemSettings } from "@/lib/systemSettings";

function mapUser(u: any) {
  const roles: string[] = u.roles ?? (u.role ? [u.role] : []);
  return {
    id: u.id, name: u.name, email: u.email, roles, role: roles[0] ?? "",
    studentId: u.studentId ?? undefined,
    programChairFor: u.programChairFor ?? [],
    isFinanceContact: u.isFinanceContact ?? false,
    affiliation: u.affiliation ?? null,
    phone: u.phone ?? null,
  };
}

// Accounts a committee-picker should offer: internal faculty (PROFESSOR) and external
// examiners (EXTERNAL) — both can be named on a submission's committee.
const FACULTY_ROLES = ["PROFESSOR", "EXTERNAL"];

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionRoles: string[] = (session.user as any).roles ?? [session.user.role];

  let where: any;
  if (sessionRoles.includes("SUPER_ADMIN")) {
    // SUPER_ADMIN's remit is the admin tier only — STUDENT/PROFESSOR accounts are ADMIN's job
    where = { roles: { hasSome: ["SUPER_ADMIN", "ADMIN"] } };
  } else if (sessionRoles.includes("ADMIN")) {
    where = { roles: { hasSome: ["ADMIN", "PROFESSOR", "STUDENT"] } };
  } else {
    // Non-admins get all PROFESSOR-role users plus anyone specifically linked to
    // their own submissions (committee members may exist under a different role).
    const userId = (session.user as any).id;
    const subs = await prisma.submission.findMany({
      where: { studentId: userId },
      select: { advisorId: true, headCommitteeId: true, committeeIds: true, coAdvisorIds: true, invitedCommitteeId: true, programChairId: true },
    });
    const linkedIds = new Set<string>();
    for (const s of subs) {
      if (s.advisorId)         linkedIds.add(s.advisorId);
      if (s.headCommitteeId)   linkedIds.add(s.headCommitteeId);
      if (s.invitedCommitteeId) linkedIds.add(s.invitedCommitteeId);
      if ((s as any).programChairId) linkedIds.add((s as any).programChairId);
      for (const id of s.committeeIds ?? [])  linkedIds.add(id);
      for (const id of s.coAdvisorIds ?? [])  linkedIds.add(id);
    }
    where = linkedIds.size > 0
      ? { OR: [{ roles: { hasSome: FACULTY_ROLES as any[] } }, { id: { in: [...linkedIds] } }] }
      : { roles: { hasSome: FACULTY_ROLES as any[] } };
  }

  const users = await prisma.user.findMany({ where, orderBy: { name: "asc" } });
  const decorated = await attachSystemSettings(users);
  return NextResponse.json(decorated.map(mapUser));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const postRoles: string[] = (session?.user as any)?.roles ?? [session?.user?.role ?? ""];
  if (!session?.user || !postRoles.some((r) => ["ADMIN", "SUPER_ADMIN"].includes(r)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const {
    name, email, role, studentId, passcode: requestedPasscode,
    affiliation, phone, externalRequestId,
  } = await req.json();

  if (!name?.trim()) return NextResponse.json({ error: "กรุณากรอกชื่อ-นามสกุล" }, { status: 400 });
  if (!email?.trim()) return NextResponse.json({ error: "กรุณากรอกอีเมล" }, { status: 400 });
  if (!role)          return NextResponse.json({ error: "กรุณาเลือกบทบาท" }, { status: 400 });
  if (phone?.trim() && !isValidThaiPhone(phone))
    return NextResponse.json({ error: "เบอร์โทรศัพท์ไม่ถูกต้อง (ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0)" }, { status: 400 });
  // SUPER_ADMIN may only create SUPER_ADMIN/ADMIN accounts; ADMIN may only create
  // ADMIN/PROFESSOR/STUDENT accounts — see src/lib/accountScope.ts
  if (!canGrantRole(postRoles, role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Approving a student's ExternalCommitteeRequest reuses this exact same account-creation path
  // (see "Account creation & passcodes" in AGENTS.md — every account goes through POST /api/users)
  // rather than a separate endpoint. Verify it up front so a mismatched/stale request can't
  // silently create an unrelated account.
  let externalRequest: { id: string; email: string; requestedById: string; status: string } | null = null;
  if (externalRequestId) {
    if (role !== "EXTERNAL")
      return NextResponse.json({ error: "การอนุมัติคำขอกรรมการภายนอกต้องสร้างบัญชีบทบาท EXTERNAL เท่านั้น" }, { status: 400 });
    externalRequest = await prisma.externalCommitteeRequest.findUnique({ where: { id: externalRequestId } });
    if (!externalRequest) return NextResponse.json({ error: "ไม่พบคำขอนี้" }, { status: 404 });
    if (externalRequest.status !== "PENDING")
      return NextResponse.json({ error: "คำขอนี้ถูกดำเนินการไปแล้ว" }, { status: 400 });
    if (externalRequest.email.toLowerCase() !== email.trim().toLowerCase())
      return NextResponse.json({ error: "อีเมลไม่ตรงกับคำขอที่เลือก" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (existing) return NextResponse.json({ error: "อีเมลนี้มีในระบบแล้ว" }, { status: 409 });

  // The admin may type a passcode by hand or click "สุ่มรหัส" to fill the field with
  // generatePassword() client-side — either way it arrives here as `passcode` and is validated
  // the same way. Omitting it entirely falls back to a server-generated one (e.g. the
  // pending-professors quick-create form, which doesn't surface this field).
  let passcode: string;
  if (requestedPasscode !== undefined && requestedPasscode !== null && requestedPasscode !== "") {
    if (typeof requestedPasscode !== "string" || !isValidPasscode(requestedPasscode))
      return NextResponse.json({ error: "รหัสเข้าใช้งานต้องมีความยาว 6-72 ตัวอักษร และไม่มีช่องว่าง" }, { status: 400 });
    passcode = requestedPasscode.trim();
  } else {
    passcode = generatePassword();
  }
  const passcodeHash = await bcrypt.hash(passcode, 12);

  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      roles: role ? [role] : [],
      studentId: studentId?.trim() || null,
      affiliation: affiliation?.trim() || null,
      phone: phone?.trim() || null,
      passcodeHash,
    },
  });

  if (externalRequest) {
    await prisma.externalCommitteeRequest.update({
      where: { id: externalRequest.id },
      data: { status: "APPROVED", createdUserId: user.id },
    });
    await prisma.notification.create({
      data: {
        recipientId: externalRequest.requestedById,
        message: `คำขอเพิ่มกรรมการภายนอก "${user.name}" ได้รับการอนุมัติแล้ว — สามารถเลือกในคำร้องได้`,
        detail: user.email,
        submissionId: null,
        type: "approved",
      },
    });
  }

  const { sent } = await sendWelcomeEmail({ userId: user.id, name: user.name, email: user.email, passcode, role });

  // If this email was blocking any DRAFT submission's committee (see "Committee accounts must
  // pre-exist" in AGENTS.md), notify the student(s) whose draft is now fully resolved — the same
  // check regardless of whether the account was created via the normal "เพิ่มผู้ใช้" flow or from
  // a pending-committee entry, since both now go through this one route.
  const drafts = await prisma.submission.findMany({
    where: { status: "DRAFT" },
    select: { id: true, title: true, studentId: true, pendingPeople: true },
  });
  for (const draft of drafts) {
    const people = (draft.pendingPeople as unknown as { email?: string }[] | null) ?? [];
    if (people.length === 0) continue;
    const emails = people.map((p) => p.email?.trim().toLowerCase()).filter(Boolean) as string[];
    if (!emails.includes(user.email)) continue;

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
    }
  }

  // A brand-new account never already holds a program-chair/finance-contact assignment.
  return NextResponse.json({ ...mapUser({ ...user, programChairFor: [], isFinanceContact: false }), emailSent: sent }, { status: 201 });
}
