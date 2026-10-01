import { StepStatus, SubmissionType } from "@/types";

// PROPOSAL: 12 steps — one combined บ.วศ.1 file (1ก/1ข, then 1ค/1ง), shown as 1–4, 5.1–5.x, 6–8
export const PROPOSAL_ROLES = [
  "STUDENT",               // 1  upload B1 (combined file, บ.วศ.1ก+1ข filled) + FINANCE_ATTACH (.docx)
  "ADMIN",                 // 2  approve
  "PROGRAM_CHAIR",         // 3  sign บ.วศ.1ก in B1 → finance email
  "STUDENT",               // 4  upload B1C + B1D
  "HEAD_EXAM_COMMITTEE",   // 5  sign B1C
  "ADVISOR",               // 6  sign B1C
  "CO_ADVISOR",            // 7  sign B1C (sequential, skipped if no co-advisors)
  "INVITED_EXAM_COMMITTEE",// 8  sign B1C
  "EXAM_COMMITTEE",        // 9  sign B1C + B1D (all members)
  "ADMIN",                 // 10 approve
  "PROGRAM_CHAIR",         // 11 sign B1C + B1D
  "ADMIN",                 // 12 recheck everything + upload the cover page (COVER_PAGE) for the Faculty
] as const;

// THESIS_DEFENSE: 20 steps — บ.2/3 through the student's iThesis confirmation. Restructured 2026-09-30, again
// 2026-10-01: the committee's บ.3 evaluations are collected OUTSIDE the system (the student and
// advisor contact each member) and uploaded by the student at step 1, one copy per member
// (FormUpload.memberId); บ.2 is uploaded at step 1 already signed by the student, the advisor and
// the head of committee (also outside the system — the student attests it in the checklist), so the
// ADMIN check that generates the finance form comes straight after; the program chair signs บ.2
// last. ใบรายงานผลการสอบ is signed by the whole committee (advisor, co-advisors, head, exam
// committee, external) and then the department chair — never the student or the program chair;
// แบบรายงานการเสนอผลงานฯ only by the student and the advisor. After the committee signs, the ADMIN checks, the department chair
// (หัวหน้าภาควิชา, SystemSetting departmentChair) signs it, and the ADMIN sends it to the Faculty
// with a cover page. The thesis itself is uploaded already signed by the whole committee (no
// in-system cover-signing steps since 2026-10-01); the ADMIN checks it and adds a cover page, the
// department chair signs บ.4 + the thesis, and the ADMIN confirms sending it to the Faculty and,
// once the Faculty replies, forwarding that reply to the student; the student then confirms that
// every required document is in the iThesis system, which completes the defense. Refer to steps through THESIS_STEP below, never bare numbers.
export const THESIS_ROLES = [
  "STUDENT",               // 1  upload B2 (signed by student + advisor + head) + one signed B3 per member
  "ADMIN",                 // 2  check + generate FINANCE_ATTACH → approve sends the finance email
  "PROGRAM_CHAIR",         // 3  sign B2 → notify admin
  "ADMIN",                 // 4  collect + send B2+B3 to Faculty
  "ADMIN",                 // 5  confirm the Faculty's email was forwarded to the student
  "STUDENT",               // 6  fill + sign แบบรายงานฯ; upload it + ใบรายงานผลการสอบ (from the Faculty email)
  "ADVISOR",               // 7  sign แบบรายงาน + ใบรายงานผล (แบบรายงานฯ: student + advisor only)
  "CO_ADVISOR",            // 8  sign ใบรายงานผล (sequential, skipped if none)
  "HEAD_EXAM_COMMITTEE",   // 9  sign ใบรายงานผล
  "EXAM_COMMITTEE",        // 10 sign ใบรายงานผล (sequential)
  "INVITED_EXAM_COMMITTEE",// 11 sign ใบรายงานผล
  "ADMIN",                 // 12 check the signed ใบรายงานผล + แบบรายงานฯ
  "DEPARTMENT_CHAIR",      // 13 department chair signs ใบรายงานผล (its last signature)
  "ADMIN",                 // 14 upload the cover page + confirm the email to the Faculty was sent
  "STUDENT",               // 15 upload B4 + THESIS (already signed by the whole committee, outside the system)
  "ADMIN",                 // 16 check the student's B4 + THESIS, upload the cover page
  "DEPARTMENT_CHAIR",      // 17 department chair signs B4 + THESIS
  "ADMIN",                 // 18 confirm the email to the Faculty was sent
  "ADMIN",                 // 19 confirm the Faculty's feedback email was forwarded to the student
  "STUDENT",               // 20 confirm every required document was submitted to iThesis — last step
] as const;

/** Named THESIS_DEFENSE stepOrders for the steps code branches on — use these, never bare numbers,
 *  so the next restructure only has to touch THESIS_ROLES and this map. */
export const THESIS_STEP = {
  STUDENT_B2_B3:      1,  // B2 (student + advisor + head signed) + one B3 per committee member (committeeRoster)
  ADMIN_CHECK:        2,  // generates FINANCE_ATTACH; approving sends the finance email
  CHAIR_B2:           3,  // last บ.2 signature → admins notified to send to the Faculty
  ADMIN_RELAY:        4,
  ADMIN_FORWARD:      5,  // confirm only: Faculty email forwarded to the student (no uploads)
  STUDENT_REPORT:     6,  // student uploads แบบรายงานฯ (SIGNED) + ใบรายงานผลการสอบ (EXAM_RESULT)
  ADVISOR_RESULT:     7,  // advisor picks the exam result
  ADMIN_RESULT_CHECK: 12, // ADMIN checks the committee-signed ใบรายงานผล + แบบรายงานฯ
  DEPT_CHAIR_RESULT:  13, // department chair signs ใบรายงานผล (role DEPARTMENT_CHAIR)
  ADMIN_RESULT_SEND:  14, // ADMIN uploads the cover page + confirms the email to the Faculty
  STUDENT_THESIS:     15, // B4 + THESIS
  ADMIN_THESIS_CHECK: 16, // ADMIN checks B4 + THESIS, uploads the cover page (a new one)
  DEPT_CHAIR_THESIS:  17, // department chair signs B4 + THESIS (role DEPARTMENT_CHAIR)
  ADMIN_THESIS_SEND:  18, // ADMIN confirms the email to the Faculty was sent
  ADMIN_THESIS_FORWARD: 19, // ADMIN confirms the Faculty's feedback was forwarded to the student
  STUDENT_ITHESIS:    20, // student confirms every required document is in iThesis (no upload)
} as const;

/** The ADMIN step that generates the finance attachment (and whose approval emails it), by type:
 *  PROPOSAL step 2, THESIS_DEFENSE step 2. The one place this number lives. */
export function financeStepOf(submissionType: string | null | undefined): number {
  return submissionType === "THESIS_DEFENSE" ? THESIS_STEP.ADMIN_CHECK : 2;
}

type CommitteeFields = {
  headCommitteeId?: string | null; advisorId?: string | null;
  coAdvisorIds?: string[] | null; invitedCommitteeIds?: string[] | null; committeeIds?: string[] | null;
};
/** Every committee member of a submission with the role they hold, in the committee's usual order
 *  (head → advisor → co-advisors → external → exam committee), deduped (first role wins). The
 *  list the THESIS_DEFENSE step-1 per-member บ.3 uploads are checked against. */
export function committeeRoster(c: CommitteeFields): { id: string; role: string }[] {
  const pairs: [string | null | undefined, string][] = [
    [c.headCommitteeId, "HEAD_EXAM_COMMITTEE"], [c.advisorId, "ADVISOR"],
    ...(c.coAdvisorIds ?? []).map((id): [string, string] => [id, "CO_ADVISOR"]),
    ...(c.invitedCommitteeIds ?? []).map((id): [string, string] => [id, "INVITED_EXAM_COMMITTEE"]),
    ...(c.committeeIds ?? []).map((id): [string, string] => [id, "EXAM_COMMITTEE"]),
  ];
  const seen = new Set<string>();
  const out: { id: string; role: string }[] = [];
  for (const [id, role] of pairs) if (id && !seen.has(id)) { seen.add(id); out.push({ id, role }); }
  return out;
}
export function allCommitteeIds(c: CommitteeFields): string[] {
  return committeeRoster(c).map((m) => m.id);
}

/** Form types collected once per committee member (FormUpload.memberId), by submission type. */
export const PER_MEMBER_FORMS: Record<string, string[]> = {
  THESIS_DEFENSE: ["B3"],
};
export function isPerMemberForm(submissionType: string | null | undefined, formType: string): boolean {
  return (PER_MEMBER_FORMS[submissionType ?? "PROPOSAL"] ?? []).includes(formType);
}

/** Builds the create-input array for a submission's workflow steps, shared by initial
 *  creation and by finalizing a DRAFT once its committee resolves. */
export function buildWorkflowSteps(
  submissionType: SubmissionType | null | undefined,
  coAdvisorIds: string[],
  committeeIds: string[],
  invitedCommitteeIds: string[]
): { stepOrder: number; role: string; status: StepStatus; committeeMembers: string[] }[] {
  const roles = submissionType === "THESIS_DEFENSE" ? THESIS_ROLES : PROPOSAL_ROLES;
  return roles.map((role, i) => ({
    stepOrder: i + 1,
    role,
    status: role === "CO_ADVISOR" && !coAdvisorIds.length ? "SKIPPED" : "PENDING",
    committeeMembers:
      role === "EXAM_COMMITTEE"          ? committeeIds :
      role === "CO_ADVISOR"              ? coAdvisorIds :
      role === "INVITED_EXAM_COMMITTEE"  ? invitedCommitteeIds : [],
  }));
}

// ─── Keeping multi-member steps in step with an edited committee ──────────────
// A CO_ADVISOR/EXAM_COMMITTEE/INVITED_EXAM_COMMITTEE step snapshots its member list into
// `committeeMembers` when the steps are built, and signing (sign/route.ts) reads only that
// snapshot. So when an ADMIN edits the committee on a running submission (`admin_update`), every
// step that is still open has to be brought in line, or it keeps waiting on the old people.

export const MULTI_MEMBER_ROLES = ["CO_ADVISOR", "EXAM_COMMITTEE", "INVITED_EXAM_COMMITTEE"] as const;

type CommitteeAction = { userId: string; decision: string; [k: string]: unknown };
type SyncableStep = {
  id: string;
  stepOrder: number;
  role: string;
  status: StepStatus | string;
  committeeMembers: string[];
  committeeActions: unknown;
};
export type StepSyncPatch = {
  id: string;
  data: {
    status?: StepStatus;
    committeeMembers?: string[];
    committeeActions?: CommitteeAction[];
    actedAt?: Date | null;
    actedByName?: string | null;
    actedById?: string | null;
    notes?: string | null;
  };
};

const ALL_APPROVED_LABEL: Record<string, string> = {
  CO_ADVISOR: "อาจารย์ที่ปรึกษาร่วมครบทุกท่าน",
  EXAM_COMMITTEE: "กรรมการสอบครบทุกท่าน",
  INVITED_EXAM_COMMITTEE: "กรรมการภายนอกครบทุกท่าน",
};

/** Plans the step updates that bring a submission's open multi-member steps in line with its
 *  (new) committee. Pure — the caller applies the patches and re-derives the submission status.
 *
 *  - Finished history (APPROVED steps, and SKIPPED steps before the current one) is never touched.
 *  - An open step (PENDING, or the REJECTED step awaiting resubmit) gets the new member list.
 *    Sign-offs by members who are still on it are kept; those of removed members are dropped. If
 *    everyone left on the current step has already approved, it's approved on the spot — it
 *    would otherwise sit waiting for a signature nobody can give.
 *  - CO_ADVISOR is optional: removing every co-advisor SKIPS its open steps, and adding one
 *    re-opens the SKIPPED co-advisor steps that are still ahead.
 *  - A CANCELLED/COMPLETED/DRAFT submission is left alone (nothing open, or no steps yet);
 *    admin_reset refreshes the member lists when a cancelled one is revived. */
export function planCommitteeStepSync(
  steps: SyncableStep[],
  committee: { coAdvisorIds: string[]; committeeIds: string[]; invitedCommitteeIds: string[] },
  submissionStatus: string,
  now: Date
): StepSyncPatch[] {
  if (submissionStatus !== "IN_PROGRESS" && submissionStatus !== "REJECTED") return [];
  const open = steps.filter((s) => s.status === "PENDING" || s.status === "REJECTED");
  if (open.length === 0) return [];
  const currentOrder = Math.min(...open.map((s) => s.stepOrder));

  const membersFor = (role: string) =>
    role === "CO_ADVISOR" ? committee.coAdvisorIds
    : role === "EXAM_COMMITTEE" ? committee.committeeIds
    : committee.invitedCommitteeIds;
  const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const cleared = { committeeActions: [], actedAt: null, actedByName: null, actedById: null, notes: null };

  const patches: StepSyncPatch[] = [];
  for (const step of steps) {
    if (!(MULTI_MEMBER_ROLES as readonly string[]).includes(step.role)) continue;
    const members = [...new Set(membersFor(step.role).filter(Boolean))];
    const actions = ((step.committeeActions as CommitteeAction[] | null) ?? []);

    if (step.status === "SKIPPED") {
      if (step.role === "CO_ADVISOR" && members.length > 0 && step.stepOrder > currentOrder)
        patches.push({ id: step.id, data: { status: "PENDING", committeeMembers: members, ...cleared } });
      continue;
    }
    if (step.status !== "PENDING" && step.status !== "REJECTED") continue; // APPROVED — history

    if (members.length === 0) {
      // Only reachable for CO_ADVISOR: the admin edit's count check requires ≥1 of the others.
      patches.push({ id: step.id, data: { status: "SKIPPED", committeeMembers: [], ...cleared } });
      continue;
    }

    if (step.status === "REJECTED") {
      // The student's resubmit clears the sign-offs anyway; only the member list matters here.
      if (!sameList(step.committeeMembers, members))
        patches.push({ id: step.id, data: { committeeMembers: members } });
      continue;
    }

    const kept = actions.filter((a) => members.includes(a.userId));
    const allApproved = step.stepOrder === currentOrder &&
      members.every((m) => kept.some((a) => a.userId === m && a.decision === "APPROVED"));
    if (allApproved) {
      const last = kept[kept.length - 1];
      patches.push({ id: step.id, data: {
        status: "APPROVED", committeeMembers: members, committeeActions: kept,
        actedAt: now, actedByName: ALL_APPROVED_LABEL[step.role], actedById: last?.userId ?? null,
      } });
    } else if (!sameList(step.committeeMembers, members) || kept.length !== actions.length) {
      patches.push({ id: step.id, data: { committeeMembers: members, committeeActions: kept } });
    }
  }
  return patches;
}

/** Who the submission is waiting on right now: the lowest open step, and for a multi-member step
 *  the first member in sign order who hasn't approved yet. Used to tell whether a committee edit
 *  changed whose turn it is, so the new person can be notified. */
export function currentTurn(steps: SyncableStep[]): { stepId: string; role: string; memberId?: string } | null {
  const step = [...steps].sort((a, b) => a.stepOrder - b.stepOrder)
    .find((s) => s.status === "PENDING" || s.status === "REJECTED");
  if (!step || step.status === "REJECTED") return null; // REJECTED waits on the student's resubmit
  if (!(MULTI_MEMBER_ROLES as readonly string[]).includes(step.role)) return { stepId: step.id, role: step.role };
  const actions = ((step.committeeActions as CommitteeAction[] | null) ?? []);
  const memberId = step.committeeMembers.find(
    (m) => !actions.some((a) => a.userId === m && a.decision === "APPROVED")
  );
  return { stepId: step.id, role: step.role, memberId };
}

type StepLike = { stepOrder: number; role: string; status: string };

/** The nearest earlier step that isn't SKIPPED — where ส่งกลับ (`return_to_prev`) sends a step back to. */
export function previousActiveStep<T extends StepLike>(steps: T[], step: StepLike): T | undefined {
  return steps
    .filter((s) => s.stepOrder < step.stepOrder && s.status !== "SKIPPED")
    .sort((a, b) => b.stepOrder - a.stepOrder)[0];
}
