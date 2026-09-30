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

// THESIS_DEFENSE: 23 steps — บ.2/3 through thesis cover signing. Restructured 2026-09-30: step 2 is
// the ADMIN check that generates the finance form, and step 3 is ONE step in which the whole
// committee fills in its judgement and signs the student's single-page บ.3 — in parallel
// (ALL_COMMITTEE, see PARALLEL_ROLES). Everything from the บ.2 signatures on is the old workflow
// shifted by +1. Refer to steps through THESIS_STEP below, never bare numbers.
export const THESIS_ROLES = [
  "STUDENT",               // 1  upload B2 + B3 (two PDFs)
  "ADMIN",                 // 2  check + generate FINANCE_ATTACH → approve sends the finance email
  "ALL_COMMITTEE",         // 3  every committee member fills in + signs บ.3, in any order (parallel)
  "ADVISOR",               // 4  sign B2
  "CO_ADVISOR",            // 5  sign B2 (sequential, skipped if no co-advisors)
  "HEAD_EXAM_COMMITTEE",   // 6  sign B2
  "PROGRAM_CHAIR",         // 7  sign B2 → notify admin
  "ADMIN",                 // 8  collect + send B2+B3 to Faculty
  "ADMIN",                 // 9  receive faculty docs + upload + send invitation letters
  "STUDENT",               // 10 fill + sign แบบรายงานฯ
  "ADVISOR",               // 11 sign แบบรายงาน + ใบรายงานผล
  "CO_ADVISOR",            // 12 sign แบบรายงาน + ใบรายงานผล (sequential, skipped if none)
  "HEAD_EXAM_COMMITTEE",   // 13 sign ใบรายงานผล
  "EXAM_COMMITTEE",        // 14 sign ใบรายงานผล (sequential)
  "INVITED_EXAM_COMMITTEE",// 15 sign ใบรายงานผล
  "PROGRAM_CHAIR",         // 16 sign ใบรายงานผล
  "STUDENT",               // 17 upload B4 + THESIS
  "PROGRAM_CHAIR",         // 18 sign B4
  "ADVISOR",               // 19 sign thesis cover
  "CO_ADVISOR",            // 20 sign thesis cover (sequential, skipped if none)
  "HEAD_EXAM_COMMITTEE",   // 21 sign thesis cover
  "EXAM_COMMITTEE",        // 22 sign thesis cover (sequential)
  "INVITED_EXAM_COMMITTEE",// 23 sign thesis cover
] as const;

/** Named THESIS_DEFENSE stepOrders for the steps code branches on — use these, never bare numbers,
 *  so the next restructure only has to touch THESIS_ROLES and this map. */
export const THESIS_STEP = {
  STUDENT_B2_B3:      1,
  ADMIN_CHECK:        2,  // generates FINANCE_ATTACH; approving sends the finance email
  COMMITTEE_B3:       3,  // ALL_COMMITTEE: whole committee judges + signs บ.3 in parallel
  CHAIR_B2:           7,  // last บ.2 signature → admins notified to send to the Faculty
  ADMIN_RELAY:        8,
  ADMIN_FACULTY_DOCS: 9,  // uploads SIGNED/EXAM_RESULT/INVITE_LETTER/FINANCE_DOC → invitation emails
  STUDENT_REPORT:     10, // student signs แบบรายงานฯ (SIGNED)
  ADVISOR_RESULT:     11, // advisor picks the exam result
  STUDENT_THESIS:     17, // B4 + THESIS
} as const;

/** Multi-member roles whose members may sign in ANY order (all at once) instead of in list order.
 *  ALL_COMMITTEE is the whole committee on one step — its member list is allCommitteeIds(). */
export const PARALLEL_ROLES = ["ALL_COMMITTEE"] as const;
export function isParallelRole(role: string): boolean {
  return (PARALLEL_ROLES as readonly string[]).includes(role);
}

/** Every committee member of a submission, in the committee's usual order (head → advisor →
 *  co-advisors → external → exam committee), deduped. The ALL_COMMITTEE step's member list. */
export function allCommitteeIds(c: {
  headCommitteeId?: string | null; advisorId?: string | null;
  coAdvisorIds?: string[] | null; invitedCommitteeIds?: string[] | null; committeeIds?: string[] | null;
}): string[] {
  return [...new Set([
    c.headCommitteeId, c.advisorId,
    ...(c.coAdvisorIds ?? []), ...(c.invitedCommitteeIds ?? []), ...(c.committeeIds ?? []),
  ].filter((x): x is string => !!x))];
}

/** Builds the create-input array for a submission's workflow steps, shared by initial
 *  creation and by finalizing a DRAFT once its committee resolves. */
export function buildWorkflowSteps(
  submissionType: SubmissionType | null | undefined,
  coAdvisorIds: string[],
  committeeIds: string[],
  invitedCommitteeIds: string[],
  /** the single-holder roles, needed only for the ALL_COMMITTEE (whole-committee) step */
  people: { advisorId?: string | null; headCommitteeId?: string | null } = {}
): { stepOrder: number; role: string; status: StepStatus; committeeMembers: string[] }[] {
  const roles = submissionType === "THESIS_DEFENSE" ? THESIS_ROLES : PROPOSAL_ROLES;
  return roles.map((role, i) => ({
    stepOrder: i + 1,
    role,
    status: role === "CO_ADVISOR" && !coAdvisorIds.length ? "SKIPPED" : "PENDING",
    committeeMembers:
      role === "EXAM_COMMITTEE"          ? committeeIds :
      role === "CO_ADVISOR"              ? coAdvisorIds :
      role === "INVITED_EXAM_COMMITTEE"  ? invitedCommitteeIds :
      role === "ALL_COMMITTEE"           ? allCommitteeIds({ ...people, coAdvisorIds, invitedCommitteeIds, committeeIds }) : [],
  }));
}

// ─── Keeping multi-member steps in step with an edited committee ──────────────
// A CO_ADVISOR/EXAM_COMMITTEE/INVITED_EXAM_COMMITTEE step snapshots its member list into
// `committeeMembers` when the steps are built, and signing (sign/route.ts) reads only that
// snapshot. So when an ADMIN edits the committee on a running submission (`admin_update`), every
// step that is still open has to be brought in line, or it keeps waiting on the old people.

export const MULTI_MEMBER_ROLES = ["CO_ADVISOR", "EXAM_COMMITTEE", "INVITED_EXAM_COMMITTEE", "ALL_COMMITTEE"] as const;

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
  ALL_COMMITTEE: "คณะกรรมการสอบครบทุกท่าน",
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
  committee: {
    coAdvisorIds: string[]; committeeIds: string[]; invitedCommitteeIds: string[];
    advisorId?: string | null; headCommitteeId?: string | null;
  },
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
    : role === "ALL_COMMITTEE" ? allCommitteeIds(committee)
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
