"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { SubmissionStatusBadge } from "@/components/StatusBadge";
import { DashboardHeader } from "@/components/DashboardHeader";
import { getStepName, formatDate, ROLE_LABELS } from "@/lib/utils";
import Link from "next/link";
import { ChevronRight, Clock, CheckCircle2, History, FileText } from "lucide-react";

const PROFESSOR_STEP_ROLES = [
  "ADVISOR", "CO_ADVISOR", "HEAD_EXAM_COMMITTEE",
  "EXAM_COMMITTEE", "INVITED_EXAM_COMMITTEE", "PROGRAM_CHAIR",
];

export default function ProfessorDashboard() {
  const { submissions, user } = useApp();
  const [tab, setTab] = useState<"pending" | "history">("pending");

  const pending = submissions.filter((sub) => {
    const step = sub.workflowSteps.find((s) => s.status === "PENDING");
    if (!step || !PROFESSOR_STEP_ROLES.includes(step.role)) return false;

    if (step.role === "ADVISOR")               return (sub as any).advisorId === user?.id;
    if (step.role === "HEAD_EXAM_COMMITTEE")   return (sub as any).headCommitteeId === user?.id;
    if (step.role === "INVITED_EXAM_COMMITTEE")return (sub as any).invitedCommitteeId === user?.id;
    if (step.role === "PROGRAM_CHAIR")
      return (sub as any).programChairId ? (sub as any).programChairId === user?.id : true;
    // EXAM_COMMITTEE or CO_ADVISOR — sequential committee signing
    const members = step.committeeMembers ?? [];
    const idx = members.indexOf(user?.id ?? "");
    if (idx === -1) return false;
    if ((step.committeeActions ?? []).some((a: any) => a.userId === user?.id)) return false;
    const prevNotApproved = members.slice(0, idx).some(
      (mid: string) => !(step.committeeActions ?? []).some((a: any) => a.userId === mid && a.decision === "APPROVED")
    );
    return !prevNotApproved;
  });

  const history = submissions.filter((sub) => {
    if (pending.some((p) => p.id === sub.id)) return false;
    return sub.workflowSteps.some((s) => {
      if (!PROFESSOR_STEP_ROLES.includes(s.role)) return false;
      if (s.status !== "APPROVED" && s.status !== "REJECTED") return false;
      if (s.role === "ADVISOR")               return (sub as any).advisorId === user?.id;
      if (s.role === "HEAD_EXAM_COMMITTEE")   return (sub as any).headCommitteeId === user?.id;
      if (s.role === "INVITED_EXAM_COMMITTEE")return (sub as any).invitedCommitteeId === user?.id;
      if (s.role === "PROGRAM_CHAIR")         return s.actedById === user?.id;
      return (s.committeeActions ?? []).some((a) => a.userId === user?.id);
    });
  });

  const approvedCount = history.filter((sub) =>
    sub.workflowSteps.some((s) => {
      if (!PROFESSOR_STEP_ROLES.includes(s.role) || s.status !== "APPROVED") return false;
      if (s.role === "EXAM_COMMITTEE" || s.role === "CO_ADVISOR")
        return (s.committeeActions ?? []).some((a) => a.userId === user?.id && a.decision === "APPROVED");
      return s.actedById === user?.id;
    })
  ).length;

  const list = tab === "pending" ? pending : history;

  return (
    <div className="space-y-6">
      <DashboardHeader
        role="PROFESSOR"
        name={user?.name ?? ""}
        title="รายการรออนุมัติ — อาจารย์"
        highlight={{ label: "รอดำเนินการ", value: pending.length }}
        stats={[
          { label: "รอดำเนินการ",       value: pending.length },
          { label: "อนุมัติแล้ว",       value: approvedCount },
          { label: "เกี่ยวข้องทั้งหมด", value: submissions.length },
        ]}
      />

      <div className="flex border-b border-gray-200 overflow-x-auto">
        <TabBtn active={tab === "pending"} count={pending.length} countTone="orange" onClick={() => setTab("pending")}>
          <Clock className="w-4 h-4" /> รอดำเนินการ
        </TabBtn>
        <TabBtn active={tab === "history"} count={history.length} countTone="gray" onClick={() => setTab("history")}>
          <History className="w-4 h-4" /> ประวัติที่ดำเนินการแล้ว
        </TabBtn>
      </div>

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
            const currentStep = sub.workflowSteps.find((s) => s.status === "PENDING");
            const isPendingTab = tab === "pending";
            const myActedStep = !isPendingTab
              ? sub.workflowSteps.filter(
                  (s) => PROFESSOR_STEP_ROLES.includes(s.role) &&
                         (s.status === "APPROVED" || s.status === "REJECTED") &&
                         (s.actedById === user?.id ||
                          (s.committeeActions ?? []).some((a) => a.userId === user?.id))
                ).at(-1)
              : null;

            return (
              <Link
                key={sub.id}
                href={`/dashboard/professor/${sub.id}`}
                className="group flex items-stretch gap-0 bg-white rounded-2xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition overflow-hidden"
              >
                <div className={`w-1.5 shrink-0 ${isPendingTab ? "bg-orange-400" : "bg-green-400"}`} />
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
                        {isPendingTab && currentStep && (
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

function TabBtn({ active, count, countTone, onClick, children }: {
  active: boolean; count: number; countTone: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 sm:px-5 py-3 font-medium text-sm border-b-2 transition whitespace-nowrap shrink-0 ${
        active ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
      {count > 0 && (
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          countTone === "orange" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}
