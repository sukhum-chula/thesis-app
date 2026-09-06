import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { FormType, StepStatus, SubmissionStatus } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const FORM_LABELS: Record<FormType, string> = {
  BW1A:          "บ.วศ.1ก — เสนอหัวข้อวิทยานิพนธ์",
  BW1B:          "บ.วศ.1ข — อนุมัติหัวข้อวิทยานิพนธ์",
  B1C:           "บ.วศ.1ค — รายงานความก้าวหน้า",
  B1D:           "บ.วศ.1ง — รายงานความก้าวหน้า (2)",
  B2:            "บ.2 — ออกหนังสือเชิญกรรมการ",
  B3:            "บ.3 — ประเมินวิทยานิพนธ์ก่อนสอบ",
  B4:            "บ.4 — ลงนามอนุมัติวิทยานิพนธ์",
  THESIS:        "วิทยานิพนธ์ฉบับสมบูรณ์",
  SIGNED:        "แบบรายงานการเสนอผลงานทางวิชาการของนิสิต",
  FINANCE_DOC:    "เอกสารการเงิน",
  FINANCE_ATTACH: "เอกสารการเงินแนบกรรมการสอบ",
  EXAM_RESULT:    "ใบรายงานผลการสอบวิทยานิพนธ์",
  INVITE_LETTER: "หนังสือเชิญกรรมการสอบ",
  VERY_GOOD_EVAL:"แบบประเมินวิทยานิพนธ์ดีมาก",
};

export const PROGRAM_LABELS: Record<string, string> = {
  PHD:     "หลักสูตรวิศวกรรมศาสตรดุษฎีบัณฑิต สาขาวิชาวิศวกรรมเครื่องกล",
  ME_MECH: "หลักสูตรวิศวกรรมศาสตรมหาบัณฑิต สาขาวิชาวิศวกรรมเครื่องกล",
  ME_CPS:  "หลักสูตรวิศวกรรมศาสตรมหาบัณฑิต สาขาวิชาระบบกายภาพที่เชื่อมประสานด้วยเครือข่ายไซเบอร์",
};

// User-level role labels (4 simplified roles)
// Also includes step-role labels (ADVISOR, PROGRAM_CHAIR, etc.) for WorkflowStep display
export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN:           "ผู้ดูแลระบบสูงสุด",
  ADMIN:                 "เจ้าหน้าที่ภาควิชา",
  STUDENT:               "นักศึกษา",
  PROFESSOR:             "อาจารย์",
  // Step role display labels:
  ADVISOR:               "อาจารย์ที่ปรึกษา",
  CO_ADVISOR:            "อาจารย์ที่ปรึกษาร่วม",
  PROGRAM_CHAIR:         "ประธานหลักสูตร",
  HEAD_EXAM_COMMITTEE:   "ประธานกรรมการสอบ",
  EXAM_COMMITTEE:        "กรรมการสอบ",
  INVITED_EXAM_COMMITTEE:"กรรมการภายนอก",
};

export const ROLE_EMOJI: Record<string, string> = {
  SUPER_ADMIN:            "👑",
  ADMIN:                  "🛡️",
  STUDENT:                "🎓",
  PROFESSOR:              "👨‍🏫",
  ADVISOR:                "👨‍🏫",
  CO_ADVISOR:             "👨‍🏫",
  PROGRAM_CHAIR:          "🏛️",
  HEAD_EXAM_COMMITTEE:    "📋",
  EXAM_COMMITTEE:         "📋",
  INVITED_EXAM_COMMITTEE: "🎓",
};

export const ROLE_GRADIENT: Record<string, string> = {
  SUPER_ADMIN:            "from-yellow-400 to-amber-600",
  ADMIN:                  "from-slate-700 to-gray-900",
  STUDENT:                "from-blue-500 to-indigo-600",
  PROFESSOR:              "from-violet-500 to-purple-600",
  ADVISOR:                "from-violet-500 to-purple-600",
  CO_ADVISOR:             "from-purple-500 to-fuchsia-600",
  PROGRAM_CHAIR:          "from-indigo-600 to-blue-700",
  HEAD_EXAM_COMMITTEE:    "from-orange-500 to-amber-600",
  EXAM_COMMITTEE:         "from-teal-500 to-cyan-600",
  INVITED_EXAM_COMMITTEE: "from-sky-500 to-blue-600",
};

export const ROLE_DESC: Record<string, string> = {
  SUPER_ADMIN: "ควบคุมระบบทั้งหมด รวมถึงการจัดการผู้ใช้และสิทธิ์",
  ADMIN:       "ดูภาพรวมและจัดการคำร้องทั้งหมด",
  STUDENT:     "ยื่นหัวข้อ อัปโหลดเอกสาร ติดตามสถานะ",
  PROFESSOR:   "ที่ปรึกษา / กรรมการสอบ — ลงนามเอกสารตามที่ได้รับมอบหมาย",
};

const ROLE_SORT_ORDER: Record<string, number> = {
  SUPER_ADMIN: 0,
  ADMIN: 1,
  PROFESSOR: 2,
  STUDENT: 3,
};

// Thai academic title prefixes on `name`, highest rank first — ผศ./รศ. must be
// checked before a bare "ศ." check since both contain that syllable.
const ACADEMIC_RANK_PREFIXES: [string, number][] = [
  ["ศ.", 4],   // ศาสตราจารย์ (Professor)
  ["รศ.", 3],  // รองศาสตราจารย์ (Associate Professor)
  ["ผศ.", 2],  // ผู้ช่วยศาสตราจารย์ (Assistant Professor)
  ["อ.", 1],   // อาจารย์ (Lecturer)
];

function academicRank(name: string): number {
  for (const [prefix, rank] of ACADEMIC_RANK_PREFIXES) {
    if (name.startsWith(prefix)) return rank;
  }
  return 0;
}

/**
 * Sorts users SUPER_ADMIN -> ADMIN -> PROFESSOR -> STUDENT; professors by academic
 * rank (parsed from the name's ศ./รศ./ผศ./อ. title prefix, highest first) then name;
 * students by studentId ascending.
 */
export function sortUsersByRole<T extends { name: string; roles: string[]; studentId?: string | null }>(
  users: T[],
): T[] {
  const primaryRole = (u: T) => u.roles[0] ?? "";

  return [...users].sort((a, b) => {
    const roleDiff = (ROLE_SORT_ORDER[primaryRole(a)] ?? 9) - (ROLE_SORT_ORDER[primaryRole(b)] ?? 9);
    if (roleDiff !== 0) return roleDiff;

    if (primaryRole(a) === "PROFESSOR") {
      const rankDiff = academicRank(b.name) - academicRank(a.name);
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name, "th");
    }

    if (primaryRole(a) === "STUDENT") {
      const aId = a.studentId ?? "";
      const bId = b.studentId ?? "";
      if (!aId && !bId) return 0;
      if (!aId) return 1;
      if (!bId) return -1;
      return aId.localeCompare(bId);
    }

    return a.name.localeCompare(b.name, "th");
  });
}

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  DRAFT: "ร่าง",
  IN_PROGRESS: "กำลังดำเนินการ",
  COMPLETED: "เสร็จสิ้น",
  REJECTED: "ถูกปฏิเสธ",
  CANCELLED: "ยกเลิก",
};

export const STEP_LABELS: Record<StepStatus, string> = {
  PENDING: "รอดำเนินการ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ปฏิเสธ",
  SKIPPED: "ข้าม",
};

export const FORM_SHORT: Record<FormType, string> = {
  BW1A:          "บ.วศ.1ก",
  BW1B:          "บ.วศ.1ข",
  B1C:           "บ.วศ.1ค",
  B1D:           "บ.วศ.1ง",
  B2:            "บ.2",
  B3:            "บ.3",
  B4:            "บ.4",
  THESIS:        "วิทยานิพนธ์",
  SIGNED:        "แบบรายงานฯ",
  FINANCE_DOC:    "การเงิน",
  FINANCE_ATTACH: "เอกสารการเงินแนบ",
  EXAM_RESULT:    "ใบรายงานผล",
  INVITE_LETTER: "หนังสือเชิญ",
  VERY_GOOD_EVAL:"แบบประเมินดีมาก",
};

// Step names for proposal submissions (11 steps)
export const PROPOSAL_STEP_NAMES: Record<number, string> = {
  1:  "นิสิตอัปโหลด บ.วศ.1ก + บ.วศ.1ข + เอกสารการเงินแนบกรรมการสอบ",
  2:  "เจ้าหน้าที่ตรวจรับและอนุมัติ",
  3:  "ประธานหลักสูตรลงนาม บ.วศ.1ก",
  4:  "นิสิตอัปโหลด บ.วศ.1ค + บ.วศ.1ง (กรอกข้อมูลครบถ้วน)",
  5:  "ประธานกรรมการสอบลงนาม บ.วศ.1ค",
  6:  "อาจารย์ที่ปรึกษาลงนาม บ.วศ.1ค",
  7:  "อาจารย์ที่ปรึกษาร่วมลงนาม บ.วศ.1ค",
  8:  "กรรมการภายนอกลงนาม บ.วศ.1ค",
  9:  "กรรมการสอบลงนาม บ.วศ.1ค",
  10: "เจ้าหน้าที่ตรวจสอบ (รอบ 2)",
  11: "ประธานหลักสูตรลงนาม บ.วศ.1ค + บ.วศ.1ง",
};

// Step names for thesis defense submissions (22 steps)
export const THESIS_STEP_NAMES: Record<number, string> = {
  1:  "นิสิตอัปโหลด บ.2 + บ.3 + เอกสารการเงินแนบกรรมการสอบ",
  2:  "กรรมการสอบลงนาม บ.3",
  3:  "อาจารย์ที่ปรึกษาลงนาม บ.2",
  4:  "อาจารย์ที่ปรึกษาร่วมลงนาม บ.2",
  5:  "ประธานกรรมการสอบลงนาม บ.2",
  6:  "ประธานหลักสูตรลงนาม บ.2",
  7:  "เจ้าหน้าที่นำส่งเอกสารไปคณะ",
  8:  "เจ้าหน้าที่อัปโหลดเอกสารจากคณะ",
  9:  "นิสิตอัปโหลดแบบรายงานการเสนอผลงานฯ (กรอกข้อมูลและลงนาม)",
  10: "อาจารย์ที่ปรึกษาลงนาม แบบรายงานฯ + ใบรายงานผล",
  11: "อาจารย์ที่ปรึกษาร่วมลงนาม แบบรายงานฯ + ใบรายงานผล",
  12: "ประธานกรรมการสอบลงนาม ใบรายงานผล",
  13: "กรรมการสอบลงนาม ใบรายงานผล",
  14: "กรรมการภายนอกลงนาม ใบรายงานผล",
  15: "ประธานหลักสูตรลงนาม ใบรายงานผล",
  16: "นิสิตอัปโหลด บ.4 (กรอกครบถ้วน) + วิทยานิพนธ์ฉบับสมบูรณ์",
  17: "ประธานหลักสูตรลงนาม บ.4",
  18: "อาจารย์ที่ปรึกษาลงนามปกวิทยานิพนธ์",
  19: "อาจารย์ที่ปรึกษาร่วมลงนามปกวิทยานิพนธ์",
  20: "ประธานกรรมการสอบลงนามปกวิทยานิพนธ์",
  21: "กรรมการสอบลงนามปกวิทยานิพนธ์",
  22: "กรรมการภายนอกลงนามปกวิทยานิพนธ์",
};

// Legacy alias so old import sites compile (old 8/27-step subs fall back to role label)
export const STEP_NAMES: Record<number, string> = PROPOSAL_STEP_NAMES;

export function getStepName(stepOrder: number, submissionType?: string | null): string {
  const map = submissionType === "THESIS_DEFENSE" ? THESIS_STEP_NAMES : PROPOSAL_STEP_NAMES;
  return map[stepOrder] ?? "";
}

/** Basic email shape check — a typo'd address means the welcome/step email silently goes nowhere. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Chula student IDs are exactly 10 digits (e.g. 6733100421). */
export function isValidStudentId(id: string): boolean {
  return /^\d{10}$/.test(id.trim());
}

/** Thai phone number: 9–10 digits starting with 0; spaces and dashes allowed. */
export function isValidThaiPhone(phone: string): boolean {
  const digits = phone.replace(/[\s-]/g, "");
  return /^0\d{8,9}$/.test(digits);
}

/** Show server error text only when it is a Thai user-facing message; otherwise use a generic fallback. */
export function toUserErrorMessage(err: unknown, fallback = "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง"): string {
  const msg = err instanceof Error ? err.message : "";
  return msg && /[ก-๙]/.test(msg) ? msg : fallback;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(date: Date | string): string {
  const lang = typeof window !== "undefined" ? localStorage.getItem("ui-lang") : null;
  const locale = lang === "en" ? "en-GB" : "th-TH";
  return new Date(date).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Full weekday+date string for today, e.g. header/topbar date displays. */
export function formatTodayLong(): string {
  const lang = typeof window !== "undefined" ? localStorage.getItem("ui-lang") : null;
  return new Date().toLocaleDateString(lang === "en" ? "en-GB" : "th-TH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

export function downloadMockFile(fileName: string, formLabel: string, submissionTitle: string) {
  const content = [
    `=== เอกสารสาธิต ===`,
    `แบบฟอร์ม: ${formLabel}`,
    `ชื่อวิทยานิพนธ์: ${submissionTitle}`,
    `ไฟล์: ${fileName}`,
    ``,
    `[ในระบบจริง ไฟล์ต้นฉบับจะถูกดาวน์โหลดจาก Storage]`,
  ].join("\n");

  const blob = new Blob(["﻿" + content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.replace(/\.pdf$/i, ".txt");
  a.click();
  URL.revokeObjectURL(url);
}

export function previewFile(uploadId?: string | null, fileUrl?: string | null, fileName?: string) {
  if (!uploadId || !fileUrl) return;
  fetch(`/api/upload/${uploadId}/signed-url`)
    .then((r) => r.json())
    .then((d) => {
      if (d.url) window.open(d.url, "_blank", "noopener,noreferrer");
    })
    .catch(() => {});
}

export function downloadFile(uploadId: string, fileName: string, formLabel: string, submissionTitle: string, fileUrl?: string | null) {
  if (fileUrl) {
    // Storage bucket is private — resolve to a short-lived signed URL first,
    // then fetch -> blob URL so the browser respects the download attribute.
    fetch(`/api/upload/${uploadId}/signed-url`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.url) throw new Error("no signed url");
        return fetch(d.url).then((r) => r.blob());
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => downloadMockFile(fileName, formLabel, submissionTitle));
    return;
  }
  downloadMockFile(fileName, formLabel, submissionTitle);
}
