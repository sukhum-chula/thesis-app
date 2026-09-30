"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { SubmissionStatusBadge } from "@/components/StatusBadge";
import { getStepName, formatDate } from "@/lib/utils";
import { SubmissionStatus } from "@/types";
import Link from "next/link";
import { ChevronRight, Clock, CheckCircle2, FileText } from "lucide-react";

const PROFESSOR_STEP_ROLES = [
  "ADVISOR", "CO_ADVISOR", "HEAD_EXAM_COMMITTEE",
  "EXAM_COMMITTEE", "INVITED_EXAM_COMMITTEE", "PROGRAM_CHAIR",
];

const STATUS_TABS: { label: string; value: SubmissionStatus | "ALL" }[] = [
  { label: "ทั้งหมด",         value: "ALL" },
  { label: "ฉบับร่าง",       value: "DRAFT" },
  { label: "กำลังดำเนินการ", value: "IN_PROGRESS" },
  { label: "เสร็จสิ้น",      value: "COMPLETED" },
  { label: "ถูกปฏิเสธ",      value: "REJECTED" },
  { label: "ยกเลิกแล้ว",     value: "CANCELLED" },
];

export default function ProfessorDashboard() {
  const { submissions, user } = useApp();
  const [statusFilter, setStatusFilter] = useState<SubmissionStatus | "ALL">("ALL");

  // `submissions` from context is already server-scoped to submissions this professor is a
  // committee member on (advisor/co-advisor/head/exam committee/invited/program chair) — see
  // GET /api/submissions. No client-side involvement filtering is needed here.

  const isMyTurn = (sub: (typeof submissions)[number]) => {
    const step = sub.workflowSteps.find((s) => s.status === "PENDING");
    if (!step || !PROFESSOR_STEP_ROLES.includes(step.role)) return false;

    if (step.role === "ADVISOR")                return (sub as any).advisorId === user?.id;
    if (step.role === "HEAD_EXAM_COMMITTEE")    return (sub as any).headCommitteeId === user?.id;
    if (step.role === "PROGRAM_CHAIR")
      return (sub as any).programChairId ? (sub as any).programChairId === user?.id : true;
    // EXAM_COMMITTEE, CO_ADVISOR, or INVITED_EXAM_COMMITTEE — sequential committee signing
    const members = step.committeeMembers ?? [];
    const idx = members.indexOf(user?.id ?? "");
    if (idx === -1) return false;
    if ((step.committeeActions ?? []).some((a: any) => a.userId === user?.id)) return false;
    const prevNotApproved = members.slice(0, idx).some(
      (mid: string) => !(step.committeeActions ?? []).some((a: any) => a.userId === mid && a.decision === "APPROVED")
    );
    return !prevNotApproved;
  };

  const getMyActedStep = (sub: (typeof submissions)[number]) =>
    sub.workflowSteps.filter(
      (s) => PROFESSOR_STEP_ROLES.includes(s.role) &&
             (s.status === "APPROVED" || s.status === "REJECTED") &&
             (s.actedById === user?.id ||
              (s.committeeActions ?? []).some((a) => a.userId === user?.id))
    ).at(-1);

  const counts = {
    ALL:         submissions.length,
    DRAFT:       submissions.filter((s) => s.status === "DRAFT").length,
    IN_PROGRESS: submissions.filter((s) => s.status === "IN_PROGRESS").length,
    COMPLETED:   submissions.filter((s) => s.status === "COMPLETED").length,
    REJECTED:    submissions.filter((s) => s.status === "REJECTED").length,
    CANCELLED:   submissions.filter((s) => s.status === "CANCELLED").length,
  };

  const list = submissions
    .filter((sub) => statusFilter === "ALL" || sub.status === statusFilter)
    .sort((a, b) => {
      const turnDiff = Number(isMyTurn(b)) - Number(isMyTurn(a));
      if (turnDiff !== 0) return turnDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  return (
    <div className="space-y-6">
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap shrink-0 ${
              statusFilter === tab.value
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
              statusFilter === tab.value ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
            }`}>
              {counts[tab.value]}
            </span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-200 text-gray-400 space-y-2">
          <CheckCircle2 className="w-12 h-12 opacity-25" />
          <p className="text-lg">ไม่มีคำร้องในหมวดนี้</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((sub) => {
            const currentStep = sub.workflowSteps.find((s) => s.status === "PENDING");
            const myTurn = isMyTurn(sub);
            const myActedStep = getMyActedStep(sub);

            return (
              <Link
                key={sub.id}
                href={`/dashboard/professor/${sub.id}`}
                className="group flex items-stretch gap-0 bg-white rounded-2xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition overflow-hidden"
              >
                <div className={`w-1.5 shrink-0 ${myTurn ? "bg-orange-400" : "bg-gray-200"}`} />
                <div className="flex items-center justify-between gap-3 p-4 sm:p-5 flex-1 min-w-0">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 text-gray-500">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <p className="text-lg font-semibold text-gray-900 leading-snug truncate">{sub.title}</p>
                      {sub.studentFullName && (
                        <p className="text-sm text-gray-500">{sub.studentFullName}{sub.studentCode && <span className="text-gray-400"> · {sub.studentCode}</span>}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <SubmissionStatusBadge status={sub.status} />
                        {myTurn && currentStep && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full">
                            <Clock className="w-3 h-3" />
                            อาจารย์
                            {" — "}
                            {getStepName(currentStep.stepOrder, sub.submissionType) || `ขั้นที่ ${currentStep.stepOrder}`}
                          </span>
                        )}
                        {myActedStep && (
                          <span className={`text-xs font-medium ${myActedStep.status === "APPROVED" ? "text-green-600" : "text-red-500"}`}>
                            {myActedStep.status === "APPROVED" ? "✓ ท่านอนุมัติแล้ว" : "✗ ท่านปฏิเสธแล้ว"}
                            {myActedStep.actedAt && <span className="text-gray-400 font-normal"> · {formatDate(myActedStep.actedAt)}</span>}
                          </span>
                        )}
                      </div>
                    </div>
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
