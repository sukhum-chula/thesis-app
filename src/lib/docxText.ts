/** Plain text of a .docx body, whitespace-collapsed — for comparing two versions of a document
 *  by content. Byte comparison is useless here: Word rewrites the whole package on every save,
 *  so an opened-and-resaved file differs byte-wise even when nothing was edited. jszip is loaded
 *  on demand so it stays out of the main client bundle. */
export async function docxText(data: ArrayBuffer | Uint8Array): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(data);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (xml === undefined) throw new Error("not a Word document");
  return xml
    .replace(/<w:(tab|br)\/>/g, " ")
    .replace(/<\/w:p>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
