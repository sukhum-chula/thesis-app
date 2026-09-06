import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

function mapUser(u: any) {
  const roles: string[] = u.roles ?? (u.role ? [u.role] : []);
  return { id: u.id, name: u.name, email: u.email, roles, role: roles[0] ?? "", studentId: u.studentId ?? undefined, isProgramChair: u.isProgramChair ?? false };
}

const FACULTY_ROLES = ["PROFESSOR"];

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionRoles: string[] = (session.user as any).roles ?? [session.user.role];
  const isAdmin = sessionRoles.some((r) => ["ADMIN", "SUPER_ADMIN"].includes(r));

  let where: any;
  if (isAdmin) {
    where = undefined;
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
  return NextResponse.json(users.map(mapUser));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const postRoles: string[] = (session?.user as any)?.roles ?? [session?.user?.role ?? ""];
  if (!session?.user || !postRoles.some((r) => ["ADMIN", "SUPER_ADMIN"].includes(r)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, email, role, studentId, password, isProgramChair } = await req.json();

  if (!name?.trim()) return NextResponse.json({ error: "กรุณากรอกชื่อ-นามสกุล" }, { status: 400 });
  if (!email?.trim()) return NextResponse.json({ error: "กรุณากรอกอีเมล" }, { status: 400 });
  if (!role)          return NextResponse.json({ error: "กรุณาเลือกบทบาท" }, { status: 400 });
  if (password && password.length < 6)
    return NextResponse.json({ error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" }, { status: 400 });
  // Only SUPER_ADMIN may create ADMIN or SUPER_ADMIN accounts
  if (["ADMIN", "SUPER_ADMIN"].includes(role) && !postRoles.includes("SUPER_ADMIN"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (existing) return NextResponse.json({ error: "อีเมลนี้มีในระบบแล้ว" }, { status: 409 });

  const passwordHash = await bcrypt.hash(password ?? randomBytes(32).toString("hex"), 12);

  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      roles: role ? [role] : [],
      studentId: studentId?.trim() || null,
      isProgramChair: role === "PROFESSOR" ? (isProgramChair === true) : false,
      passwordHash,
    },
  });

  return NextResponse.json(mapUser(user), { status: 201 });
}
