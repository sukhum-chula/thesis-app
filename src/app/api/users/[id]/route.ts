import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

function mapUser(u: any) {
  const roles: string[] = u.roles ?? (u.role ? [u.role] : []);
  return { id: u.id, name: u.name, email: u.email, roles, role: roles[0] ?? "", studentId: u.studentId ?? undefined };
}

function sessionRoles(session: any): string[] {
  return (session?.user as any)?.roles ?? [session?.user?.role ?? ""];
}

const PRIVILEGED_ROLES = ["ADMIN", "SUPER_ADMIN"];
const isPrivileged = (roles: string[]) => roles.some((r) => PRIVILEGED_ROLES.includes(r));

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const sRoles = sessionRoles(session);
  if (!session?.user || !sRoles.some((r) => PRIVILEGED_ROLES.includes(r)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const isSuperAdmin = sRoles.includes("SUPER_ADMIN");

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "ไม่พบผู้ใช้งาน" }, { status: 404 });

  // ADMIN's remit is PROFESSOR/STUDENT accounts only — cannot touch an existing ADMIN/SUPER_ADMIN account at all
  if (!isSuperAdmin && isPrivileged(target.roles))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const data: any = {};

  if (body.role !== undefined) {
    // Only SUPER_ADMIN can grant the ADMIN or SUPER_ADMIN role
    if (PRIVILEGED_ROLES.includes(body.role) && !isSuperAdmin)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // Setting role replaces entire roles array with single role
    data.roles = [body.role];
  }

  if (body.roles !== undefined) {
    // Only SUPER_ADMIN can grant the ADMIN or SUPER_ADMIN role
    if ((body.roles as string[]).some((r) => PRIVILEGED_ROLES.includes(r)) && !isSuperAdmin)
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

  if (body.password !== undefined) {
    if (typeof body.password !== "string" || body.password.length < 6)
      return NextResponse.json({ error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" }, { status: 400 });
    data.passwordHash = await bcrypt.hash(body.password, 12);
  }

  const user = await prisma.user.update({ where: { id }, data });
  return NextResponse.json(mapUser(user));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const sRoles = sessionRoles(session);
  if (!session?.user || !sRoles.some((r) => PRIVILEGED_ROLES.includes(r)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const isSuperAdmin = sRoles.includes("SUPER_ADMIN");

  // ADMIN may only delete PROFESSOR/STUDENT accounts — SUPER_ADMIN may delete anyone
  if (!isSuperAdmin) {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: "ไม่พบผู้ใช้งาน" }, { status: 404 });
    if (isPrivileged(target.roles))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
