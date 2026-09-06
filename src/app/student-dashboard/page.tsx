"use client";

import { useApp } from "@/context/AppContext";
import { ROLE_LABELS, formatDate } from "@/lib/utils";
import { SubmissionStatusBadge } from "@/components/StatusBadge";
import Link from "next/link";
import {
  ChevronRight, PlusCircle, FileText, Clock, CheckCircle2, AlertCircle,
  BookOpen, GraduationCap, XCircle, TriangleAlert, Lock,
} from "lucide-react";
import type { MockSubmission } from "@/types";

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
          ?? users.find((u: any) => u.isProgramChair)?.name ?? null;
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
  const { user, submissions, users } = useApp();
  const mine = submissions.filter((s) => s.studentId === user?.id);

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

  // Most recent non-cancelled submission — summarized as the "current status" item
  const currentSub = mine
    .filter((s) => s.status !== "CANCELLED")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  return (
    <div className="max-w-3xl space-y-6">
      {/* Application status — current status + two creation entry points, each gated by workflow rules */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">สถานะคำร้อง</p>
        <div className="grid sm:grid-cols-3 gap-3">
          {/* Current status */}
          {currentSub ? (
            <Link
              href={`/dashboard/student/${currentSub.id}`}
              className="flex items-start gap-3 p-4 rounded-xl border-2 border-gray-200 bg-gray-50 hover:border-gray-300 transition group"
            >
              <div className="mt-0.5 w-9 h-9 rounded-lg bg-gray-500 flex items-center justify-center shrink-0">
                {currentSub.submissionType === "PROPOSAL"
                  ? <BookOpen className="w-5 h-5 text-white" />
                  : <GraduationCap className="w-5 h-5 text-white" />}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-700 text-sm leading-snug truncate">{currentSub.title}</p>
                <div className="mt-1"><SubmissionStatusBadge status={currentSub.status} /></div>
              </div>
            </Link>
          ) : (
            <div className="flex items-start gap-3 p-4 rounded-xl border-2 border-gray-200 bg-gray-50">
              <div className="mt-0.5 w-9 h-9 rounded-lg bg-gray-400 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-700 text-sm leading-snug">ยังไม่มีคำร้อง</p>
                <p className="text-xs text-gray-500 mt-0.5">เริ่มต้นโดยยื่นคำร้องขอสอบโครงร่าง</p>
              </div>
            </div>
          )}

          {/* Proposal entry point */}
          {activeProposal ? (
            <Link
              href={`/dashboard/student/${activeProposal.id}`}
              className="flex items-start gap-3 p-4 rounded-xl border-2 border-gray-200 bg-gray-50 hover:border-gray-300 transition group"
            >
              <div className="mt-0.5 w-9 h-9 rounded-lg bg-gray-400 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-700 text-sm leading-snug">มีคำร้องขอสอบโครงร่างที่ใช้งานอยู่</p>
                <p className="text-xs text-gray-500 mt-0.5">ยกเลิกคำร้องเดิมก่อนจึงจะยื่นใหม่ได้ → ดูคำร้อง</p>
              </div>
            </Link>
          ) : (
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

          {/* Defense entry point */}
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
        </div>
      </div>

      {/* List */}
      {mine.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-gray-200 space-y-4">
          <FileText className="w-14 h-14 text-gray-200" />
          <div className="text-center">
            <p className="text-lg font-medium text-gray-600">ยังไม่มีคำร้องวิทยานิพนธ์</p>
            <p className="text-gray-400 text-sm mt-1">เริ่มต้นโดยการยื่นคำร้องขอสอบโครงร่าง</p>
          </div>
          <Link
            href="/dashboard/student/submit?type=proposal"
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition text-sm"
          >
            <PlusCircle className="w-4 h-4" />
            ขอสอบโครงร่าง
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {mine.map((sub: MockSubmission) => {
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
      )}
    </div>
  );
}
