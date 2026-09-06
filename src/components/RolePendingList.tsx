"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { SubmissionStatusBadge } from "./StatusBadge";
import { DashboardHeader } from "./DashboardHeader";
import { getStepName, formatDate } from "@/lib/utils";
import Link from "next/link";
import { ChevronRight, Clock, CheckCircle2, History, FileText } from "lucide-react";

interface Props {
  role: string;
  title: string;
  basePath: string;
}

export function RolePendingList({ role, title, basePath }: Props) {
  const { submissions, user, users } = useApp();
  const [tab, setTab] = useState<"pending" | "history">("pending");

  const isCommittee = role === "EXAM_COMMITTEE" || role === "CO_ADVISOR";

  // Has the current committee member personally acted on this submission's committee step?
  const iSignedCommittee = (sub: typeof submissions[number]) =>
    sub.workflowSteps.some(
      (s) => s.role === role && (s.committeeActions ?? []).some((a) => a.userId === user?.id)
    );

  const pending = submissions.filter((sub) => {
    const step = sub.workflowSteps.find((s) => s.status === "PENDING");
    if (step?.role !== role) return false;
    // Committee: only show if THIS member still needs to sign
    if (isCommittee && user) {
      if (!step.committeeMembers?.includes(user.id)) return false;
      return !(step.committeeActions ?? []).some((a) => a.userId === user.id);
    }
    return true;
  });

  const history = submissions.filter((sub) => {
    const isCurrentlyPending = pending.some((p) => p.id === sub.id);
    if (isCommittee) {
      return iSignedCommittee(sub) && !isCurrentlyPending;
    }
    const alreadyActed = sub.workflowSteps.some(
      (s) => s.role === role && (s.status === "APPROVED" || s.status === "REJECTED")
    );
    return alreadyActed && !isCurrentlyPending;
  });

  const approved = isCommittee
    ? history.filter((sub) =>
        sub.workflowSteps.some((s) =>
          s.role === role &&
          (s.committeeActions ?? []).some((a) => a.userId === user?.id && a.decision === "APPROVED")
        )
      ).length
    : history.filter((sub) =>
        sub.workflowSteps.some((s) => s.role === role && s.status === "APPROVED")
      ).length;

  const getStudent = (id: string) => users.find((u) => u.id === id);
  const list = tab === "pending" ? pending : history;

  return (
    <div className="space-y-6">
      {/* Header */}
      <DashboardHeader
        role={role}
        name={user?.name ?? ""}
        title={title}
        highlight={{ label: "รอดำเนินการ", value: pending.length }}
        stats={[
          { label: "รอดำเนินการ",       value: pending.length },
          { label: "อนุมัติแล้ว",       value: approved },
          { label: "เกี่ยวข้องทั้งหมด", value: submissions.length },
        ]}
      />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        <button
          onClick={() => setTab("pending")}
          className={`flex items-center gap-2 px-4 sm:px-5 py-3 font-medium text-sm border-b-2 transition whitespace-nowrap shrink-0 ${
            tab === "pending"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Clock className="w-4 h-4" />
          รอดำเนินการ
          {pending.length > 0 && (
            <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {pending.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("history")}
          className={`flex items-center gap-2 px-4 sm:px-5 py-3 font-medium text-sm border-b-2 transition whitespace-nowrap shrink-0 ${
            tab === "history"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <History className="w-4 h-4" />
          ประวัติที่ดำเนินการแล้ว
          {history.length > 0 && (
            <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">
              {history.length}
            </span>
          )}
        </button>
      </div>

      {/* List */}
      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-200 text-gray-400 space-y-2">
          {tab === "pending"
            ? <><CheckCircle2 className="w-12 h-12 opacity-25" /><p className="text-lg">ไม่มีรายการที่รอดำเนินการ</p></>
            : <><History className="w-12 h-12 opacity-25" /><p className="text-lg">ยังไม่มีประวัติการดำเนินการ</p></>
          }
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((sub) => {
            const student     = getStudent(sub.studentId);
            const currentStep = sub.workflowSteps.find((s) => s.status === "PENDING");
            const mySteps     = sub.workflowSteps.filter((s) => s.role === role && s.status !== "PENDING");
            const lastMyStep  = mySteps.at(-1);
            const isPendingTab = tab === "pending";

            return (
              <Link
                key={sub.id}
                href={`${basePath}/${sub.id}`}
                className="group flex items-stretch gap-0 bg-white rounded-2xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition overflow-hidden"
              >
                {/* Colored accent bar */}
                <div className={`w-1.5 shrink-0 ${isPendingTab ? "bg-orange-400" : "bg-green-400"}`} />

                <div className="flex items-center justify-between gap-3 p-4 sm:p-5 flex-1 min-w-0">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Avatar initial */}
                    <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 text-gray-500">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <p className="text-lg font-semibold text-gray-900 leading-snug truncate">{sub.title}</p>
                      {student && (
                        <p className="text-sm text-gray-500">
                          {student.name}
                          {student.studentId && <span className="text-gray-400"> · {student.studentId}</span>}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <SubmissionStatusBadge status={sub.status} />
                        {isPendingTab && currentStep && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full">
                            <Clock className="w-3 h-3" />
                            {getStepName(currentStep.stepOrder, sub.submissionType) || `ขั้นที่ ${currentStep.stepOrder}`}
                          </span>
                        )}
                        {!isPendingTab && lastMyStep && (
                          <span className={`text-xs font-medium ${lastMyStep.status === "APPROVED" ? "text-green-600" : "text-red-500"}`}>
                            {lastMyStep.status === "APPROVED" ? "✓ ท่านอนุมัติแล้ว" : "✗ ท่านปฏิเสธแล้ว"}
                            {lastMyStep.actedAt && <span className="text-gray-400 font-normal"> · {formatDate(lastMyStep.actedAt)}</span>}
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
