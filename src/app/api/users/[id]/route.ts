import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { canManageAccount, canGrantRole } from "@/lib/accountScope";
import { generatePassword, isValidPasscode, isValidEmail, NAME_TITLES, formatUserName, STATUS_LABELS } from "@/lib/utils";
import { sendPasscodeResetEmail, sendEmailChangedNotice } from "@/lib/email";
import { attachSystemSettings, clearUserFromSystemSettings } from "@/lib/systemSettings";

function mapUser(u: any) {
  const roles: string[] = u.roles ?? (u.role ? [u.role] : []);
  return { id: u.id, title: u.title ?? null, name: u.name, email: u.email, roles, role: roles[0] ?? "", studentId: u.studentId ?? undefined, programChairFor: u.programChairFor ?? [], isFinanceContact: u.isFinanceContact ?? false, isDepartmentChair: u.isDepartmentChair ?? false };
}

function sessionRoles(session: any): string[] {
  return (session?.user as any)?.roles ?? [session?.user?.role ?? ""];
}

const PRIVILEGED_ROLES = ["ADMIN", "SUPER_ADMIN"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const sRoles = sessionRoles(session);
  if (!session?.user || !sRoles.some((r) => PRIVILEGED_ROLES.includes(r)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "ไม่พบผู้ใช้งาน" }, { status: 404 });

  // See src/lib/accountScope.ts: SUPER_ADMIN manages SUPER_ADMIN/ADMIN accounts only;
  // ADMIN manages ADMIN/PROFESSOR/STUDENT accounts only.
  if (!canManageAccount(sRoles, target.roles))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const data: any = {};

  if (body.role !== undefined) {
    if (!canGrantRole(sRoles, body.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // Setting role replaces entire roles array with single role
    data.roles = [body.role];
  }

  if (body.roles !== undefined) {
    if ((body.roles as string[]).some((r) => !canGrantRole(sRoles, r)))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    data.roles = body.roles;
  }

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 200)
      return NextResponse.json({ error: "กรุณากรอกชื่อ-นามสกุล (ไม่เกิน 200 ตัวอักษร)" }, { status: 400 });
    data.name = name;
  }

  if (body.title !== undefined) {
    if (body.title !== null && !NAME_TITLES.includes(body.title))
      return NextResponse.json({ error: "คำนำหน้าชื่อไม่ถูกต้อง" }, { status: 400 });
    data.title = body.title || null;
  }

  if (body.studentId !== undefined) {
    const sid = typeof body.studentId === "string" ? body.studentId.trim() : "";
    // Allow clearing studentId by sending empty string
    if (sid && !/^\d{10}$/.test(sid))
      return NextResponse.json({ error: "รหัสนิสิตต้องเป็นตัวเลข 10 หลัก" }, { status: 400 });
    data.studentId = sid || null;
  }

  // Email doubles as the login identifier (auth.ts looks users up by it), so a change here
  // is effectively handing over the account to whoever controls the new address — validate
  // format, enforce uniqueness, and notify both the old and new address once it's applied.
  let emailChange: { oldEmail: string; newEmail: string } | null = null;
  if (body.email !== undefined) {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !isValidEmail(email))
      return NextResponse.json({ error: "กรุณากรอกอีเมลให้ถูกต้อง" }, { status: 400 });
    if (email !== target.email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== target.id)
        return NextResponse.json({ error: "อีเมลนี้มีในระบบแล้ว" }, { status: 409 });
      data.email = email;
      emailChange = { oldEmail: target.email, newEmail: email };
    }
  }

  let newPasscode: string | null = null;
  if (body.resetPasscode === true) {
    // The admin may type the new passcode by hand or click "สุ่มรหัส" to fill it with
    // generatePassword() client-side; either way it arrives here as `passcode`. Omitting it
    // falls back to a server-generated one.
    if (body.passcode !== undefined && body.passcode !== null && body.passcode !== "") {
      if (typeof body.passcode !== "string" || !isValidPasscode(body.passcode))
        return NextResponse.json({ error: "รหัสเข้าใช้งานต้องมีความยาว 6-72 ตัวอักษร และไม่มีช่องว่าง" }, { status: 400 });
      newPasscode = String(body.passcode).trim();
    } else {
      newPasscode = generatePassword();
    }
    data.passcodeHash = await bcrypt.hash(newPasscode, 12);
  }

  const user = await prisma.user.update({ where: { id }, data });

  // Both the passcode reset and the email change above already took effect regardless of what
  // follows — a mail failure here must never roll back or block the account update, only be
  // reported back so the admin knows to relay the new passcode / re-notify some other way.
  let passcodeEmailSent: boolean | undefined;
  if (newPasscode) {
    const { sent } = await sendPasscodeResetEmail({
      userId: user.id,
      name: formatUserName(user),
      email: user.email,
      passcode: newPasscode,
      role: user.roles[0] ?? "",
    });
    passcodeEmailSent = sent;
  }

  let emailChangeNoticesSent: boolean | undefined;
  if (emailChange) {
    const { oldSent, newSent } = await sendEmailChangedNotice({
      userId: user.id,
      name: formatUserName(user),
      oldEmail: emailChange.oldEmail,
      newEmail: emailChange.newEmail,
    });
    emailChangeNoticesSent = oldSent && newSent;
  }

  const [decorated] = await attachSystemSettings([user]);
  return NextResponse.json({ ...mapUser(decorated), passcodeEmailSent, emailChangeNoticesSent });
}

// The three FKs to users(id) that actually refuse a delete, verified against pg_constraint rather
// than read off prisma/schema.prisma — Prisma's default referential action depends on optionality,
// so a relation with no explicit `onDelete` is RESTRICT only when it is *required*:
//   submissions.studentId · form_uploads.uploadedById · signatures.userId   → RESTRICT (blocking)
//   submissions.advisorId · workflow_steps.actedById                        → SET NULL (not blocking)
// Keep this list in step with those constraints: counting a non-blocking relation here would
// refuse a delete the database would happily perform.
//
// Returned as one human-readable Thai phrase per blocker, with a per-status breakdown for
// submissions so a blocking DRAFT is named as such (`draftOnly` marks the case an admin can clear
// themselves). ExternalCommitteeRequest is deliberately absent — both its FKs cascade/null out.
async function describeDeleteBlockers(userId: string): Promise<{ text: string; draftOnly: boolean }[]> {
  const [asStudent, uploads, signatures] = await Promise.all([
    prisma.submission.groupBy({ by: ["status"], where: { studentId: userId }, _count: { _all: true } }),
    prisma.formUpload.count({ where: { uploadedById: userId } }),
    prisma.signature.count({ where: { userId } }),
  ]);

  const submissionTotal = asStudent.reduce((n, r) => n + r._count._all, 0);
  const breakdown = asStudent
    .map((r) => `${STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status} ${r._count._all}`)
    .join(", ");

  return [
    submissionTotal > 0
      ? {
          text: `คำร้องที่เป็นเจ้าของ ${submissionTotal} รายการ (${breakdown})`,
          draftOnly: asStudent.every((r) => r.status === "DRAFT"),
        }
      : null,
    uploads > 0 ? { text: `เอกสารที่อัปโหลด ${uploads} ไฟล์`, draftOnly: false } : null,
    signatures > 0 ? { text: `ลายเซ็น ${signatures} รายการ`, draftOnly: false } : null,
  ].filter((b): b is { text: string; draftOnly: boolean } => b !== null);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const sRoles = sessionRoles(session);
  if (!session?.user || !sRoles.some((r) => PRIVILEGED_ROLES.includes(r)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "ไม่พบผู้ใช้งาน" }, { status: 404 });
  if (!canManageAccount(sRoles, target.roles))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Count what still references this account *before* attempting the delete, so the admin is
  // told exactly what is blocking it. Reacting to Prisma's P2003 alone can only say "something
  // references this user" — and the most common blocker is invisible from the user list: an
  // empty DRAFT submission (created by one click of "+ สร้างร่างคำร้อง") isn't counted by the
  // กำลังดำเนินการ/เสร็จสิ้น/ถูกปฏิเสธ stats on the row, so the account reads as 0/0/0.
  const blockers = await describeDeleteBlockers(id);
  if (blockers.length > 0) {
    const draftsOnly = blockers.every((b) => b.draftOnly);
    return NextResponse.json(
      {
        error:
          `ไม่สามารถลบผู้ใช้งานนี้ได้ เนื่องจากยังมีข้อมูลที่เกี่ยวข้องอยู่ในระบบ: ${blockers.map((b) => b.text).join(" · ")}` +
          (draftsOnly
            ? " — คำร้องฉบับร่างสามารถลบได้จากแท็บ “จัดการคำร้อง” แล้วจึงลบผู้ใช้งานนี้อีกครั้ง"
            : " กรุณาตรวจสอบข้อมูลดังกล่าวก่อน"),
        blockers: blockers.map((b) => b.text),
      },
      { status: 409 }
    );
  }

  try {
    await prisma.user.delete({ where: { id } });
  } catch (err) {
    // Fallback for anything describeDeleteBlockers() doesn't know about (a new relation added
    // without updating it, or a row created between the count above and this delete).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json(
        {
          error:
            "ไม่สามารถลบผู้ใช้งานนี้ได้ เนื่องจากมีคำร้อง เอกสาร หรือประวัติการดำเนินการที่เกี่ยวข้องอยู่ในระบบ",
        },
        { status: 409 }
      );
    }
    throw err;
  }

  // The deleted account may have held a program-chair/finance-contact assignment — never leave
  // a dangling reference, and never delete the setting row itself (see systemSettings.ts).
  await clearUserFromSystemSettings(id);

  return NextResponse.json({ success: true });
}
