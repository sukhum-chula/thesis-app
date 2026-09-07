"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { ROLE_LABELS, formatDate } from "@/lib/utils";
import { SubmissionStatusBadge } from "@/components/StatusBadge";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { SubmissionInfoPanel } from "@/components/SubmissionInfoPanel";
import { useToast } from "@/context/ToastContext";
import { toUserErrorMessage } from "@/lib/utils";
import { buildWorkflowSteps } from "@/lib/workflowSteps";
import Link from "next/link";
import {
  ChevronRight, FileText, Clock, CheckCircle2, AlertCircle,
  BookOpen, GraduationCap, XCircle, TriangleAlert, Lock, Trash2,
} from "lucide-react";
import type { MockSubmission, MockWorkflowStep } from "@/types";

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
    case "ADVISOR":             return users.find((u: any) => u.id === sub.advisorId)?.name ?? null;
    case "HEAD_EXAM_COMMITTEE": return users.find((u: any) => u.id === sub.headCommitteeId)?.name ?? null;
    case "PROGRAM_CHAIR":
      return users.find((u: any) => u.id === sub.programChairId)?.name
          ?? (sub.program ? users.find((u: any) => u.programChairFor === sub.program)?.name : null) ?? null;
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
  const { user, submissions, users, requestCancelSubmission } = useApp();
  const { showToast } = useToast();
  const mine = submissions.filter((s) => s.studentId === user?.id);
  const [tab, setTab] = useState<"proposal" | "defense">("proposal");
  const [showCancelModal, setShowCancelModal] = useState(false);

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

  // Step counts for the "(x/y)" suffix — visible (non-SKIPPED) steps only, matching the
  // WorkflowTimeline's own step numbering. Preview lists (no submission yet) are always 0/y.
  const proposalVisibleSteps = currentProposal?.workflowSteps.filter((s) => s.status !== "SKIPPED") ?? [];
  const proposalDone = proposalVisibleSteps.filter((s) => s.status === "APPROVED").length;
  const proposalTotal = proposalVisibleSteps.length;
  const defenseVisibleSteps = currentDefense?.workflowSteps.filter((s) => s.status !== "SKIPPED") ?? [];
  const defenseDone = defenseVisibleSteps.filter((s) => s.status === "APPROVED").length;
  const defenseTotal = defenseVisibleSteps.length;
  const previewProposalTotal = PREVIEW_PROPOSAL_STEPS.filter((s) => s.status !== "SKIPPED").length;
  const previewDefenseTotal = PREVIEW_DEFENSE_STEPS.filter((s) => s.status !== "SKIPPED").length;

  // Cancelling a proposal cascades to its in-flight defense (see AGENTS.md) — warn about that here
  const linkedDefense = currentProposal
    ? mine.find((d) => d.sourceProposalId === currentProposal.id && d.status !== "CANCELLED")
    : undefined;

  async function handleCancelConfirm() {
    if (!currentProposal) return;
    try {
      await requestCancelSubmission(currentProposal.id);
      setShowCancelModal(false);
      showToast("ส่งคำขอยกเลิกแล้ว — รอเจ้าหน้าที่อนุมัติ", "info");
    } catch (err) {
      setShowCancelModal(false);
      showToast(toUserErrorMessage(err), "error");
    }
  }

  return (
    <div className="space-y-6">
      {/* Application status — two tabs (Proposal / Defense), each with its own creation entry
          point (gated by workflow rules) and its own current-progress section */}
      <div className="grid grid-cols-2 gap-2">
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
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 max-h-[75vh] overflow-y-auto">
        {tab === "proposal" && (
          <div className="space-y-4">
            {!activeProposal && (
              <Link
                href="/dashboard/student/submit?type=proposal"
                className="flex items-start gap-3 p-4 rounded-xl border-2 border-blue-200 bg-blue-50 hover:border-blue-400 hover:bg-blue-100 transition group"
              >
                <div className="mt-0.5 w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-700 transition">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-blue-900 text-sm leading-snug">ขอสอบโครงร่างวิทยานิพนธ์</p>
                  <p className="text-xs text-blue-600 mt-0.5">สำหรับการสอบ Proposal (บ.วศ.1ก/ข/ค/ง)</p>
                </div>
              </Link>
            )}

            <div className="space-y-3">
              {currentProposal ? (
                <>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <p className="font-semibold text-gray-900 text-lg leading-snug">{currentProposal.title}</p>
                    <SubmissionStatusBadge status={currentProposal.status} />
                  </div>
                  <SubmissionInfoPanel submission={currentProposal} users={users} />
                  <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    ความคืบหน้าปัจจุบัน ({proposalDone}/{proposalTotal})
                  </p>
                  <WorkflowTimeline
                    steps={currentProposal.workflowSteps}
                    users={users}
                    submissionType={currentProposal.submissionType}
                    submission={currentProposal}
                  />
                  {!currentProposal.cancelRequested && currentProposal.status !== "CANCELLED" && (
                    <button
                      onClick={() => setShowCancelModal(true)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-300 text-gray-500 text-sm font-medium rounded-xl hover:bg-gray-50 hover:border-gray-400 transition"
                    >
                      <XCircle className="w-4 h-4" />
                      ขอยกเลิกคำร้องนี้
                    </button>
                  )}
                </>
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
          </div>
        )}

        {tab === "defense" && (
          <div className="space-y-4">
            {eligibleProposals.length > 0 ? (
              <Link
                href="/dashboard/student/submit?type=defense"
                className="flex items-start gap-3 p-4 rounded-xl border-2 border-indigo-200 bg-indigo-50 hover:border-indigo-400 hover:bg-indigo-100 transition group"
              >
                <div className="mt-0.5 w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0 group-hover:bg-indigo-700 transition">
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-indigo-900 text-sm leading-snug">ขอสอบวิทยานิพนธ์</p>
                  <p className="text-xs text-indigo-600 mt-0.5">นำเข้าข้อมูลจากคำร้องโครงร่างที่เสร็จสมบูรณ์</p>
                </div>
              </Link>
            ) : (
              <div className="flex items-start gap-3 p-4 rounded-xl border-2 border-gray-200 bg-gray-50">
                <div className="mt-0.5 w-9 h-9 rounded-lg bg-gray-400 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-700 text-sm leading-snug">ขอสอบวิทยานิพนธ์</p>
                  <p className="text-xs text-gray-500 mt-0.5">ต้องมีคำร้องโครงร่างที่เสร็จสมบูรณ์และยังไม่ถูกใช้ก่อน</p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {currentDefense ? (
                <>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <p className="font-semibold text-gray-900 text-lg leading-snug">{currentDefense.title}</p>
                    <SubmissionStatusBadge status={currentDefense.status} />
                  </div>
                  <SubmissionInfoPanel submission={currentDefense} users={users} />
                  <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    ความคืบหน้าปัจจุบัน ({defenseDone}/{defenseTotal})
                  </p>
                  <WorkflowTimeline
                    steps={currentDefense.workflowSteps}
                    users={users}
                    submissionType={currentDefense.submissionType}
                    submission={currentDefense}
                  />
                </>
              ) : (
                <>
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
          </div>
        )}
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
                      ที่ปรึกษา: {advisor.name}
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

      {/* Cancel confirmation modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900">ยืนยันการขอยกเลิกคำร้อง</p>
                <p className="text-sm text-gray-500">
                  คำขอจะถูกส่งให้เจ้าหน้าที่พิจารณา — คำร้องนี้จะถูกระงับจนกว่าเจ้าหน้าที่จะอนุมัติหรือปฏิเสธคำขอ
                  {linkedDefense && " หากอนุมัติ คำร้องขอสอบวิทยานิพนธ์ที่เกี่ยวข้องจะถูกยกเลิกไปด้วย"}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCancelConfirm}
                className="flex-1 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition"
              >
                ส่งคำขอยกเลิก
              </button>
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition"
              >
                ไม่ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
