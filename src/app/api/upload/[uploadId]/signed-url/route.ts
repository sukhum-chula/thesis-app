import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSignedUrl } from "@/lib/supabase";
import { getProgramChairsOfUser } from "@/lib/systemSettings";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ uploadId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { uploadId } = await params;
  const upload = await prisma.formUpload.findUnique({ where: { id: uploadId }, include: { submission: true } });
  if (!upload || !upload.fileUrl) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sub = upload.submission;
  const { id: userId, role } = session.user;
  const isPrivileged = role === "ADMIN" || (!!sub.program && (await getProgramChairsOfUser(userId)).includes(sub.program));
  const isInvolved =
    sub.studentId === userId ||
    sub.advisorId === userId ||
    (sub.coAdvisorIds as string[]).includes(userId) ||
    (sub.committeeIds as string[]).includes(userId) ||
    sub.headCommitteeId === userId ||
    sub.invitedCommitteeId === userId ||
    (sub as any).programChairId === userId;
  if (!isPrivileged && !isInvolved)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = await getSignedUrl(upload.fileUrl);
  return NextResponse.json({ url });
}
