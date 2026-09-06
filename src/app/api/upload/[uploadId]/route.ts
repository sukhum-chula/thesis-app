import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteFile } from "@/lib/supabase";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ uploadId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { uploadId } = await params;
  const upload = await prisma.formUpload.findUnique({ where: { id: uploadId } });
  if (!upload) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { id: userId } = session.user;
  const sessionRoles: string[] = (session.user as any).roles ?? [session.user.role as string];
  const isPrivileged = sessionRoles.includes("ADMIN");
  if (!isPrivileged && upload.uploadedById !== userId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (upload.fileUrl) {
    try {
      await deleteFile(upload.fileUrl);
    } catch { /* ignore storage errors — still delete DB record */ }
  }

  await prisma.formUpload.delete({ where: { id: uploadId } });
  return NextResponse.json({ ok: true });
}
