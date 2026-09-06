export type Role = "SUPER_ADMIN" | "ADMIN" | "STUDENT" | "PROFESSOR";

export type FormType = "BW1A" | "BW1B" | "B1C" | "B1D" | "B2" | "B3" | "B4" | "THESIS" | "SIGNED" | "FINANCE_DOC" | "FINANCE_ATTACH" | "EXAM_RESULT" | "INVITE_LETTER" | "VERY_GOOD_EVAL";
export type ProgramType = "PHD" | "ME_MECH" | "ME_CPS";
export type SubmissionType = "PROPOSAL" | "THESIS_DEFENSE";
export type StepStatus = "PENDING" | "APPROVED" | "REJECTED" | "SKIPPED";
export type SubmissionStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | "CANCELLED";

export interface MockUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  role: Role; // primary role = roles[0]
  studentId?: string;
  isProgramChair?: boolean;
}

export interface MockUpload {
  id: string;
  formType: FormType;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  fileUrl?: string | null;
}

export interface CommitteeAction {
  userId: string;
  name: string;
  decision: "APPROVED" | "REJECTED";
  notes?: string;
  actedAt: string;
}

export interface MockWorkflowStep {
  id: string;
  stepOrder: number;
  role: string; // step role strings (ADVISOR, PROGRAM_CHAIR, etc.) — not same as user Role
  status: StepStatus;
  notes?: string;
  actedAt?: string;
  actedByName?: string;
  actedById?: string;
  committeeMembers?: string[];
  committeeActions?: CommitteeAction[];
}

export type NotificationType = "pending" | "approved" | "rejected" | "info" | "warning";

export interface MockNotification {
  id: string;
  recipientId: string;
  message: string;
  detail: string;
  submissionId: string;
  isRead: boolean;
  createdAt: string;
  type: NotificationType;
}

export interface MockSubmission {
  id: string;
  title: string;
  submissionType?: SubmissionType;
  studentId: string;
  advisorId?: string;
  status: SubmissionStatus;
  sourceProposalId?: string | null;
  // Raw committee entries while status === "DRAFT" — some person named here has no account yet.
  pendingPeople?: { name?: string; email?: string; role?: string; phone?: string }[] | null;
  createdAt: string;
  uploads: MockUpload[];
  workflowSteps: MockWorkflowStep[];
  adminNote?: string;
  studentFullName?: string;
  studentCode?: string;
  program?: ProgramType;
  studentEmail?: string;
  studentPhone?: string;
  headCommitteeId?: string;
  committeeIds?: string[];
  coAdvisorIds?: string[];
  invitedCommitteeId?: string;
  programChairId?: string;
  invitedProfName?: string;
  invitedProfAffiliation?: string;
  invitedProfEmail?: string;
  invitedProfPhone?: string;
  examDate?: string;
  examTime?: string;
  roomNeeded?: boolean;
  parkingNeeded?: boolean;
  carPlate?: string;
}
