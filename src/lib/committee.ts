import { prisma } from "@/lib/prisma";
import { isValidEmail, isValidThaiPhone } from "@/lib/utils";

export type PersonInput = { name?: string; email?: string; role?: string; phone?: string };

export const PERSON_ROLES = [
  "ADVISOR",
  "CO_ADVISOR",
  "HEAD_EXAM_COMMITTEE",
  "EXAM_COMMITTEE",
  "INVITED_EXAM_COMMITTEE",
  "PROGRAM_CHAIR",
] as const;

export const emptyPerson = (role = ""): { name: string; email: string; role: string; phone: string } => ({
  name: "", email: "", role, phone: "",
});

/** Shape/format/role-count validation for a committee people[] array. Returns a Thai error
 *  message, or null if the list is well-formed. Does NOT check whether accounts exist —
 *  that's resolvePeople()'s job. Shared by PROPOSAL creation and defense committee edits. */
export function validatePeople(people: PersonInput[], studentOwnEmails: Set<string>): string | null {
  if (people.length === 0)
    return "กรุณาระบุอาจารย์และกรรมการที่รับผิดชอบวิทยานิพนธ์";

  const seenRoleEmail = new Set<string>();
  for (const p of people) {
    if (!p.name?.trim() || !p.email?.trim() || !p.role || !(PERSON_ROLES as readonly string[]).includes(p.role))
      return "กรุณากรอกชื่อ อีเมล และบทบาทของกรรมการให้ครบทุกคน";
    if (p.name.trim().length > 200)
      return `ชื่อของกรรมการยาวเกิน 200 ตัวอักษร`;
    // A typo'd email would leave a permanently-unresolvable draft — reject early
    if (!isValidEmail(p.email))
      return `รูปแบบอีเมลของ "${p.name.trim()}" ไม่ถูกต้อง (${p.email.trim()})`;
    if (p.phone?.trim() && !isValidThaiPhone(p.phone))
      return `เบอร์โทรศัพท์ของ "${p.name.trim()}" ไม่ถูกต้อง (ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0)`;
    const email = p.email.trim().toLowerCase();
    // A committee person may not be the student themselves
    if (studentOwnEmails.has(email))
      return "ไม่สามารถใช้อีเมลของนิสิตเป็นกรรมการได้";
    // Same email may hold multiple roles, but not the SAME role twice (breaks sequential signing)
    const key = `${p.role}:${email}`;
    if (seenRoleEmail.has(key))
      return "อีเมลนี้ถูกเพิ่มในบทบาทเดียวกันซ้ำ";
    seenRoleEmail.add(key);
  }
  const count = (r: string) => people.filter((p) => p.role === r).length;
  if (count("PROGRAM_CHAIR") !== 1) return "ต้องระบุประธานหลักสูตร 1 คน (เพิ่มได้เพียง 1 คนเท่านั้น)";
  if (count("ADVISOR") !== 1) return "ต้องระบุอาจารย์ที่ปรึกษา 1 คน";
  if (count("HEAD_EXAM_COMMITTEE") !== 1) return "ต้องระบุประธานกรรมการสอบ 1 คน";
  if (count("EXAM_COMMITTEE") < 1) return "ต้องระบุกรรมการสอบอย่างน้อย 1 คน";
  if (count("INVITED_EXAM_COMMITTEE") !== 1) return "ต้องระบุกรรมการภายนอก 1 คน";
  return null;
}

export type ResolvedCommittee = {
  advisorId: string;
  headCommitteeId: string;
  programChairId: string;
  coAdvisorIds: string[];
  committeeIds: string[];
  invitedCommitteeId: string;
  invitedProfName: string;
  invitedProfEmail: string;
  invitedProfPhone: string | null;
};

/** Resolves a validated people[] array against existing accounts — never creates one.
 *  Assumes validatePeople() already passed (role counts, format). Returns either the resolved
 *  committee field values, or the list of emails that don't have an account yet. */
export async function resolvePeople(
  people: PersonInput[]
): Promise<({ ok: true } & ResolvedCommittee) | { ok: false; missingEmails: string[] }> {
  const uniqueEmails = [...new Set(people.map((p) => p.email!.trim().toLowerCase()))];
  const existingUsers = await prisma.user.findMany({ where: { email: { in: uniqueEmails } } });
  const idByEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u.id]));
  const missingEmails = uniqueEmails.filter((e) => !idByEmail.has(e));
  if (missingEmails.length > 0) return { ok: false, missingEmails };

  const idOf = (p: PersonInput) => idByEmail.get(p.email!.trim().toLowerCase())!;
  const coAdvisorIds = [...new Set(people.filter((p) => p.role === "CO_ADVISOR").map(idOf))];
  const committeeIds = [...new Set(people.filter((p) => p.role === "EXAM_COMMITTEE").map(idOf))];
  const invited = people.find((p) => p.role === "INVITED_EXAM_COMMITTEE")!;

  return {
    ok: true,
    advisorId: idOf(people.find((p) => p.role === "ADVISOR")!),
    headCommitteeId: idOf(people.find((p) => p.role === "HEAD_EXAM_COMMITTEE")!),
    programChairId: idOf(people.find((p) => p.role === "PROGRAM_CHAIR")!),
    coAdvisorIds,
    committeeIds,
    invitedCommitteeId: idOf(invited),
    invitedProfName: invited.name!.trim(),
    invitedProfEmail: invited.email!.trim().toLowerCase(),
    invitedProfPhone: invited.phone?.trim() || null,
  };
}
