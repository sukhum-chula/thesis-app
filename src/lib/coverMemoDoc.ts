import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { PROGRAM_LABELS } from "@/lib/utils";

/**
 * Fills the department's บันทึกข้อความ "ขอส่งแบบอนุมัติโครงร่างวิทยานิพนธ์พร้อมรายชื่ออาจารย์ที่ปรึกษา
 * และคณะกรรมการสอบวิทยานิพนธ์" (templates/cover-memo-proposal.docx, a copy of the department's file)
 * for one PROPOSAL at its ADMIN step 8 (stepOrder 12). The ADMIN downloads it, converts it to PDF
 * and uploads that as the COVER_PAGE; the department chair signs it at the next step.
 *
 * Filled: student name (3 places), student code (2), หลักสูตร/สาขาวิชา, the thesis title, and the
 * proposal exam date (weekday, day, month, Buddhist-era year).
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
  /** "YYYY-MM-DD" — the proposal exam date */
  examDate: string | null;
};

// The template's sample text, exactly as its runs hold it
const SAMPLE = {
  name: "สมชาย ใจดี",
  code: "6970000021",
  topic: "ชื่อหัวข้อในโครงร่างวิทยานิพนธ์",
  // "นาย" is printed before the name in the template; the name we fill already carries its title
  ofMr1: "ด้วยภาควิชาวิศวกรรมเครื่องกล คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย ได้กำหนดให้มีการสอบโครงร่างวิทยานิพนธ์ของ นาย ",
  ofMr2: "ในการนี้ ภาควิชาฯ จึงใคร่ขอส่งขอส่งแบบอนุมัติโครงร่างวิทยานิพนธ์พร้อมรายชื่ออาจารย์ที่ปรึกษาและคณะกรรมการสอบวิทยานิพนธ์ของ นาย",
  program: "  ซึ่งเป็นนิสิตระดับบัณฑิตศึกษา หลักสูตรวิศวกรรมศาสตรมหาบัณฑิต สาขาวิชาวิศวกรรมเครื่องกล “",
  weekday: "” ในวันอังคารที่",
  day: " 1 ",
  month: "มกราคม",
  year: "2569",
};

const TH_WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const BLANK = "……";

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

function examDateParts(examDate: string | null): { weekday: string; day: string; month: string; year: string } {
  const m = examDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { weekday: BLANK, day: BLANK, month: BLANK, year: BLANK };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return {
    weekday: TH_WEEKDAYS[date.getUTCDay()],
    day: String(d),
    month: TH_MONTHS[mo - 1] ?? BLANK,
    year: String(y + 543),
  };
}

export async function buildCoverMemoDocx(data: CoverMemoData): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await readFile(TEMPLATE_PATH));
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("cover memo template: word/document.xml missing");
  let xml = await doc.async("string");

  const date = examDateParts(data.examDate);
  const programLabel = (data.program && PROGRAM_LABELS[data.program]) || "หลักสูตร" + BLANK;

  xml = setRunText(xml, SAMPLE.name, data.studentName || BLANK, 3);
  xml = setRunText(xml, SAMPLE.code, data.studentCode || BLANK, 2);
  xml = setRunText(xml, SAMPLE.topic, data.title || BLANK);
  xml = setRunText(xml, SAMPLE.ofMr1, SAMPLE.ofMr1.replace(/ของ นาย $/, "ของ "));
  // also drops the template's doubled "ขอส่งขอส่ง"
  xml = setRunText(xml, SAMPLE.ofMr2, SAMPLE.ofMr2.replace("ขอส่งขอส่ง", "ขอส่ง").replace(/ของ นาย$/, "ของ "));
  xml = setRunText(xml, SAMPLE.program, `  ซึ่งเป็นนิสิตระดับบัณฑิตศึกษา ${programLabel} “`);
  xml = setRunText(xml, SAMPLE.weekday, `” ในวัน${date.weekday}ที่`);
  xml = setRunText(xml, SAMPLE.day, ` ${date.day} `);
  xml = setRunText(xml, SAMPLE.month, date.month);
  xml = setRunText(xml, SAMPLE.year, date.year);

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

export type DefenseResultMemoData = {
  studentName: string;
  studentCode: string;
  program: string | null;
  title: string;
  /** The department chair — signs the memo. Null when none is assigned. */
  chair: { title: string | null; name: string } | null;
  /** The memo's date — normally now */
  date: Date;
};

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

// Spelled out in full under a signature, as on the department's memo (NAME_TITLE_LABELS is abbreviated)
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

/** "6970000021" → "697 00000 21", as the department writes it; anything else unchanged */
function spacedStudentCode(code: string): string {
  return /^\d{10}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3, 8)} ${code.slice(8)}` : code;
}

/** Day / month / Buddhist-era year of a date, in Thailand's time zone */
function thaiDateParts(date: Date): { day: string; month: string; year: string } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { day: String(get("day")), month: TH_MONTHS[get("month") - 1] ?? BLANK, year: String(get("year") + 543) };
}

export async function buildDefenseResultMemoDocx(data: DefenseResultMemoData): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await readFile(DEFENSE_RESULT_TEMPLATE_PATH));
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("defense result memo template: word/document.xml missing");
  let xml = await doc.async("string");

  const date = thaiDateParts(data.date);
  const degree = !data.program ? BLANK : data.program === "PHD" ? "ดุษฎีบัณฑิต" : "มหาบัณฑิต";
  // PROGRAM_LABELS reads "หลักสูตร… สาขาวิชา…" — the memo only names the สาขาวิชา
  const branch = (data.program && PROGRAM_LABELS[data.program]?.split(" สาขาวิชา")[1]) || BLANK;
  const chair = data.chair
    ? `(${(data.chair.title && FULL_TITLES[data.chair.title]) || ""}${data.chair.name})`
    : `(${BLANK})`;

  xml = setRunText(xml, DEFENSE_SAMPLE.day, `${date.day} `);
  xml = setRunText(xml, DEFENSE_SAMPLE.month, ` ${date.month}`);
  xml = setRunText(xml, DEFENSE_SAMPLE.year, ` ${date.year}`);
  xml = setRunText(xml, DEFENSE_SAMPLE.name, data.studentName || BLANK, 2);
  xml = setRunText(xml, DEFENSE_SAMPLE.code, data.studentCode ? spacedStudentCode(data.studentCode) : BLANK);
  xml = setRunText(xml, DEFENSE_SAMPLE.degree, `นิสิตระดับ${degree} `);
  xml = setRunText(xml, DEFENSE_SAMPLE.branch, `สาขาวิชา${branch}เรื่อง `);
  xml = setRunText(xml, DEFENSE_SAMPLE.topic, data.title || BLANK);
  xml = setRunText(xml, DEFENSE_SAMPLE.chair, chair);

  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
