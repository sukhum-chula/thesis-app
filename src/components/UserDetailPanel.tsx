"use client";

import Link from "next/link";
import { useApp } from "@/context/AppContext";
import { SubmissionStatusBadge } from "@/components/StatusBadge";
import { getStepName, getRelatedSubmissions } from "@/lib/utils";
import {
  ChevronRight, FileText, AlertCircle,
} from "lucide-react";

function daysSince(dateStr: string): string {
  const days = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days === 0) return "วันนี้";
  if (days === 1) return "เมื่อวาน";
  if (days < 30) return `${days} วันที่แล้ว`;
  if (days < 365) return `${Math.floor(days / 30)} เดือนที่แล้ว`;
  return `${Math.floor(days / 365)} ปีที่แล้ว`;
}

// Related-submissions list for one user. The identity/account-management header (name/email/
// role badge, edit/reset-passcode/delete, quick stats) lives in UserProfileHeader — rendered
// directly on each row of AdminUsersPanel's list, not gated behind expanding this panel.
export function UserDetailPanel({ uid }: { uid: string }) {
  const { user: viewer, submissions, users } = useApp();

  const user = users.find((u) => u.id === uid);

  if (!viewer || !user) {
    return <p className="text-center py-10 text-gray-400">ไม่พบผู้ใช้งาน</p>;
  }

  const related = getRelatedSubmissions(submissions, uid, user.roles);

  // Sort: in-progress first, then by date desc
  const sorted = [...related].sort((a, b) => {
    const order = { IN_PROGRESS: 0, DRAFT: 1, REJECTED: 2, COMPLETED: 3, CANCELLED: 4 };
    const diff = (order[a.status] ?? 9) - (order[b.status] ?? 9);
    return diff !== 0 ? diff : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="space-y-6">
      {/* Submissions */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-500" />
          คำร้องที่เกี่ยวข้อง
          <span className="text-sm font-normal text-gray-400">({related.length} รายการ)</span>
        </h2>

        {sorted.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 py-14 text-center text-gray-400 space-y-2">
            <FileText className="w-10 h-10 mx-auto opacity-25" />
            <p>ยังไม่มีคำร้องที่เกี่ยวข้อง</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((sub) => {
              const student     = users.find((u) => u.id === sub.studentId);
              const advisor     = users.find((u) => u.id === sub.advisorId);
              const currentStep = sub.workflowSteps.find((s) => s.status === "PENDING");
              const doneCount   = sub.workflowSteps.filter((s) => s.status === "APPROVED").length;
              const totalSteps  = sub.workflowSteps.filter((s) => s.status !== "SKIPPED").length;

              // For non-student roles: show which step they are at for this submission
              const nonStudentRole = user.roles.find((r) => r !== "STUDENT" && r !== "ADMIN" && r !== "SUPER_ADMIN");
              const myStep = nonStudentRole
                ? sub.workflowSteps.find((s) => s.role === nonStudentRole && s.status === "PENDING")
                  ?? sub.workflowSteps.filter((s) => s.role === nonStudentRole).at(-1)
                : null;

              // Days since last activity
              const lastAction = sub.workflowSteps
                .filter((s) => s.actedAt)
                .sort((a, b) => new Date(b.actedAt!).getTime() - new Date(a.actedAt!).getTime())[0];

              const isStuck = sub.status === "IN_PROGRESS" && lastAction?.actedAt
                && Math.floor((Date.now() - new Date(lastAction.actedAt).getTime()) / (1000 * 60 * 60 * 24)) > 7;

              return (
                <div key={sub.id} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
                  {/* Title + action button */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <p className="font-semibold text-gray-900 text-lg leading-snug min-w-0">{sub.title}</p>
                    <Link
                      href={`/dashboard/admin/${sub.id}`}
                      className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition"
                    >
                      ดู / แก้ไข
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>

                  {/* Meta */}
                  <div className="text-sm text-gray-500 space-y-0.5">
                    {!user.roles.includes("STUDENT") && student && (
                      <p>นักศึกษา: <span className="font-medium text-gray-700">{student.name}</span></p>
                    )}
                    {!user.roles.includes("PROFESSOR") && advisor && (
                      <p>ที่ปรึกษา: <span className="text-gray-700">{advisor.name}</span></p>
                    )}
                  </div>

                  {/* Status row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <SubmissionStatusBadge status={sub.status} />

                    {/* Current step waiting on */}
                    {currentStep && sub.status === "IN_PROGRESS" && (
                      <span className="text-sm text-orange-600 font-medium">
                        ⏳ รอ: {getStepName(currentStep.stepOrder, sub.submissionType)}
                      </span>
                    )}

                    {/* This user's step status */}
                    {myStep && (
                      <span className={`text-sm font-medium ${
                        myStep.status === "APPROVED" ? "text-green-600"
                        : myStep.status === "REJECTED" ? "text-red-500"
                        : "text-blue-600"
                      }`}>
                        {myStep.status === "APPROVED" ? "✓ ท่านอนุมัติแล้ว"
                        : myStep.status === "REJECTED" ? "✗ ท่านปฏิเสธแล้ว"
                        : "● ถึงคิวของท่าน"}
                      </span>
                    )}

                    {/* Stuck warning */}
                    {isStuck && (
                      <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                        <AlertCircle className="w-3.5 h-3.5" />
                        ค้างนาน
                      </span>
                    )}
                  </div>

                  {/* Progress + dates */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${totalSteps > 0 ? (doneCount / totalSteps) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{doneCount}/{totalSteps} ขั้น</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>ยื่นเมื่อ {daysSince(sub.createdAt)}</span>
                    {lastAction?.actedAt && (
                      <span>อัปเดตล่าสุด {daysSince(lastAction.actedAt)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
