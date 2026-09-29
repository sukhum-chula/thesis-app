import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";

/**
 * Fills the department's เอกสารการเงินแนบกรรมการสอบ form (templates/finance-attach-proposal.docx,
 * an unmodified copy of the official form) for one PROPOSAL submission.
 *
 * Filled: student name, student code, สาขาวิชา (only rewritten for ME_CPS — the form prints
 * วิศวกรรมเครื่องกล), and one committee-table row per member, numbered 1..n. Deliberately left
 * blank for the humans who complete it: วันที่, จำนวนหน่วยกิต, ลงนาม, รวมเงิน, จ่ายเช็คในนามของ.
 *
 * The template is edited as raw WordprocessingML, anchored on its fixed structure (the paraIds
 * of the two header cells and the position of the committee table). If the department ships a
 * new form, replace the file and re-check these anchors — every anchor throws when not found,
 * so a mismatched template fails loudly instead of producing a wrong document.
 */

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "finance-attach-proposal.docx");

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type FinanceMember = { name: string; position: string };

export type FinanceDocData = {
  studentName: string;
  studentCode: string;
  program: string | null;
  members: FinanceMember[];
};

/** Position labels exactly as the form prints them, in the form's row order. */
export const FINANCE_POSITION = {
  HEAD_EXAM_COMMITTEE:    "ประธานกรรมการสอบ",
  ADVISOR:                "กรรมการ (อาจารย์ที่ปรึกษา)",
  CO_ADVISOR:             "กรรมการ (อาจารย์ที่ปรึกษาร่วม)",
  INVITED_EXAM_COMMITTEE: "กรรมการ (ภายนอก)",
  EXAM_COMMITTEE:         "กรรมการ",
} as const;

const CPS_MAJOR = "ระบบกายภาพที่เชื่อมประสานด้วยเครือข่ายไซเบอร์";
const MECH_MAJOR = "วิศวกรรมเครื่องกล";

// Same run formatting the template uses for its own text (TH Sarabun New, 16pt)
const RPR =
  '<w:rPr><w:rFonts w:ascii="TH Sarabun New" w:eastAsia="Times New Roman" w:hAnsi="TH Sarabun New" ' +
  'w:cs="TH Sarabun New"/><w:sz w:val="32"/><w:szCs w:val="32"/><w:cs/></w:rPr>';

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function run(text: string): string {
  return `<w:r>${RPR}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

/** Appends a text run to the (empty) paragraph with the given w14:paraId. */
function fillParagraph(xml: string, paraId: string, text: string): string {
  const at = xml.indexOf(`w14:paraId="${paraId}"`);
  if (at < 0) throw new Error(`finance template: paragraph ${paraId} not found`);
  const end = xml.indexOf("</w:p>", at);
  const pPrEnd = xml.indexOf("</w:pPr>", at);
  const insertAt = pPrEnd >= 0 && pPrEnd < end ? pPrEnd + "</w:pPr>".length : end;
  return xml.slice(0, insertAt) + run(text) + xml.slice(insertAt);
}

/** Replaces a cell's text: drops its runs and bookmarks, then appends one run after its pPr. */
function setCellText(cellXml: string, text: string): string {
  const cleaned = cellXml
    .replace(/<w:r[ >][\s\S]*?<\/w:r>/g, "")
    .replace(/<w:bookmark(Start|End)[^>]*\/>/g, "");
  const pPrEnd = cleaned.indexOf("</w:pPr>");
  if (pPrEnd < 0) throw new Error("finance template: committee cell has no paragraph properties");
  const insertAt = pPrEnd + "</w:pPr>".length;
  return cleaned.slice(0, insertAt) + (text ? run(text) : "") + cleaned.slice(insertAt);
}

/** Builds one committee row from the template's first member row. */
function memberRow(templateRow: string, no: number, m: FinanceMember): string {
  // A cloned row must not repeat the template's paragraph ids (Word flags duplicates)
  const row = templateRow.replace(/ w14:(paraId|textId)="[0-9A-F]+"/g, "");
  const cells = row.match(/<w:tc>[\s\S]*?<\/w:tc>/g);
  if (!cells || cells.length !== 4) throw new Error("finance template: committee row must have 4 cells");
  const texts = [String(no), m.name, m.position, ""];
  let i = 0;
  return row.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (cell) => setCellText(cell, texts[i++]));
}

function fillCommitteeTable(xml: string, members: FinanceMember[]): string {
  const tables = [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)];
  if (tables.length < 2) throw new Error("finance template: committee table not found");
  const table = tables[1];
  const rows = table[0].match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? [];
  // rows: [header, member rows (3 in the form, one merged), รวมเงิน, ...]
  const totalIdx = rows.findIndex((r) => r.includes("รวมเงิน"));
  if (totalIdx < 2) throw new Error("finance template: รวมเงิน row not found");
  const firstMember = rows[1];
  const newRows = members.map((m, i) => memberRow(firstMember, i + 1, m)).join("");
  const rebuilt = table[0].replace(rows.slice(1, totalIdx).join(""), newRows);
  return xml.slice(0, table.index!) + rebuilt + xml.slice(table.index! + table[0].length);
}

function fillMajor(xml: string, program: string | null): string {
  if (program !== "ME_CPS") return xml;
  const table = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/);
  if (!table) throw new Error("finance template: student table not found");
  const rows = table[0].match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? [];
  const row = rows[1];
  const cells = row?.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? [];
  const cell = cells[cells.length - 1];
  if (!cell || !cell.includes(`>${MECH_MAJOR}<`)) throw new Error("finance template: สาขาวิชา cell not found");
  // The CPS major is ~3x longer than the printed one and the cell is narrow — at the form's 16pt
  // it wraps to 3 lines and shifts the rows below, so it's printed at 11pt (2 lines).
  const small = RPR.replace('w:val="32"/><w:szCs w:val="32"', 'w:val="22"/><w:szCs w:val="22"');
  const newCell = setCellText(cell, "").replace(
    "</w:pPr>",
    `</w:pPr><w:r>${small}<w:t xml:space="preserve">${esc(CPS_MAJOR)}</w:t></w:r>`,
  );
  return xml.replace(row, row.replace(cell, newCell));
}

export async function buildProposalFinanceDocx(data: FinanceDocData): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await readFile(TEMPLATE_PATH));
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("finance template: word/document.xml missing");
  let xml = await doc.async("string");

  xml = fillParagraph(xml, "7D66F930", data.studentName); // ของ
  xml = fillParagraph(xml, "4BD32A8C", data.studentCode); // เลขประจำตัว
  xml = fillMajor(xml, data.program);
  xml = fillCommitteeTable(xml, data.members);

  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
