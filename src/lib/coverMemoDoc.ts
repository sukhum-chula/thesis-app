import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { PROGRAM_LABELS } from "@/lib/utils";

// ─── Shared helpers ─────────────────────────────────────────────────────────────────────

const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const BLANK = "……";

// Spelled out in full under a signature, as on the department's memos (NAME_TITLE_LABELS is abbreviated)
const FULL_TITLES: Record<string, string> = {
  PROF_DR:       "ศาสตราจารย์ ดร.",
  ASSOC_PROF_DR: "รองศาสตราจารย์ ดร.",
  ASST_PROF_DR:  "ผู้ช่วยศาสตราจารย์ ดร.",
  ASST_PROF:     "ผู้ช่วยศาสตราจารย์ ",
  LECTURER_DR:   "อาจารย์ ดร.",
  DR:            "ดร.",
  MR:            "นาย",
  MISS:          "นางสาว",
  MRS:           "นาง",
};

/** The department chair — signs both memos. Null when none is assigned. */
type MemoSigner = { title: string | null; name: string } | null;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Replaces the text of every run whose whole text is `from`; throws unless exactly `count` match. */
function setRunText(xml: string, from: string, to: string, count = 1): string {
  const re = new RegExp(`(<w:t(?: [^>]*)?>)${esc(from).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</w:t>`, "g");
  const found = xml.match(re)?.length ?? 0;
  if (found !== count) throw new Error(`memo template: "${from}" found ${found}×, expected ${count}×`);
  return xml.replace(re, (_m, open: string) =>
    `${open.includes("xml:space") ? open : '<w:t xml:space="preserve">'}${esc(to)}</w:t>`);
}

/** Day / month / Buddhist-era year of a date, in Thailand's time zone */
function thaiDateParts(date: Date): { day: string; month: string; year: string } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { day: String(get("day")), month: TH_MONTHS[get("month") - 1] ?? BLANK, year: String(get("year") + 543) };
}

/** "(ศาสตราจารย์ ดร.ชื่อ นามสกุล)" — the signer's line under the signature */
function signerLine(chair: MemoSigner): string {
  return chair ? `(${(chair.title && FULL_TITLES[chair.title]) || ""}${chair.name})` : `(${BLANK})`;
}

/** A program's "หลักสูตร…" and its สาขาวิชา without the prefix — PROGRAM_LABELS reads "หลักสูตร… สาขาวิชา…" */
function programParts(program: string | null): { degree: string | null; branch: string | null } {
  const label = program ? PROGRAM_LABELS[program] : undefined;
  if (!label) return { degree: null, branch: null };
  const [degree, branch] = label.split(" สาขาวิชา");
  return { degree, branch: branch ?? null };
}

// ─── PROPOSAL: บันทึกข้อความ "ขอส่งแบบอนุมัติโครงร่างวิทยานิพนธ์…" ─────────────────────────

/**
 * Fills the department's บันทึกข้อความ "ขอส่งแบบอนุมัติโครงร่างวิทยานิพนธ์พร้อมรายชื่ออาจารย์ที่ปรึกษา
 * และคณะกรรมการสอบวิทยานิพนธ์" (templates/cover-memo-proposal.docx, a copy of the department's file)
 * for one PROPOSAL at its ADMIN step 8 (stepOrder 12). The ADMIN downloads it, converts it to PDF
 * and uploads that as the COVER_PAGE; the department chair signs it at the next step.
 *
 * Filled: the memo date (the day it is generated), student name (2 places), student code (2),
 * หลักสูตร + สาขาวิชา, the thesis title, and the department chair's name under the signature line.
 *
 * The template's sample values are replaced by exact text match on its <w:t> runs. If the
 * department ships a new memo, replace the file and re-check SAMPLE below — every replacement
 * throws when its sample text isn't found the expected number of times, so a mismatched template
 * fails loudly instead of producing a wrong document.
 */

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "cover-memo-proposal.docx");

export type CoverMemoData = {
  studentName: string;
  studentCode: string;
  program: string | null;
  title: string;
  chair: MemoSigner;
  /** The memo's date — normally now */
  date: Date;
};

// The template's sample text, exactly as its runs hold it
const SAMPLE = {
  day: "2 ",
  month: " มกราคม ",
  year: "2569",
  // "นาย" is printed before the name in the template; the name we fill already carries its title
  mr1: "นาย",
  name1: " สมชาย ใจดี",
  mr2: "นาย ",
  name2: "สมชาย ใจดี",
  // the student code is split over these five runs, in both paragraphs
  code: ["6", "9", "70", "0000", "21"],
  degree: "ซึ่งเป็นนิสิตระดับบัณฑิตศึกษา หลักสูตรวิศวกรรมศาสตรมหาบัณฑิต ",
  branch: "ระบบกายภาพที่เชื่อมประสานด้วยเครือข่ายไซเบอร์",
  topic: "ชื่อหัวข้อโครงร่างวิทยานิพนธ์",
  doubled: "ในการนี้ ภาควิชาฯ จึงใคร่ขอส่งขอส่งแบบอนุมัติโครงร่างวิทยานิพนธ์พร้อมรายชื่ออาจารย์ที่ปรึกษาและคณะกรรมการสอบวิทยานิพนธ์ของ ",
  chair: "(ศาสตราจารย์ ดร.ไพโรจน์ สิงหถนัดกิจ)",
};

export async function buildCoverMemoDocx(data: CoverMemoData): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await readFile(TEMPLATE_PATH));
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("cover memo template: word/document.xml missing");
  let xml = await doc.async("string");

  const date = thaiDateParts(data.date);
  const program = programParts(data.program);
  const [codeHead, ...codeTail] = SAMPLE.code;

  xml = setRunText(xml, SAMPLE.day, `${date.day} `);
  xml = setRunText(xml, SAMPLE.month, ` ${date.month} `);
  xml = setRunText(xml, SAMPLE.year, date.year);
  xml = setRunText(xml, SAMPLE.mr1, "");
  xml = setRunText(xml, SAMPLE.name1, ` ${data.studentName || BLANK}`);
  xml = setRunText(xml, SAMPLE.mr2, "");
  xml = setRunText(xml, SAMPLE.name2, data.studentName || BLANK);
  xml = setRunText(xml, codeHead, data.studentCode || BLANK, 2);
  for (const part of codeTail) xml = setRunText(xml, part, "", 2);
  xml = setRunText(xml, SAMPLE.degree, `ซึ่งเป็นนิสิตระดับบัณฑิตศึกษา ${program.degree ?? "หลักสูตร" + BLANK} `);
  xml = setRunText(xml, SAMPLE.branch, program.branch ?? BLANK);
  xml = setRunText(xml, SAMPLE.topic, data.title || BLANK);
  // drops the template's doubled "ขอส่งขอส่ง"
  xml = setRunText(xml, SAMPLE.doubled, SAMPLE.doubled.replace("ขอส่งขอส่ง", "ขอส่ง"));
  xml = setRunText(xml, SAMPLE.chair, signerLine(data.chair));

  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

// ─── THESIS_DEFENSE: บันทึกข้อความ "ขอส่งผลสอบวิทยานิพนธ์" ──────────────────────────

/**
 * Fills the department's บันทึกข้อความ "ขอส่งผลสอบวิทยานิพนธ์" (templates/cover-memo-defense-result.docx,
 * a copy of the department's file) for one THESIS_DEFENSE at the ADMIN's result-check step
 * (THESIS_STEP.ADMIN_RESULT_CHECK, shown as step 9). The ADMIN converts it to PDF and uploads it as the
 * COVER_PAGE; the department chair signs it at the next step (THESIS_STEP.DEPT_CHAIR_RESULT).
 *
 * Filled: the memo date (the day it is generated), student name (2 places), student code, degree
 * level, สาขาวิชา, the thesis title, and the department chair's name under the signature line.
 * Same exact-run-match rule as the proposal memo above.
 */
const DEFENSE_RESULT_TEMPLATE_PATH = path.join(process.cwd(), "templates", "cover-memo-defense-result.docx");

export type DefenseResultMemoData = CoverMemoData;

const DEFENSE_SAMPLE = {
  day: "11 ",
  month: " ธันวาคม",
  year: " 2568",
  name: "นายสมชาย ใจดี",
  code: "697 00000 21",
  degree: "นิสิตระดับมหาบัณฑิต ",
  branch: "สาขาวิชาวิศวกรรมเครื่องกลเรื่อง ",
  topic: "ชื่อหัวข้อวิทยานิพนธ์",
  chair: "(ศาสตราจารย์ ดร.ไพโรจน์ สิงหถนัดกิจ)",
};

/** "6970000021" → "697 00000 21", as the department writes it; anything else unchanged */
function spacedStudentCode(code: string): string {
  return /^\d{10}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3, 8)} ${code.slice(8)}` : code;
}

export async function buildDefenseResultMemoDocx(data: DefenseResultMemoData): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await readFile(DEFENSE_RESULT_TEMPLATE_PATH));
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("defense result memo template: word/document.xml missing");
  let xml = await doc.async("string");

  const date = thaiDateParts(data.date);
  const degree = !data.program ? BLANK : data.program === "PHD" ? "ดุษฎีบัณฑิต" : "มหาบัณฑิต";
  // the memo only names the สาขาวิชา
  const branch = programParts(data.program).branch ?? BLANK;

  xml = setRunText(xml, DEFENSE_SAMPLE.day, `${date.day} `);
  xml = setRunText(xml, DEFENSE_SAMPLE.month, ` ${date.month}`);
  xml = setRunText(xml, DEFENSE_SAMPLE.year, ` ${date.year}`);
  xml = setRunText(xml, DEFENSE_SAMPLE.name, data.studentName || BLANK, 2);
  xml = setRunText(xml, DEFENSE_SAMPLE.code, data.studentCode ? spacedStudentCode(data.studentCode) : BLANK);
  xml = setRunText(xml, DEFENSE_SAMPLE.degree, `นิสิตระดับ${degree} `);
  xml = setRunText(xml, DEFENSE_SAMPLE.branch, `สาขาวิชา${branch}เรื่อง `);
  xml = setRunText(xml, DEFENSE_SAMPLE.topic, data.title || BLANK);
  xml = setRunText(xml, DEFENSE_SAMPLE.chair, signerLine(data.chair));

  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
