import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAllProgramChairs, setProgramChair } from "@/lib/systemSettings";

const PROGRAMS = ["PHD", "ME_MECH", "ME_CPS"] as const;

// Admin-only: assign or clear which PROFESSOR is the designated ประธานหลักสูตร for one of the
// 3 programs. Used as the fallback PROGRAM_CHAIR recipient/authorizer on submissions that don't
// have their own programChairId set. Assigning a program to a user automatically clears whoever
// previously held that program — but a professor may be assigned to more than one program at
// once (see setProgramChair() in src/lib/systemSettings.ts).
export async function POST(req: NextRequest) {
  const session = await auth();
  const roles: string[] = (session?.user as any)?.roles ?? [session?.user?.role ?? ""];
  if (!session?.user || !roles.includes("ADMIN"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { program, userId } = await req.json();
  if (!PROGRAMS.includes(program))
    return NextResponse.json({ error: "หลักสูตรไม่ถูกต้อง" }, { status: 400 });

  if (userId) {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) return NextResponse.json({ error: "ไม่พบผู้ใช้งาน" }, { status: 404 });
    if (!target.roles.includes("PROFESSOR"))
      return NextResponse.json({ error: "ต้องเป็นบัญชีอาจารย์เท่านั้น" }, { status: 400 });
  }

  await setProgramChair(program, userId || null);

  const chairsByProgram = await getAllProgramChairs();
  const chairs = await Promise.all(
    Object.entries(chairsByProgram).map(async ([p, uid]) => {
      const u = await prisma.user.findUnique({ where: { id: uid }, select: { id: true, name: true, email: true } });
      return { ...u, programChairFor: p };
    })
  );

  return NextResponse.json({ success: true, chairs });
}
