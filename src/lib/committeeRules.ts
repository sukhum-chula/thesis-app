// ─── Committee composition rules (admin-configurable) ─────────────────────────
// For each committee role and each degree level: how many people it takes, and which kinds of
// account may fill it. ADMIN edits the table in "ตั้งค่าระบบ" (stored as one JSON SystemSetting,
// `committeeRules` — see src/lib/systemSettings.ts); until then DEFAULT_COMMITTEE_RULES applies.
// Pure and shared: the committee picker, the client validators and the server validators in
// src/lib/committee.ts all read the same rules object, so they can never disagree.
//
// Account kinds: ME = a PROFESSOR whose professorType is ME (this department), CU = a PROFESSOR
// from another Chula department, EX = an EXTERNAL account (กรรมการภายนอก).
//
// PROGRAM_CHAIR is not in the table: it is never a picked row — it's auto-resolved from the
// program's designated chair (always a PROFESSOR, see POST /api/admin/program-chairs).

export type DegreeLevel = "MASTER" | "DOCTORAL";
export type MemberType = "ME" | "CU" | "EX";
export type CountRule = "ONE" | "ZERO_OR_MORE" | "ONE_OR_MORE";
export type RuledRole = "ADVISOR" | "CO_ADVISOR" | "HEAD_EXAM_COMMITTEE" | "EXAM_COMMITTEE" | "INVITED_EXAM_COMMITTEE";
export type DegreeRule = { count: CountRule; types: MemberType[] };
export type CommitteeRule = Record<DegreeLevel, DegreeRule>;
export type CommitteeRules = Record<RuledRole, CommitteeRule>;

/** Table row order. */
export const RULED_ROLES: RuledRole[] = ["ADVISOR", "CO_ADVISOR", "HEAD_EXAM_COMMITTEE", "EXAM_COMMITTEE", "INVITED_EXAM_COMMITTEE"];
export const MEMBER_TYPES: MemberType[] = ["ME", "CU", "EX"];
export const DEGREE_LEVELS: DegreeLevel[] = ["MASTER", "DOCTORAL"];
export const COUNT_RULES: CountRule[] = ["ONE", "ZERO_OR_MORE", "ONE_OR_MORE"];
export const COUNT_RULE_LABELS: Record<CountRule, string> = { ONE: "1", ZERO_OR_MORE: "≥0", ONE_OR_MORE: "≥1" };
export const DEGREE_LABELS: Record<DegreeLevel, string> = { MASTER: "ปริญญาโท", DOCTORAL: "ปริญญาเอก" };
export const MEMBER_TYPE_LABELS: Record<MemberType, string> = {
  ME: "อาจารย์ ME",
  CU: "อาจารย์ CU",
  EX: "กรรมการภายนอก",
};

/** อาจารย์ที่ปรึกษา and ประธานกรรมการสอบ are one id column each on a submission, and the workflow
 *  depends on exactly one (the advisor picks the defense result, the head the proposal result), so
 *  their count is fixed at 1 for both degrees — shown in the table but not editable. */
export const FIXED_COUNT_ROLES: RuledRole[] = ["ADVISOR", "HEAD_EXAM_COMMITTEE"];

const both = (count: CountRule, master: MemberType[], doctoral: MemberType[] = master): CommitteeRule => ({
  MASTER: { count, types: master },
  DOCTORAL: { count, types: doctoral },
});

/** The rules as they were hard-coded before 2026-10-11. */
export const DEFAULT_COMMITTEE_RULES: CommitteeRules = {
  ADVISOR:                both("ONE",          ["ME", "CU"]),
  CO_ADVISOR:             both("ZERO_OR_MORE", ["ME", "CU", "EX"]),
  HEAD_EXAM_COMMITTEE:    both("ONE",          ["ME", "CU", "EX"], ["EX"]),
  EXAM_COMMITTEE:         both("ONE_OR_MORE",  ["ME", "CU"]),
  INVITED_EXAM_COMMITTEE: both("ONE_OR_MORE",  ["EX"]),
};

const ROLE_NAMES: Record<RuledRole, string> = {
  ADVISOR: "อาจารย์ที่ปรึกษา",
  CO_ADVISOR: "อาจารย์ที่ปรึกษาร่วม",
  HEAD_EXAM_COMMITTEE: "ประธานกรรมการสอบ",
  EXAM_COMMITTEE: "กรรมการสอบ",
  INVITED_EXAM_COMMITTEE: "กรรมการภายนอก",
};

/** PHD is the only doctoral program; both ME_* programs are master's. An unset program is treated
 *  as master's, so a not-yet-chosen program never blocks a draft. */
export function degreeOfProgram(program: string | null | undefined): DegreeLevel {
  return program === "PHD" ? "DOCTORAL" : "MASTER";
}

/** Checks an incoming rules object (from the admin's save) and returns it in canonical form, or
 *  a Thai error. Every role and degree must be present, each must allow at least one kind of
 *  account, and the fixed-count roles must stay at 1. */
export function parseCommitteeRules(raw: unknown): { ok: true; rules: CommitteeRules } | { ok: false; error: string } {
  const bad = { ok: false as const, error: "รูปแบบเงื่อนไขคณะกรรมการไม่ถูกต้อง" };
  if (!raw || typeof raw !== "object") return bad;
  const out = {} as CommitteeRules;
  for (const role of RULED_ROLES) {
    const r = (raw as Record<string, unknown>)[role] as Record<string, unknown> | undefined;
    if (!r || typeof r !== "object") return bad;
    const rule = {} as CommitteeRule;
    for (const degree of DEGREE_LEVELS) {
      const d = r[degree] as { count?: unknown; types?: unknown } | undefined;
      if (!d || !COUNT_RULES.includes(d.count as CountRule) || !Array.isArray(d.types) ||
          d.types.some((t) => !MEMBER_TYPES.includes(t))) return bad;
      const count = d.count as CountRule;
      if (FIXED_COUNT_ROLES.includes(role) && count !== "ONE")
        return { ok: false, error: "จำนวนของอาจารย์ที่ปรึกษาและประธานกรรมการสอบต้องเป็น 1 เสมอ" };
      const types = MEMBER_TYPES.filter((t) => (d.types as unknown[]).includes(t)); // canonical order, no repeats
      if (types.length === 0)
        return { ok: false, error: `${ROLE_NAMES[role]} (${DEGREE_LABELS[degree]}) ต้องเลือกประเภทบัญชีอย่างน้อย 1 ประเภท` };
      rule[degree] = { count, types };
    }
    out[role] = rule;
  }
  return { ok: true, rules: out };
}

/** A stored value that no longer parses (shouldn't happen — saves are validated) falls back to the
 *  defaults rather than breaking every committee form. */
export function committeeRulesOrDefault(raw: unknown): CommitteeRules {
  const parsed = raw ? parseCommitteeRules(raw) : null;
  return parsed?.ok ? parsed.rules : DEFAULT_COMMITTEE_RULES;
}

const isRuledRole = (role: string): role is RuledRole => (RULED_ROLES as string[]).includes(role);

/** The kinds of account an account counts as. A PROFESSOR with no professorType counts as CU (the
 *  default for a new professor). */
export function memberTypesOf(account: { roles: readonly string[]; professorType?: string | null }): MemberType[] {
  const types: MemberType[] = [];
  if (account.roles.includes("PROFESSOR")) types.push(account.professorType === "ME" ? "ME" : "CU");
  if (account.roles.includes("EXTERNAL")) types.push("EX");
  return types;
}

/** Kinds of account allowed for `role` at `degree`. Roles outside the table (PROGRAM_CHAIR) allow
 *  every kind. */
export function allowedMemberTypes(role: string, degree: DegreeLevel, rules: CommitteeRules): MemberType[] {
  return isRuledRole(role) ? rules[role][degree].types : MEMBER_TYPES;
}

/** True when `account` may fill `role` at `degree`. */
export function accountFitsRole(
  account: { roles: readonly string[]; professorType?: string | null },
  role: string,
  degree: DegreeLevel,
  rules: CommitteeRules
): boolean {
  const allowed = allowedMemberTypes(role, degree, rules);
  return memberTypesOf(account).some((t) => allowed.includes(t));
}

/** "อาจารย์ ME, อาจารย์ CU หรือ กรรมการภายนอก" — for "เลือกจาก: …" hints and error messages. */
export function memberTypesLabel(types: MemberType[]): string {
  const names = types.map((t) => MEMBER_TYPE_LABELS[t]);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} หรือ ${names[names.length - 1]}`;
}

/** Thai error when `n` people in `role` break its count rule at `degree`, else null. */
export function countRuleError(role: RuledRole, n: number, degree: DegreeLevel, rules: CommitteeRules): string | null {
  const count = rules[role][degree].count;
  if (count === "ONE" && n !== 1) return `ต้องระบุ${ROLE_NAMES[role]} 1 คน`;
  if (count === "ONE_OR_MORE" && n < 1) return `ต้องระบุ${ROLE_NAMES[role]}อย่างน้อย 1 คน`;
  return null;
}
