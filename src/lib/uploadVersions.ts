import { prisma } from "@/lib/prisma";
import { deleteFile } from "@/lib/supabase";
import type { FormType } from "@/types";

/** Deletes every other upload of `formType` on the submission, keeping `keepId`. Storage removal
 *  is best-effort (an orphaned object is harmless — the bucket is private and nothing links to
 *  it); the DB rows are always removed so only one version is ever shown or attached. */
export async function keepOnlyLatestVersion(submissionId: string, formType: FormType, keepId: string): Promise<void> {
  const older = await prisma.formUpload.findMany({
    where: { submissionId, formType, id: { not: keepId } },
    select: { id: true, fileUrl: true },
  });
  if (older.length === 0) return;
  for (const u of older) {
    if (!u.fileUrl) continue;
    try { await deleteFile(u.fileUrl); } catch (e) { console.error("[uploadVersions/deleteFile]", e); }
  }
  await prisma.formUpload.deleteMany({ where: { id: { in: older.map((u) => u.id) } } });
}
