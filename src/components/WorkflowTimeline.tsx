"use client";

import { MockUser, MockWorkflowStep, MockSubmission, MockUpload } from "@/types";
import { ROLE_LABELS, getStepName, formatDate, formatUserName } from "@/lib/utils";
import { stepNumbering } from "@/lib/stepNumbering";
import { allCommitteeIds } from "@/lib/workflowSteps";
import { StepStatusBadge } from "./StatusBadge";
import { CheckCircle2, Clock, XCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

type SubInfo = Pick<MockSubmission,
  "studentId" | "studentFullName" | "advisorId" | "headCommitteeId" | "coAdvisorIds" |
  "committeeIds" | "invitedCommitteeIds" | "program"
> & { uploads?: MockUpload[]; status?: string };

/** Resolve the list of people assigned to a step: [{ id, name }] */
function resolveAssignees(
  step: MockWorkflowStep,
  sub: SubInfo | undefined,
  users: MockUser[]
): { id: string; name: string }[] {
  if (!sub) return [];

  const find = (id?: string | null) => users.find((u) => u.id === id);

  switch (step.role) {
    case "STUDENT": {
      const u = find(sub.studentId);
      return u ? [{ id: u.id, name: formatUserName(u) }] : [];
    }
    case "ADVISOR": {
      const u = find(sub.advisorId);
      return u ? [{ id: u.id, name: formatUserName(u) }] : [];
    }
    case "HEAD_EXAM_COMMITTEE": {
      const u = find(sub.headCommitteeId);
      return u ? [{ id: u.id, name: formatUserName(u) }] : [];
    }
    case "INVITED_EXAM_COMMITTEE": {
      const ids: string[] = (step.committeeMembers?.length
        ? step.committeeMembers
        : (sub.invitedCommitteeIds ?? [])) as string[];
      return ids.map((id) => { const u = find(id); return { id, name: u ? formatUserName(u) : id }; });
    }
    case "PROGRAM_CHAIR": {
      const u = (sub as any).programChairId
        ? find((sub as any).programChairId)
        : sub.program
        ? users.find((u) => (u as any).programChairFor?.includes(sub.program))
        : undefined;
      return u ? [{ id: u.id, name: formatUserName(u) }] : [];
    }
    case "ADMIN": {
      const u = users.find((u) => u.roles.includes("ADMIN"));
      return u ? [{ id: u.id, name: formatUserName(u) }] : [];
    }
    case "CO_ADVISOR": {
      const ids: string[] = (step.committeeMembers?.length
        ? step.committeeMembers
        : (sub.coAdvisorIds ?? [])) as string[];
      return ids.map((id) => { const u = find(id); return { id, name: u ? formatUserName(u) : id }; });
    }
    case "EXAM_COMMITTEE": {
      const ids: string[] = (step.committeeMembers?.length
        ? step.committeeMembers
        : (sub.committeeIds ?? [])) as string[];
      return ids.map((id) => { const u = find(id); return { id, name: u ? formatUserName(u) : id }; });
    }
    case "ALL_COMMITTEE": {
      const ids: string[] = (step.committeeMembers?.length ? step.committeeMembers : allCommitteeIds(sub)) as string[];
      return ids.map((id) => { const u = find(id); return { id, name: u ? formatUserName(u) : id }; });
    }
    default:
      return [];
  }
}

export function WorkflowTimeline({
  steps,
  users = [],
  submissionType,
  submission,
  preview,
}: {
  steps: MockWorkflowStep[];
  users?: MockUser[];
  submissionType?: string | null;
  submission?: SubInfo;
  /** No submission exists yet (this is just the full step list before creation) — never
      highlight a "current" step, since nothing has actually started. */
  preview?: boolean;
}) {
  const visibleSteps = steps.filter((s) => s.status !== "SKIPPED");
  const numbering = stepNumbering(steps, submissionType);
  // When submission is REJECTED, no step is "current" — the rejected step stands alone in red
  const currentOrder = (preview || submission?.status === "REJECTED")
    ? null
    : visibleSteps.find((s) => s.status === "PENDING")?.stepOrder ?? null;
  const remainingCount = currentOrder !== null
    ? visibleSteps.filter((s) => s.status === "PENDING" && s.stepOrder > currentOrder).length
    : 0;

  const isCommitteeRole = (role: string) =>
    role === "EXAM_COMMITTEE" || role === "CO_ADVISOR" || role === "ALL_COMMITTEE";

  return (
    <>
      {remainingCount > 0 && (
        <p className="text-xs text-gray-400 mb-4">
          เหลืออีก <span className="font-semibold text-gray-600">{remainingCount}</span> ขั้นตอนหลังจากนี้
        </p>
      )}
      <ol className="relative border-l-2 border-gray-100 ml-3 space-y-0">
        {visibleSteps.map((step) => {
          const isCurrent = step.stepOrder === currentOrder;
          const isFuture  = step.status === "PENDING" && !isCurrent;
          const assignees = resolveAssignees(step, submission, users);
          const isCommittee = isCommitteeRole(step.role);

          // For committee steps use committeeActions for per-member status
          const actions: any[] = (step.committeeActions ?? []) as any[];

          return (
            <li
              key={step.id}
              className={cn("ml-5 sm:ml-6 pb-4 sm:pb-6 last:pb-0", isFuture && "opacity-40")}
            >
              {/* Timeline dot */}
              <span
                className={cn(
                  "absolute -left-3.5 flex items-center justify-center w-7 h-7 rounded-full ring-4",
                  isCurrent  ? "ring-blue-100 bg-blue-50"
                  : step.status === "APPROVED" ? "ring-green-50 bg-white"
                  : step.status === "REJECTED" ? "ring-red-50 bg-white"
                  : "ring-gray-50 bg-white"
                )}
              >
                {step.status === "APPROVED" && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                {step.status === "REJECTED" && <XCircle      className="w-5 h-5 text-red-500" />}
                {isCurrent                  && <Clock        className="w-5 h-5 text-blue-500" />}
                {isFuture                   && <Circle       className="w-5 h-5 text-gray-300" />}
              </span>

              {/* Content */}
              <div className={cn(
                "rounded-xl p-3 border",
                isCurrent              ? "bg-blue-50 border-blue-200"
                : step.status === "APPROVED" ? "bg-gray-50 border-gray-100"
                : step.status === "REJECTED" ? "bg-red-50 border-red-200"
                : "bg-white border-gray-200"
              )}>
                <div className="space-y-1 mb-0.5">
                  <p className="text-xs text-gray-400 font-medium">ขั้นที่ {numbering.label(step.stepOrder)}</p>
                  <p className={cn("font-semibold leading-snug", isCurrent ? "text-blue-800" : "text-gray-800")}>
                    {getStepName(step.stepOrder, submissionType) || ROLE_LABELS[step.role]}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <StepStatusBadge status={step.status} />
                    {isCurrent && (
                      <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                        ● กำลังดำเนินการ
                      </span>
                    )}
                  </div>
                </div>

                {/* Single-role acted info */}
                {!isCommittee && step.actedByName && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {step.actedByName}
                    {step.actedAt && <span className="text-gray-400"> · {formatDate(step.actedAt)}</span>}
                  </p>
                )}

                {/* Assignee bullet list */}
                {assignees.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {/* Header count — committee signing */}
                    {isCommittee && (
                      <p className="text-xs font-medium text-gray-500">
                        ลงนามแล้ว{" "}
                        <span className="font-bold text-gray-700">
                          {step.status === "APPROVED"
                            ? assignees.length
                            : actions.filter((a) => a.decision === "APPROVED").length
                          }/{assignees.length}
                        </span>
                        {" "}ท่าน
                      </p>
                    )}
                    {assignees.map(({ id, name }) => {
                      const action = isCommittee
                        ? actions.find((a) => a.userId === id)
                        : null;
                      const done = isCommittee
                        ? action?.decision === "APPROVED" || step.status === "APPROVED"
                        : step.status === "APPROVED";
                      const rejected = isCommittee
                        ? action?.decision === "REJECTED"
                        : step.status === "REJECTED";
                      const actedAt = isCommittee ? action?.actedAt : step.actedAt;

                      return (
                        <div key={id} className="flex items-center gap-2 text-xs">
                          {done ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          ) : rejected ? (
                            <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                          )}
                          <span className={cn(
                            "flex-1",
                            done     ? "text-green-700 font-medium" :
                            rejected ? "text-red-700 font-medium"   :
                                       "text-gray-600"
                          )}>
                            {name}
                          </span>
                          {actedAt && (
                            <span className="text-gray-400 shrink-0">{formatDate(actedAt)}</span>
                          )}
                          {!done && !rejected && (
                            <span className="text-gray-300 italic shrink-0">ยังไม่ได้ดำเนินการ</span>
                          )}
                        </div>
                      );
                    })}

                  </div>
                )}

                {step.notes && (
                  <p className="mt-1.5 text-sm text-gray-600 bg-white border border-gray-100 rounded-lg px-3 py-2">
                    "{step.notes}"
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
