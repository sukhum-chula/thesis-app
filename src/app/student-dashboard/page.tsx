"use client";

import { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { ROLE_LABELS, formatDate, formatUserName } from "@/lib/utils";
import { SubmissionStatusBadge } from "@/components/StatusBadge";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { StudentSubmissionActions } from "@/components/StudentSubmissionActions";
import { DefenseDraftReview } from "@/components/DefenseDraftReview";
import { ProposalForm } from "@/components/SubmissionForms";
import { StudentExternalRequests } from "@/components/StudentExternalRequests";
import { buildWorkflowSteps } from "@/lib/workflowSteps";
import Link from "next/link";
import {
  ChevronRight, FileText, Clock, CheckCircle2, AlertCircle,
  BookOpen, GraduationCap, XCircle, TriangleAlert, Lock, Loader2, UserPlus,
} from "lucide-react";
import type { MockSubmission, MockWorkflowStep } from "@/types";

// A THESIS_DEFENSE auto-imported from a completed proposal (see POST
// /api/submissions/auto-draft-defense) — still DRAFT, but never through the legacy
// pendingPeople/missing-accounts path, so it needs its own review UI rather than the normal
// "waiting for accounts" DRAFT banner in StudentSubmissionActions.
function isAutoDraftDefense(sub: MockSubmission): boolean {
  return sub.status === "DRAFT" && !(sub.pendingPeople as unknown[] | null)?.length;
}

// Full step list shown before any submission exists — no committee assigned yet, so every step
// is generic (no per-member names). CO_ADVISOR steps are built as SKIPPED (empty co-advisor list),
// matching the real auto-skip behavior, so the preview matches what a real submission would show.
const PREVIEW_PROPOSAL_STEPS: MockWorkflowStep[] = buildWorkflowSteps("PROPOSAL", [], [], null)
  .map((s, i) => ({ ...s, id: `preview-proposal-${i}` }));
const PREVIEW_DEFENSE_STEPS: MockWorkflowStep[] = buildWorkflowSteps("THESIS_DEFENSE", [], [], null)
  .map((s, i) => ({ ...s, id: `preview-defense-${i}` }));

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function getLastActedDate(steps: any[]): string | null {
  return steps
    .filter((s) => s.actedAt)
    .sort((a: any, b: any) => new Date(b.actedAt).getTime() - new Date(a.actedAt).getTime())[0]?.actedAt ?? null;
}

function resolveStepPerson(sub: any, step: any, users: any[]): string | null {
  switch (step.role) {
    case "ADVISOR":             { const u = users.find((u: any) => u.id === sub.advisorId); return u ? formatUserName(u) : null; }
    case "HEAD_EXAM_COMMITTEE": { const u = users.find((u: any) => u.id === sub.headCommitteeId); return u ? formatUserName(u) : null; }
    case "PROGRAM_CHAIR": {
      const u = users.find((u: any) => u.id === sub.programChairId)
        ?? (sub.program ? users.find((u: any) => u.programChairFor?.includes(sub.program)) : null);
      return u ? formatUserName(u) : null;
    }
    case "ADMIN":               return "เจ้าหน้าที่";
    case "EXAM_COMMITTEE": {
      const memberIds: string[] = step.committeeMembers?.length ? step.committeeMembers : (sub.committeeIds ?? []);
      const done = (step.committeeActions ?? []).filter((a: any) => a.decision === "APPROVED").length;
      return `กรรมการสอบ (${done}/${memberIds.length})`;
    }
    default: return null;
  }
}

export default function StudentDashboard() {
  const { user, submissions, users, getOrCreateDefenseDraft } = useApp();
  const mine = submissions.filter((s) => s.studentId === user?.id);
  const [tab, setTab] = useState<"proposal" | "defense" | "external">("proposal");
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [creatingDefenseDraft, setCreatingDefenseDraft] = useState(false);

  // Gating for the two creation entry points — see AGENTS.md workflow rules.
  // A proposal is "active" until the student cancels it; a defense may only be created from a
  // COMPLETED proposal that doesn't already have a non-cancelled defense of its own.
  const activeProposal = mine.find((s) => s.submissionType === "PROPOSAL" && s.status !== "CANCELLED");
  const eligibleProposals = mine.filter(
    (s) =>
      s.submissionType === "PROPOSAL" &&
      s.status === "COMPLETED" &&
      !mine.some((d) => d.sourceProposalId === s.id && d.status !== "CANCELLED")
  );

  // The most recent non-cancelled submission per type — each tab shows its own "current
  // progress" with every step; everything else (cancelled, or superseded by a newer one of the
  // same type) is history.
  const currentProposal = mine
    .filter((s) => s.submissionType === "PROPOSAL" && s.status !== "CANCELLED")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const currentDefense = mine
    .filter((s) => s.submissionType === "THESIS_DEFENSE" && s.status !== "CANCELLED")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const inactiveList = mine.filter((s) => s.id !== currentProposal?.id && s.id !== currentDefense?.id);

  // Step counts for the "(0/y)" preview suffix shown before any submission of that type exists.
  const previewProposalTotal = PREVIEW_PROPOSAL_STEPS.filter((s) => s.status !== "SKIPPED").length;
  const previewDefenseTotal = PREVIEW_DEFENSE_STEPS.filter((s) => s.status !== "SKIPPED").length;

  // The moment the student opens the defense tab with a completed, not-yet-used proposal, get
  // (or lazily create) the auto-imported DRAFT defense so it's just sitting there ready to review
  // — no separate "create" click needed. Idempotent server-side, so a re-fire from a fast
  // double-render is harmless; `creatingDefenseDraft` just avoids firing twice in a row.
  useEffect(() => {
    if (tab !== "defense" || currentDefense || eligibleProposals.length === 0 || creatingDefenseDraft) return;
    setCreatingDefenseDraft(true);
    getOrCreateDefenseDraft().catch(() => {}).finally(() => setCreatingDefenseDraft(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, currentDefense, eligibleProposals.length]);

  return (
    <div className="space-y-6">
      {/* Application status — two tabs (Proposal / Defense), each with its own creation entry
          point (gated by workflow rules) and its own current-progress section */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setTab("proposal")}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition ${
            tab === "proposal" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          สอบโครงร่าง
        </button>
        <button
          onClick={() => setTab("defense")}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition ${
            tab === "defense" ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          สอบวิทยานิพนธ์
        </button>
        <button
          onClick={() => setTab("external")}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition ${
            tab === "external" ? "bg-sky-600 text-white" : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
          }`}
        >
          <UserPlus className="w-4 h-4" />
          กรรมการภายนอก
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 max-h-[75vh] overflow-y-auto">
        {tab === "proposal" && (
          <div className="space-y-4">
            {!activeProposal && (
              showProposalForm ? (
                <ProposalForm
                  mine={mine}
                  onCreated={() => setShowProposalForm(false)}
                  onCancel={() => setShowProposalForm(false)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowProposalForm(true)}
                  className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-blue-200 bg-blue-50 hover:border-blue-400 hover:bg-blue-100 transition group text-left"
                >
                  <div className="mt-0.5 w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-700 transition">
                    <BookOpen className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-blue-900 text-sm leading-snug">ขอสอบโครงร่างวิทยานิพนธ์</p>
                    <p className="text-xs text-blue-600 mt-0.5">สำหรับการสอบ Proposal (บ.วศ.1ก/ข/ค/ง)</p>
                  </div>
                </button>
              )
            )}

            {!showProposalForm && (
              <div className="space-y-3">
                {currentProposal ? (
                  <StudentSubmissionActions submissionId={currentProposal.id} />
                ) : (
                  <>
                    <div className="flex flex-col items-center justify-center py-10 text-gray-300 gap-3">
                      <FileText className="w-12 h-12 opacity-40" />
                      <p className="text-lg font-medium text-gray-400">No proposal</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                      ความคืบหน้าปัจจุบัน (0/{previewProposalTotal})
                    </p>
                    <WorkflowTimeline steps={PREVIEW_PROPOSAL_STEPS} users={users} submissionType="PROPOSAL" preview />
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "defense" && (
          <div className="space-y-4">
            {currentDefense ? (
              isAutoDraftDefense(currentDefense) ? (
                <DefenseDraftReview submissionId={currentDefense.id} />
              ) : (
                <StudentSubmissionActions submissionId={currentDefense.id} />
              )
            ) : eligibleProposals.length > 0 ? (
              <div className="flex items-center justify-center gap-3 py-10 text-indigo-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-sm font-medium">กำลังเตรียมคำร้องขอสอบวิทยานิพนธ์...</p>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3 p-4 rounded-xl border-2 border-gray-200 bg-gray-50">
                  <div className="mt-0.5 w-9 h-9 rounded-lg bg-gray-400 flex items-center justify-center shrink-0">
                    <Lock className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700 text-sm leading-snug">ขอสอบวิทยานิพนธ์</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      ต้องมีคำร้องโครงร่างที่เสร็จสมบูรณ์ก่อน — ระบบจะเตรียมคำร้องขอสอบวิทยานิพนธ์ให้อัตโนมัติทันทีที่โครงร่างเสร็จสมบูรณ์
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center py-10 text-gray-300 gap-3">
                  <FileText className="w-12 h-12 opacity-40" />
                  <p className="text-lg font-medium text-gray-400">No defense</p>
                </div>
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  ความคืบหน้าปัจจุบัน (0/{previewDefenseTotal})
                </p>
                <WorkflowTimeline steps={PREVIEW_DEFENSE_STEPS} users={users} submissionType="THESIS_DEFENSE" preview />
              </>
            )}
          </div>
        )}

        {tab === "external" && <StudentExternalRequests />}
      </div>

      {/* Inactive / other submissions — history */}
      {inactiveList.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">รายการอื่นๆ</p>
          <div className="space-y-3">
          {inactiveList.map((sub: MockSubmission) => {
            const currentStep = sub.workflowSteps.find((s: any) => s.status === "PENDING");
            const isMyTurn    = currentStep?.role === "STUDENT";
            const advisor     = users.find((u) => u.id === sub.advisorId);
            const visibleSteps = sub.workflowSteps.filter((s: any) => s.status !== "SKIPPED");
            const doneCount   = visibleSteps.filter((s: any) => s.status === "APPROVED").length;
            const totalSteps  = visibleSteps.length;
            const lastActed   = getLastActedDate(sub.workflowSteps);
            const stuckDays   = sub.status === "IN_PROGRESS" && !isMyTurn && lastActed ? daysSince(lastActed) : 0;
            const pendingName = currentStep && !isMyTurn ? resolveStepPerson(sub, currentStep, users) : null;
            const cancelled   = sub.status === "CANCELLED";

            const accent =
              sub.status === "COMPLETED"  ? "bg-green-400"
              : sub.status === "REJECTED"  ? "bg-red-400"
              : cancelled ? "bg-gray-300"
              : isMyTurn ? "bg-blue-400"
              : "bg-orange-400";

            return (
              <Link
                key={sub.id}
                href={`/dashboard/student/${sub.id}`}
                className={`group flex items-stretch bg-white rounded-2xl border transition overflow-hidden ${
                  cancelled ? "border-gray-200 opacity-60" : "border-gray-200 hover:border-blue-300 hover:shadow-md"
                }`}
              >
                {/* Accent bar */}
                <div className={`w-1.5 shrink-0 ${accent}`} />

                <div className="flex items-center gap-3 p-4 sm:p-5 flex-1 min-w-0">
                {/* Status icon */}
                <div className="shrink-0">
                  {sub.status === "COMPLETED"       && <CheckCircle2 className="w-8 h-8 text-green-500" />}
                  {sub.status === "REJECTED"        && <AlertCircle  className="w-8 h-8 text-red-500" />}
                  {cancelled                        && <XCircle      className="w-8 h-8 text-gray-400" />}
                  {sub.status === "IN_PROGRESS" && isMyTurn  && <AlertCircle className="w-8 h-8 text-blue-500" />}
                  {sub.status === "IN_PROGRESS" && !isMyTurn && <Clock       className="w-8 h-8 text-orange-400" />}
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {sub.submissionType === "PROPOSAL" && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        <BookOpen className="w-3 h-3" />โครงร่าง
                      </span>
                    )}
                    {sub.submissionType === "THESIS_DEFENSE" && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                        <GraduationCap className="w-3 h-3" />สอบวิทยานิพนธ์
                      </span>
                    )}
                    <p className={`font-semibold truncate text-lg leading-snug ${cancelled ? "text-gray-500" : "text-gray-900"}`}>{sub.title}</p>
                  </div>

                  {advisor && (
                    <p className="text-sm text-gray-500">
                      ที่ปรึกษา: {formatUserName(advisor)}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <SubmissionStatusBadge status={sub.status} />
                    {sub.cancelRequested && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        <XCircle className="w-3 h-3" />รออนุมัติยกเลิก
                      </span>
                    )}
                    {isMyTurn && sub.status === "IN_PROGRESS" && (
                      <span className="text-sm text-blue-600 font-semibold">★ ถึงคิวของท่าน</span>
                    )}
                    {sub.status === "REJECTED" && (
                      <span className="text-sm text-red-600 font-semibold">★ กรุณาแก้ไขและยื่นใหม่</span>
                    )}
                    {!isMyTurn && sub.status === "IN_PROGRESS" && currentStep && (
                      <span className="text-sm text-gray-500">
                        รอ: {pendingName ?? ROLE_LABELS[currentStep.role]}
                      </span>
                    )}
                    {stuckDays > 7 && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                        <TriangleAlert className="w-3 h-3" />
                        ค้างมา {stuckDays} วัน
                      </span>
                    )}
                  </div>

                  {/* Mini progress */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${accent}`}
                        style={{ width: `${totalSteps > 0 ? (doneCount / totalSteps) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400">{doneCount}/{totalSteps}</span>
                  </div>

                  <p className="text-xs text-gray-400">{formatDate(sub.createdAt)}</p>
                </div>

                <ChevronRight className="w-6 h-6 text-gray-300 group-hover:text-blue-500 transition shrink-0" />
                </div>
              </Link>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}
