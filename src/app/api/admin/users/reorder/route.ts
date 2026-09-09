import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RANK_ROLES } from "@/lib/utils";

// ADMIN-only: persists a full drag-and-drop reorder of one role group's user list. `role` must be
// one of the 4 tracked rank groups (ADMIN/PROFESSOR/EXTERNAL/STUDENT — see RANK_PREFIX in
// src/lib/utils.ts); `orderedIds` must be exactly that group's current member ids, in the new
// order — a partial or stale list is rejected rather than silently dropping/duplicating users.
// Never exposes a way to set an arbitrary rankOrder value directly; only a full reorder of the
// group is accepted.
export async function POST(req: NextRequest) {
  const session = await auth();
  const roles: string[] = (session?.user as any)?.roles ?? [session?.user?.role ?? ""];
  if (!session?.user || !roles.includes("ADMIN"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { role, orderedIds } = await req.json();
  if (!RANK_ROLES.includes(role))
    return NextResponse.json({ error: "บทบาทไม่ถูกต้อง" }, { status: 400 });
  if (!Array.isArray(orderedIds) || orderedIds.length === 0 || orderedIds.some((id) => typeof id !== "string"))
    return NextResponse.json({ error: "ลำดับผู้ใช้งานไม่ถูกต้อง" }, { status: 400 });
  if (new Set(orderedIds).size !== orderedIds.length)
    return NextResponse.json({ error: "ลำดับผู้ใช้งานมีรายการซ้ำ" }, { status: 400 });

  const groupUsers = await prisma.user.findMany({
    where: { roles: { has: role } },
    select: { id: true, roles: true },
  });
  const currentIds = new Set(groupUsers.filter((u) => (u.roles[0] ?? "") === role).map((u) => u.id));

  if (currentIds.size !== orderedIds.length || orderedIds.some((id: string) => !currentIds.has(id))) {
    return NextResponse.json(
      { error: "รายชื่อไม่ตรงกับข้อมูลปัจจุบัน — อาจมีผู้ใช้งานถูกเพิ่มหรือลบระหว่างนี้ กรุณาลองใหม่" },
      { status: 409 }
    );
  }

  await prisma.$transaction(
    orderedIds.map((id: string, i: number) =>
      prisma.user.update({ where: { id }, data: { rankOrder: i + 1 } })
    )
  );

  return NextResponse.json({ success: true });
}
