import { StepStatus, SubmissionType } from "@/types";

// PROPOSAL: 11 steps — บ.วศ.1ก/1ข then บ.วศ.1ค/1ง
export const PROPOSAL_ROLES = [
  "STUDENT",               // 1  upload BW1A + BW1B
  "ADMIN",                 // 2  approve
  "PROGRAM_CHAIR",         // 3  sign BW1A → finance email
  "STUDENT",               // 4  upload B1C + B1D
  "HEAD_EXAM_COMMITTEE",   // 5  sign B1C
  "ADVISOR",               // 6  sign B1C
  "CO_ADVISOR",            // 7  sign B1C (sequential, skipped if no co-advisors)
  "INVITED_EXAM_COMMITTEE",// 8  sign B1C
  "EXAM_COMMITTEE",        // 9  sign B1C + B1D (all members)
  "ADMIN",                 // 10 approve
  "PROGRAM_CHAIR",         // 11 sign B1C + B1D
] as const;

// THESIS_DEFENSE: 22 steps — บ.2/3 through thesis cover signing
export const THESIS_ROLES = [
  "STUDENT",               // 1  upload B2 + B3
  "EXAM_COMMITTEE",        // 2  sign B3 (sequential)
  "ADVISOR",               // 3  sign B2
  "CO_ADVISOR",            // 4  sign B2 (sequential, skipped if no co-advisors)
  "HEAD_EXAM_COMMITTEE",   // 5  sign B2
  "PROGRAM_CHAIR",         // 6  sign B2 → notify admin
  "ADMIN",                 // 7  collect + send B2+B3 to Faculty
  "ADMIN",                 // 8  receive faculty docs + upload + send invitation letters
  "STUDENT",               // 9  fill + sign แบบรายงานฯ
  "ADVISOR",               // 10 sign แบบรายงาน + ใบรายงานผล
  "CO_ADVISOR",            // 11 sign แบบรายงาน + ใบรายงานผล (sequential, skipped if none)
  "HEAD_EXAM_COMMITTEE",   // 12 sign ใบรายงานผล
  "EXAM_COMMITTEE",        // 13 sign ใบรายงานผล (sequential)
  "INVITED_EXAM_COMMITTEE",// 14 sign ใบรายงานผล
  "PROGRAM_CHAIR",         // 15 sign ใบรายงานผล
  "STUDENT",               // 16 upload B4 + THESIS
  "PROGRAM_CHAIR",         // 17 sign B4
  "ADVISOR",               // 18 sign thesis cover
  "CO_ADVISOR",            // 19 sign thesis cover (sequential, skipped if none)
  "HEAD_EXAM_COMMITTEE",   // 20 sign thesis cover
  "EXAM_COMMITTEE",        // 21 sign thesis cover (sequential)
  "INVITED_EXAM_COMMITTEE",// 22 sign thesis cover
] as const;

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
