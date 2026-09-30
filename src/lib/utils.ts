import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { FormType, MockSubmission, NameTitle, Role, StepStatus, SubmissionStatus } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Thai name-title prefix — split out of User.name (see prisma/schema.prisma's NameTitle enum,
// which @maps each key to the exact Thai text below) so it's a fixed dropdown everywhere a name
// is entered, instead of free-typed as part of the name. Order here is the dropdown display order.
export const NAME_TITLE_LABELS: Record<NameTitle, string> = {
  PROF_DR:       "ศ.ดร.",
  ASSOC_PROF_DR: "รศ.ดร.",
  ASST_PROF_DR:  "ผศ.ดร.",
  ASST_PROF:     "ผศ.",
  LECTURER_DR:   "อ.ดร.",
  DR:            "ดร.",
  MR:            "นาย",
  MISS:          "นางสาว",
  MRS:           "นาง",
};

export const NAME_TITLES = Object.keys(NAME_TITLE_LABELS) as NameTitle[];

// Longest label first, so "ผศ.ดร." is tried before "ผศ." — otherwise the shorter title would
// match first and leave "ดร." stuck on the front of the remaining name.
const NAME_TITLE_PARSE_ORDER = [...NAME_TITLES].sort(
  (a, b) => NAME_TITLE_LABELS[b].length - NAME_TITLE_LABELS[a].length
);

// Splits a Thai title prefix off a full name, e.g. "ผศ.ดร.สมชาย ใจดี" -> { title: "ASST_PROF_DR",
// name: "สมชาย ใจดี" }. Returns title: null when no known prefix matches (name is left as-is).
export function splitNameTitle(fullName: string): { title: NameTitle | null; name: string } {
  const trimmed = fullName.trim();
  for (const key of NAME_TITLE_PARSE_ORDER) {
    const label = NAME_TITLE_LABELS[key];
    if (trimmed.startsWith(label)) {
      return { title: key, name: trimmed.slice(label.length).trim() };
    }
  }
  return { title: null, name: trimmed };
}

// The inverse of splitNameTitle — renders a title + name back together for display, exactly as
// it would have been typed as one field before the split (no space between title and name).
// `title` is typed loosely (string, not NameTitle) so callers with API responses typed as plain
// strings (e.g. DirectoryUser) don't need a cast at every call site.
export function formatUserName(u: { title?: string | null; name: string }): string {
  const label = u.title ? NAME_TITLE_LABELS[u.title as NameTitle] : undefined;
  return label ? `${label}${u.name}` : u.name;
}

// Submissions a given user is involved in — ADMIN sees everything (submission workflow is
// ADMIN's exclusive responsibility), everyone else only what names them somewhere in the
// committee. Shared by UserProfileHeader (quick stats) and UserDetailPanel (submissions list).
export function getRelatedSubmissions(
  submissions: MockSubmission[],
  userId: string,
  roles: Role[]
): MockSubmission[] {
  if (roles.includes("ADMIN")) return submissions;
  return submissions.filter((s) =>
    s.studentId === userId ||
    (s as any).advisorId === userId ||
    ((s.coAdvisorIds ?? []) as string[]).includes(userId) ||
    ((s.committeeIds ?? []) as string[]).includes(userId) ||
    (s as any).headCommitteeId === userId ||
    ((s.invitedCommitteeIds ?? []) as string[]).includes(userId) ||
    (s as any).programChairId === userId
  );
}

export const FORM_LABELS: Record<FormType, string> = {
  B1:            "บ.วศ.1 — แบบฟอร์ม บ.วศ.1ก–ง (ไฟล์เดียว)",
  B1A:          "บ.วศ.1ก — เสนอหัวข้อวิทยานิพนธ์",
  B1B:          "บ.วศ.1ข — อนุมัติหัวข้อวิทยานิพนธ์",
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
  COVER_PAGE:    "ใบปะหน้าส่งคณะวิศวกรรมศาสตร์",
};

export const PROGRAM_LABELS: Record<string, string> = {
  PHD:     "หลักสูตรวิศวกรรมศาสตรดุษฎีบัณฑิต สาขาวิชาวิศวกรรมเครื่องกล",
  ME_MECH: "หลักสูตรวิศวกรรมศาสตรมหาบัณฑิต สาขาวิชาวิศวกรรมเครื่องกล",
  ME_CPS:  "หลักสูตรวิศวกรรมศาสตรมหาบัณฑิต สาขาวิชาระบบกายภาพที่เชื่อมประสานด้วยเครือข่ายไซเบอร์",
};

// ─── Committee composition rules (degree-dependent) ───────────────────────────
// Which kind of account may fill each contextual committee role, per degree level. Shared by the
// client editors (CommitteePeopleEditor, AdminSubmissionPanel) and the server-side validator in
// src/lib/committee.ts, so the dropdown a student sees and the rule the API enforces can never
// drift apart. "INTERNAL" = a PROFESSOR account, "EXTERNAL" = an EXTERNAL account, "BOTH" = either.
//
//                          | ปริญญาโท (ME_MECH/ME_CPS) | ปริญญาเอก (PHD)
//   ADVISOR                | internal, exactly 1       | internal, exactly 1
//   CO_ADVISOR             | either,   0+              | either,   0+
//   HEAD_EXAM_COMMITTEE    | either,   exactly 1       | EXTERNAL, exactly 1
//   EXAM_COMMITTEE         | internal, >=1             | internal, >=1
//   INVITED_EXAM_COMMITTEE | EXTERNAL, >=1             | EXTERNAL, >=1
export type DegreeLevel = "MASTER" | "DOCTORAL";
export type AccountScope = "INTERNAL" | "EXTERNAL" | "BOTH";

/** PHD is the only doctoral program; both ME_* programs are master's. An unset program is treated
 *  as master's — the permissive case, so a not-yet-chosen program never blocks a draft. */
export function degreeOfProgram(program: string | null | undefined): DegreeLevel {
  return program === "PHD" ? "DOCTORAL" : "MASTER";
}

/** PROGRAM_CHAIR is deliberately unconstrained here ("BOTH"): it is never a student-picked row —
 *  it's auto-resolved from the program's admin-designated chair, which POST /api/admin/program-chairs
 *  already restricts to a PROFESSOR account. */
export function committeeRoleScope(role: string, degree: DegreeLevel): AccountScope {
  switch (role) {
    case "ADVISOR":                return "INTERNAL";
    case "EXAM_COMMITTEE":         return "INTERNAL";
    case "INVITED_EXAM_COMMITTEE": return "EXTERNAL";
    case "HEAD_EXAM_COMMITTEE":    return degree === "DOCTORAL" ? "EXTERNAL" : "BOTH";
    default:                       return "BOTH"; // CO_ADVISOR, PROGRAM_CHAIR
  }
}

/** True when an account holding `accountRoles` may fill a role whose scope is `scope`. */
export function accountFitsScope(accountRoles: readonly string[], scope: AccountScope): boolean {
  const internal = accountRoles.includes("PROFESSOR");
  const external = accountRoles.includes("EXTERNAL");
  if (scope === "INTERNAL") return internal;
  if (scope === "EXTERNAL") return external;
  return internal || external;
}

/** One person, one committee role: apart from ประธานหลักสูตร (PROGRAM_CHAIR), who may also sit in
 *  any other position, no account may appear twice in a submission's committee — not in two
 *  different roles, and not twice in the same one. `key` is whatever identifies the account on the
 *  caller's side (an email on a people[] list, a user id on stored committee columns); compare it
 *  normalized. Returns the index of the first entry that repeats an earlier one, or -1. */
export function findDuplicateCommitteeMember(entries: { role: string; key: string }[]): number {
  const seen = new Set<string>();
  for (const [i, e] of entries.entries()) {
    if (!e.key || e.role === "PROGRAM_CHAIR") continue;
    if (seen.has(e.key)) return i;
    seen.add(e.key);
  }
  return -1;
}

export const ACCOUNT_SCOPE_LABELS: Record<AccountScope, string> = {
  INTERNAL: "อาจารย์ภายใน",
  EXTERNAL: "กรรมการภายนอก",
  BOTH:     "อาจารย์ภายในหรือกรรมการภายนอก",
};

// User-level role labels (4 simplified roles)
// Also includes step-role labels (ADVISOR, PROGRAM_CHAIR, etc.) for WorkflowStep display
export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN:           "ผู้ดูแลระบบสูงสุด",
  ADMIN:                 "เจ้าหน้าที่ภาควิชา",
  STUDENT:               "นิสิต",
  PROFESSOR:             "อาจารย์",
  EXTERNAL:              "กรรมการภายนอก",
  // Step role display labels:
  ADVISOR:               "อาจารย์ที่ปรึกษา",
  CO_ADVISOR:            "อาจารย์ที่ปรึกษาร่วม",
  PROGRAM_CHAIR:         "ประธานหลักสูตร",
  HEAD_EXAM_COMMITTEE:   "ประธานกรรมการสอบ",
  EXAM_COMMITTEE:        "กรรมการสอบ",
  INVITED_EXAM_COMMITTEE:"กรรมการภายนอก",
  DEPT_STAFF:            "เจ้าหน้าที่ภาควิชา",
  FACULTY_DEAN:          "คณบดี",
  GRADUATE_SCHOOL:       "บัณฑิตวิทยาลัย",
};

export const ROLE_EMOJI: Record<string, string> = {
  SUPER_ADMIN:            "👑",
  ADMIN:                  "🛡️",
  STUDENT:                "🎓",
  PROFESSOR:              "👨‍🏫",
  EXTERNAL:               "🎓",
  ADVISOR:                "👨‍🏫",
  CO_ADVISOR:             "👨‍🏫",
  PROGRAM_CHAIR:          "🏛️",
  HEAD_EXAM_COMMITTEE:    "📋",
  EXAM_COMMITTEE:         "📋",
  INVITED_EXAM_COMMITTEE: "🎓",
  DEPT_STAFF:             "🛡️",
  FACULTY_DEAN:           "🏫",
  GRADUATE_SCHOOL:        "🎓",
};

export const ROLE_GRADIENT: Record<string, string> = {
  SUPER_ADMIN:            "from-yellow-400 to-amber-600",
  ADMIN:                  "from-slate-700 to-gray-900",
  STUDENT:                "from-blue-500 to-indigo-600",
  PROFESSOR:              "from-violet-500 to-purple-600",
  EXTERNAL:               "from-sky-500 to-blue-600",
  ADVISOR:                "from-violet-500 to-purple-600",
  CO_ADVISOR:             "from-purple-500 to-fuchsia-600",
  PROGRAM_CHAIR:          "from-indigo-600 to-blue-700",
  HEAD_EXAM_COMMITTEE:    "from-orange-500 to-amber-600",
  EXAM_COMMITTEE:         "from-teal-500 to-cyan-600",
  INVITED_EXAM_COMMITTEE: "from-sky-500 to-blue-600",
  DEPT_STAFF:             "from-slate-700 to-gray-900",
  FACULTY_DEAN:           "from-rose-500 to-red-700",
  GRADUATE_SCHOOL:        "from-emerald-500 to-green-700",
};

export const ROLE_DESC: Record<string, string> = {
  SUPER_ADMIN: "ควบคุมระบบทั้งหมด รวมถึงการจัดการผู้ใช้และสิทธิ์",
  ADMIN:       "ดูภาพรวมและจัดการคำร้องทั้งหมด",
  STUDENT:     "ยื่นหัวข้อ อัปโหลดเอกสาร ติดตามสถานะ",
  PROFESSOR:   "ที่ปรึกษา / กรรมการสอบ — ลงนามเอกสารตามที่ได้รับมอบหมาย",
  EXTERNAL:    "กรรมการภายนอก — ลงนามเอกสารตามที่ได้รับมอบหมาย",
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

// Admin-only "rank code" (Axxx/Bxxx/Cxxx/Dxxx) — a per-role-group display order an ADMIN can
// reorder by dragging rows in AdminUsersPanel (see User.rankOrder in prisma/schema.prisma and
// POST /api/admin/users/reorder). Never shown to a non-ADMIN viewer, never directly editable —
// only recomputed here from rankOrder + createdAt. SUPER_ADMIN accounts are deliberately excluded
// (not one of the 4 tracked groups).
export const RANK_PREFIX: Record<string, string> = {
  ADMIN: "A",
  PROFESSOR: "B",
  EXTERNAL: "C",
  STUDENT: "D",
};

export const RANK_ROLES = ["ADMIN", "PROFESSOR", "EXTERNAL", "STUDENT"] as const;

/**
 * Groups users by primary role (roles[0]) among RANK_ROLES, orders each group by rankOrder
 * ascending (null last) then createdAt ascending, and assigns a dense "A001"/"A002"/... code per
 * group. Returns a Map<userId, code> — users outside the 4 tracked roles (e.g. SUPER_ADMIN) are
 * simply absent from the map.
 */
export function computeRankCodes<
  T extends { id: string; roles: string[]; rankOrder?: number | null; createdAt: Date | string }
>(users: T[]): Map<string, string> {
  const codes = new Map<string, string>();
  for (const role of RANK_ROLES) {
    const group = users
      .filter((u) => (u.roles[0] ?? "") === role)
      .sort((a, b) => {
        const ao = a.rankOrder ?? Number.MAX_SAFE_INTEGER;
        const bo = b.rankOrder ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    group.forEach((u, i) => {
      codes.set(u.id, `${RANK_PREFIX[role]}${String(i + 1).padStart(3, "0")}`);
    });
  }
  return codes;
}

/** Numeric position parsed back out of a rank code (e.g. "B007" -> 7) — used to sort a
 * single-role-group view back into rank order client-side. Missing/malformed codes sort last. */
export function rankCodeNumber(code?: string | null): number {
  if (!code) return Number.MAX_SAFE_INTEGER;
  const n = parseInt(code.slice(1), 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
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
  B1:            "บ.วศ.1",
  B1A:          "บ.วศ.1ก",
  B1B:          "บ.วศ.1ข",
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
  COVER_PAGE:    "ใบปะหน้า",
};

/** File format each form type must be uploaded in. FINANCE_ATTACH is filled in from a .docx
 *  template and stays a Word file; B1 (the combined บ.วศ.1ก–ง document) is PDF only. Every
 *  other type keeps the legacy rule (PDF, plus JPEG/PNG server-side). Shared by FileUploader
 *  and POST /api/upload so the picker and the server can't disagree. */
export type FormFileKind = "pdf" | "docx";
export function formFileKind(formType: string): FormFileKind {
  return formType === "FINANCE_ATTACH" ? "docx" : "pdf";
}
export const FORM_FILE_ACCEPT: Record<FormFileKind, string> = {
  pdf:  "application/pdf",
  docx: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
export const FORM_FILE_KIND_LABEL: Record<FormFileKind, string> = { pdf: "PDF", docx: "Word (.docx)" };
/** Client-side check of a picked file against its form type's format. Returns a Thai error or null. */
export function checkFormFile(formType: string, file: File): string | null {
  const kind = formFileKind(formType);
  const ok = kind === "docx" ? /\.docx$/i.test(file.name) : file.type === "application/pdf";
  if (!ok) return `รับเฉพาะไฟล์ ${FORM_FILE_KIND_LABEL[kind]} เท่านั้น`;
  if (file.size > 20 * 1024 * 1024) return "ไฟล์ใหญ่เกิน 20 MB";
  return null;
}

/** Student steps whose required files must be a NEW copy — uploaded after the named earlier step
 *  was approved — because that form type already exists from before. PROPOSAL step 4 re-uploads
 *  the combined B1 (now with บ.วศ.1ค/1ง filled) that steps 1 and 3 already produced, so without
 *  this the old copy would satisfy step 4's gate. Shared by the approve gate, the step-4
 *  auto-advance in POST /api/upload, and the student's upload checklist. */
const FRESH_UPLOAD_AFTER_STEP: Record<string, Record<number, number>> = {
  PROPOSAL: { 4: 3 },
};
/** Upload time (ms) a step's required files must be newer than, or null when any copy counts. */
export function freshUploadCutoff(
  steps: { stepOrder: number; actedAt?: string | Date | null }[],
  submissionType: string | null | undefined,
  stepOrder: number,
): number | null {
  const after = FRESH_UPLOAD_AFTER_STEP[submissionType ?? "PROPOSAL"]?.[stepOrder];
  if (!after) return null;
  const actedAt = steps.find((s) => s.stepOrder === after)?.actedAt;
  return actedAt ? new Date(actedAt).getTime() : 0;
}

/** Documents the submission's own student never sees — the PROPOSAL's finance paperwork is
 *  between the ADMIN and Finance. Filtered out of every submission payload sent to that student
 *  (mapSub in the submissions routes) and refused by the signed-URL route, so it is hidden, not
 *  merely not rendered. THESIS_DEFENSE is unaffected: its student uploads FINANCE_ATTACH at step 1. */
const HIDDEN_FROM_STUDENT_FORMS: Record<string, string[]> = {
  PROPOSAL: ["FINANCE_ATTACH", "FINANCE_DOC"],
  // the defense finance form is generated by the ADMIN at step 2 since 2026-09-30; FINANCE_DOC stays
  // visible — it is one of the Faculty documents forwarded to the student at step 13
  THESIS_DEFENSE: ["FINANCE_ATTACH"],
};
export function isHiddenFromStudent(submissionType: string | null | undefined, formType: string): boolean {
  return (HIDDEN_FROM_STUDENT_FORMS[submissionType ?? "PROPOSAL"] ?? []).includes(formType);
}

/** Form types kept as a single version per submission, keyed by submission type — a newer copy
 *  replaces the old one outright (server: keepOnlyLatestVersion deletes the old row + object) and
 *  FileList shows no ประวัติ for them. Only the ADMIN-generated PROPOSAL finance attachment so far:
 *  whichever copy is newest — generated, or the admin's edited upload — is the one kept. */
const SINGLE_VERSION_FORMS: Record<string, string[]> = {
  PROPOSAL: ["FINANCE_ATTACH", "COVER_PAGE"],
  THESIS_DEFENSE: ["FINANCE_ATTACH"],
};
export function isSingleVersionForm(submissionType: string | null | undefined, formType: string): boolean {
  return (SINGLE_VERSION_FORMS[submissionType ?? "PROPOSAL"] ?? []).includes(formType);
}

/** บ.วศ.1 checklist — what must be filled in and signed in the combined file. The student ticks it
 *  before submitting PROPOSAL step 1; the ADMIN ticks the same items plus ADMIN_B1_EXTRA_CHECKS
 *  before approving step 2; the PROGRAM_CHAIR ticks only CHAIR_B1_CHECKS (their own signature)
 *  before signing off step 3. Client-side attestation only — the system can't read the PDF. */
export const B1_CHECK_GROUPS = [
  { key: "fill",      title: "กรอกข้อมูล" },
  { key: "sign",      title: "ลงนามครบ 3 จุด (นิสิต 2 จุด, อาจารย์ที่ปรึกษา 1 จุด)" },
  { key: "committee", title: "คณะกรรมการ" },
  { key: "chair",     title: "การลงนามของประธานหลักสูตร" },
  { key: "b1c",       title: "บ.วศ.1ค" },
  { key: "b1d",       title: "บ.วศ.1ง" },
  { key: "confirm",   title: "การยืนยันข้อมูล" },
  { key: "mySign",    title: "การลงนามของท่าน" },
  { key: "verify",    title: "การตรวจสอบของเจ้าหน้าที่" },
  { key: "cover",     title: "ใบปะหน้าส่งคณะฯ" },
  { key: "b2",        title: "บ.2" },
  { key: "b3",        title: "บ.3" },
] as const;
export type B1Check = { key: string; group: (typeof B1_CHECK_GROUPS)[number]["key"]; label: string };
export const B1_CHECKS: B1Check[] = [
  { key: "fillA",    group: "fill", label: "กรอกข้อมูลใน บ.วศ.1ก ครบถ้วนแล้ว" },
  { key: "fillB",    group: "fill", label: "กรอกข้อมูลใน บ.วศ.1ข ครบถ้วนแล้ว" },
  { key: "stuSignA", group: "sign", label: "นิสิตลงนามใน บ.วศ.1ก แล้ว" },
  { key: "stuSignB", group: "sign", label: "นิสิตลงนามใน บ.วศ.1ข แล้ว" },
  { key: "advSignA", group: "sign", label: "อาจารย์ที่ปรึกษาลงนามใน บ.วศ.1ก แล้ว" },
];
/** PROPOSAL step 4 — the student fills บ.วศ.1ค/1ง into the same combined file. Signature areas
 *  and every date stay blank (the committee signs and dates them from step 5 on), and the student
 *  confirms the program chair's step-3 signature on บ.วศ.1ก is actually in the file. */
export const B1_STEP4_CHECKS: B1Check[] = [
  { key: "chairSignA", group: "chair",   label: "ไฟล์ บ.วศ.1 มีลายมือชื่อประธานหลักสูตรใน บ.วศ.1ก แล้ว (หากยังไม่มี กรุณาติดต่อเจ้าหน้าที่ก่อนส่ง)" },
  { key: "fillC",      group: "b1c",     label: "กรอกข้อมูลใน บ.วศ.1ค ครบถ้วนแล้ว" },
  { key: "namesC",     group: "b1c",     label: "กรอกรายชื่อคณะกรรมการใน บ.วศ.1ค แล้ว โดยเว้นช่องลงนามว่างไว้" },
  { key: "datesC",     group: "b1c",     label: "เว้นวันที่ทั้งหมดใน บ.วศ.1ค ว่างไว้" },
  { key: "fillD",      group: "b1d",     label: "กรอกข้อมูลใน บ.วศ.1ง ครบถ้วนแล้ว" },
  { key: "namesD",     group: "b1d",     label: "กรอกรายชื่อคณะกรรมการใน บ.วศ.1ง แล้ว" },
  // The บ.วศ.1ง topic goes to the Faculty and is registered in Chula's official system as-is
  { key: "topicD",     group: "b1d",     label: "หัวข้อวิทยานิพนธ์ใน บ.วศ.1ง ถูกต้องตามความเห็นของคณะกรรมการแล้ว (หัวข้อนี้จะถูกส่งไปยังคณะฯ และลงทะเบียนในระบบของจุฬาฯ อย่างเป็นทางการ)" },
  { key: "datesD",     group: "b1d",     label: "เว้นวันที่ทั้งหมดใน บ.วศ.1ง ว่างไว้" },
  { key: "advisorOk",  group: "confirm", label: "ข้อมูลทั้งหมดได้รับการยืนยันจากอาจารย์ที่ปรึกษาหลักแล้ว และสอดคล้องกับผลการพิจารณาของคณะกรรมการในการสอบโครงร่างวิทยานิพนธ์" },
];
export const ADMIN_B1_EXTRA_CHECKS: B1Check[] = [
  { key: "committee", group: "committee", label: "ตรวจสอบรายชื่อคณะกรรมการในคำร้องและเอกสารการเงินถูกต้องแล้ว" },
];
/** PROPOSAL step 6 (stepOrder 10) — the ADMIN verifies the fully-signed B1 before the chair's
 *  final signature */
export const ADMIN_STEP6_CHECKS: B1Check[] = [
  { key: "committeeSigned", group: "verify", label: "ลายมือชื่อคณะกรรมการใน บ.วศ.1ค ครบทุกท่านแล้ว" },
  { key: "formsComplete",   group: "verify", label: "ข้อมูลใน บ.วศ.1ค และ บ.วศ.1ง ครบถ้วนถูกต้องแล้ว" },
  { key: "topicOk",         group: "verify", label: "หัวข้อวิทยานิพนธ์ใน บ.วศ.1ง ถูกต้องตามความเห็นของคณะกรรมการ (หัวข้อนี้จะถูกส่งไปยังคณะฯ และลงทะเบียนในระบบของจุฬาฯ อย่างเป็นทางการ)" },
  { key: "renameTopic",     group: "verify", label: "แก้ไขชื่อหัวข้อวิทยานิพนธ์ในระบบให้ตรงกับหัวข้อใน บ.วศ.1ง แล้ว (ปุ่ม \"แก้ไข\" ในหน้านี้)" },
];
/** PROPOSAL step 8 (stepOrder 12) — the ADMIN's final recheck before the package goes to the
 *  Faculty, plus the cover page (COVER_PAGE, uploaded on the same card) signed by the
 *  department chair (SystemSetting "departmentChair") */
export const ADMIN_STEP8_CHECKS: B1Check[] = [
  { key: "allSigned",   group: "verify", label: "ตรวจสอบ บ.วศ.1ก–ง ครบถ้วน และมีลายมือชื่อครบทุกจุดแล้ว" },
  { key: "titleSynced", group: "verify", label: "ชื่อหัวข้อวิทยานิพนธ์ในระบบตรงกับหัวข้อใน บ.วศ.1ง แล้ว" },
  { key: "coverSigned", group: "cover",  label: "ใบปะหน้ามีลายมือชื่อหัวหน้าภาควิชาแล้ว" },
];
export const CHAIR_B1_CHECKS: B1Check[] = [
  { key: "chairSignA", group: "chair", label: "ประธานหลักสูตรลงนามใน บ.วศ.1ก แล้ว" },
];
/** Committee signing steps 5.1–5.x (stepOrder 5–9): every committee member signs exactly one
 *  place, on บ.วศ.1ค in the combined B1, and confirms it here. */
const SIGN_B1C_CHECKS: B1Check[] = [
  { key: "mySignC", group: "mySign", label: "ท่านลงนามใน บ.วศ.1ค แล้ว (1 จุด)" },
];
/** PROPOSAL step 7 (stepOrder 11) — the program chair's final signatures, on บ.วศ.1ค and 1ง */
const CHAIR_FINAL_CHECKS: B1Check[] = [
  { key: "chairSignC", group: "chair", label: "ประธานหลักสูตรลงนามใน บ.วศ.1ค แล้ว" },
  { key: "chairSignD", group: "chair", label: "ประธานหลักสูตรลงนามใน บ.วศ.1ง แล้ว" },
];
/** THESIS_DEFENSE step 1 — the student prepares บ.2 (one page, signed by the student only), and
 *  with the advisor collects บ.3 from each committee member OUTSIDE the system (student info, topic,
 *  committee names and date filled in by the student; judgement + signature by the member), then
 *  uploads one signed บ.3 per member */
export const DEFENSE_STEP1_CHECKS: B1Check[] = [
  { key: "fillB2",    group: "b2",      label: "กรอกข้อมูลใน บ.2 ครบถ้วน (ข้อมูลนิสิต ผลงานที่เผยแพร่ วัน เวลา และสถานที่สอบ)" },
  { key: "namesB2",   group: "b2",      label: "กรอกรายชื่อคณะกรรมการสอบใน บ.2 แล้ว" },
  { key: "signB2",    group: "b2",      label: "นิสิตลงนามใน บ.2 แล้ว (ช่องนิสิตผู้ขอสอบวิทยานิพนธ์) โดยเว้นช่องลงนามอื่นว่างไว้" },
  { key: "fillB3",    group: "b3",      label: "กรอกข้อมูลนิสิต หัวข้อวิทยานิพนธ์ รายชื่อคณะกรรมการ และวันที่ใน บ.3 แล้ว" },
  { key: "contactB3", group: "b3",      label: "ติดต่อกรรมการแต่ละท่าน (ร่วมกับอาจารย์ที่ปรึกษา) เพื่อประเมินและลงนามใน บ.3 นอกระบบแล้ว" },
  { key: "signedB3",  group: "b3",      label: "อัปโหลด บ.3 ที่กรรมการลงนามแล้ว ครบทุกท่าน (หนึ่งไฟล์ต่อกรรมการหนึ่งท่าน)" },
  { key: "advisorOk", group: "confirm", label: "ข้อมูลทั้งหมดได้รับการยืนยันจากอาจารย์ที่ปรึกษาหลักแล้ว" },
];
/** THESIS_DEFENSE step 2 — the ADMIN checks the student's บ.2/บ.3 and the committee before
 *  generating the finance form (same approve gate as PROPOSAL step 2) */
export const ADMIN_DEFENSE_STEP2_CHECKS: B1Check[] = [
  { key: "b2Ok", group: "verify", label: "ตรวจสอบ บ.2 ครบถ้วนถูกต้อง และมีลายมือชื่อนิสิตแล้ว" },
  { key: "b3Ok", group: "verify", label: "ตรวจสอบ บ.3 ของกรรมการครบทุกท่าน และมีผลการประเมินพร้อมลายมือชื่อแล้ว" },
  ...ADMIN_B1_EXTRA_CHECKS,
];
/** Pre-approve checklist for each PROPOSAL signing step, keyed by stepOrder */
export const PROPOSAL_SIGN_CHECKS: Record<number, B1Check[]> = {
  3: CHAIR_B1_CHECKS,
  5: SIGN_B1C_CHECKS,
  6: SIGN_B1C_CHECKS,
  7: SIGN_B1C_CHECKS,
  8: SIGN_B1C_CHECKS,
  9: SIGN_B1C_CHECKS,
  11: CHAIR_FINAL_CHECKS,
};
/** Pre-approve checklist for each faculty signing step, by submission type → stepOrder */
export const SIGN_CHECKS: Record<string, Record<number, B1Check[]>> = {
  PROPOSAL: PROPOSAL_SIGN_CHECKS,
  THESIS_DEFENSE: {},
};

// Step names for proposal submissions (12 steps)
export const PROPOSAL_STEP_NAMES: Record<number, string> = {
  1:  "นิสิตอัปโหลด บ.วศ.1 (กรอก บ.วศ.1ก + บ.วศ.1ข)",
  2:  "เจ้าหน้าที่ตรวจรับ สร้างเอกสารการเงิน และอนุมัติ",
  3:  "ประธานหลักสูตรลงนาม บ.วศ.1ก",
  4:  "นิสิตอัปโหลด บ.วศ.1 (กรอก บ.วศ.1ค + บ.วศ.1ง)",
  5:  "ประธานกรรมการสอบลงนาม บ.วศ.1ค",
  6:  "อาจารย์ที่ปรึกษาลงนาม บ.วศ.1ค",
  7:  "อาจารย์ที่ปรึกษาร่วมลงนาม บ.วศ.1ค",
  8:  "กรรมการภายนอกลงนาม บ.วศ.1ค",
  9:  "กรรมการสอบลงนาม บ.วศ.1ค",
  10: "เจ้าหน้าที่ตรวจสอบ (รอบ 2)",
  11: "ประธานหลักสูตรลงนาม บ.วศ.1ค + บ.วศ.1ง",
  12: "เจ้าหน้าที่ตรวจสอบเอกสารทั้งหมด และอัปโหลดใบปะหน้าส่งคณะฯ",
};

// Step names for thesis defense submissions (21 steps — see THESIS_ROLES / THESIS_STEP)
export const THESIS_STEP_NAMES: Record<number, string> = {
  1:  "นิสิตอัปโหลด บ.2 + บ.3 ของกรรมการทุกท่าน",
  2:  "อาจารย์ที่ปรึกษาลงนาม บ.2",
  3:  "ประธานกรรมการสอบลงนาม บ.2",
  4:  "เจ้าหน้าที่ตรวจรับ สร้างเอกสารการเงิน และอนุมัติ",
  5:  "ประธานหลักสูตรลงนาม บ.2",
  6:  "เจ้าหน้าที่นำส่งเอกสารไปคณะ",
  7:  "เจ้าหน้าที่อัปโหลดเอกสารจากคณะ",
  8:  "นิสิตอัปโหลดแบบรายงานการเสนอผลงานฯ (กรอกข้อมูลและลงนาม)",
  9:  "อาจารย์ที่ปรึกษาลงนาม แบบรายงานฯ + ใบรายงานผล",
  10: "อาจารย์ที่ปรึกษาร่วมลงนาม แบบรายงานฯ + ใบรายงานผล",
  11: "ประธานกรรมการสอบลงนาม ใบรายงานผล",
  12: "กรรมการสอบลงนาม ใบรายงานผล",
  13: "กรรมการภายนอกลงนาม ใบรายงานผล",
  14: "ประธานหลักสูตรลงนาม ใบรายงานผล",
  15: "นิสิตอัปโหลด บ.4 (กรอกครบถ้วน) + วิทยานิพนธ์ฉบับสมบูรณ์",
  16: "ประธานหลักสูตรลงนาม บ.4",
  17: "อาจารย์ที่ปรึกษาลงนามปกวิทยานิพนธ์",
  18: "อาจารย์ที่ปรึกษาร่วมลงนามปกวิทยานิพนธ์",
  19: "ประธานกรรมการสอบลงนามปกวิทยานิพนธ์",
  20: "กรรมการสอบลงนามปกวิทยานิพนธ์",
  21: "กรรมการภายนอกลงนามปกวิทยานิพนธ์",
};

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

/**
 * Auto-generated temporary password: 6 chars in the pattern A00a00 (1 capital, 4 digits,
 * 1 lowercase) — short enough to type by hand. Excludes visually ambiguous characters
 * (I, O, l, 0, 1) so it's easy to read back from an email.
 */
export function generatePassword(): string {
  const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const LOWER = "abcdefghjkmnpqrstuvwxyz";
  const DIGITS = "23456789";
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  return `${pick(UPPER)}${pick(DIGITS)}${pick(DIGITS)}${pick(LOWER)}${pick(DIGITS)}${pick(DIGITS)}`;
}

/**
 * A passcode an admin types in by hand: 6-72 chars (bcrypt ignores bytes past 72), no
 * leading/trailing/interior whitespace-only garbage. Used both when creating an account and
 * when resetting one — an admin may either type a passcode themselves or use
 * generatePassword() to fill the field, then submit either way.
 */
export function isValidPasscode(passcode: string): boolean {
  const trimmed = passcode.trim();
  return trimmed.length >= 6 && trimmed.length <= 72 && !/\s/.test(trimmed);
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
