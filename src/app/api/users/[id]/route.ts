import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { canManageAccount, canGrantRole } from "@/lib/accountScope";
import { generatePassword, isValidPasscode } from "@/lib/utils";
import { sendPasscodeResetEmail } from "@/lib/email";
import { attachSystemSettings, clearUserFromSystemSettings } from "@/lib/systemSettings";

function mapUser(u: any) {
  const roles: string[] = u.roles ?? (u.role ? [u.role] : []);
  return { id: u.id, name: u.name, email: u.email, roles, role: roles[0] ?? "", studentId: u.studentId ?? undefined, programChairFor: u.programChairFor ?? [], isFinanceContact: u.isFinanceContact ?? false };
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

  if (body.studentId !== undefined) {
    const sid = typeof body.studentId === "string" ? body.studentId.trim() : "";
    // Allow clearing studentId by sending empty string
    if (sid && !/^\d{10}$/.test(sid))
      return NextResponse.json({ error: "รหัสนิสิตต้องเป็นตัวเลข 10 หลัก" }, { status: 400 });
    data.studentId = sid || null;
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

  if (newPasscode) {
    await sendPasscodeResetEmail({
      userId: user.id,
      name: user.name,
      email: user.email,
      passcode: newPasscode,
      role: user.roles[0] ?? "",
    });
  }

  const [decorated] = await attachSystemSettings([user]);
  return NextResponse.json(mapUser(decorated));
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

  try {
    await prisma.user.delete({ where: { id } });
  } catch (err) {
    // FK constraint (P2003): the user is still referenced by a submission (as student or
    // advisor), an upload, a signature, or a workflow-step action — none of those relations
    // cascade-delete, by design (deleting a user must never silently destroy thesis records).
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
