import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatUserName } from "@/lib/utils";

function mapRequest(r: any) {
  return { ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() };
}

/** ADMIN-only: reject a pending request. Approval instead goes through POST /api/users with
 *  an `externalRequestId` — see "Committee accounts must pre-exist" in AGENTS.md — since that's
 *  the one route every account is created through. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const roles: string[] = (session?.user as any)?.roles ?? [session?.user?.role ?? ""];
  if (!session?.user || !roles.includes("ADMIN"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { action, reviewNote } = await req.json();
  if (action !== "reject") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const request = await prisma.externalCommitteeRequest.findUnique({ where: { id } });
  if (!request) return NextResponse.json({ error: "ไม่พบคำขอนี้" }, { status: 404 });
  if (request.status !== "PENDING") return NextResponse.json({ error: "คำขอนี้ถูกดำเนินการไปแล้ว" }, { status: 400 });

  const updated = await prisma.externalCommitteeRequest.update({
    where: { id },
    data: { status: "REJECTED", reviewNote: reviewNote?.trim() || null },
  });

  await prisma.notification.create({
    data: {
      recipientId: request.requestedById,
      message: `คำขอเพิ่มกรรมการภายนอก "${formatUserName(request)}" ไม่ได้รับการอนุมัติ`,
      detail: reviewNote?.trim() || request.email,
      submissionId: null,
      type: "rejected",
    },
  });

  return NextResponse.json(mapRequest(updated));
}
