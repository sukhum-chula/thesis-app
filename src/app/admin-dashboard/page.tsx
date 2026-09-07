"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { ROLE_ROUTES } from "@/lib/roleRoutes";
import { SubmissionStatusBadge } from "@/components/StatusBadge";
import { AdminUsersPanel } from "@/components/AdminUsersPanel";
import { ROLE_LABELS, getStepName, formatDate, toUserErrorMessage } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { SubmissionStatus } from "@/types";
import Link from "next/link";
import {
  ChevronRight, Clock, CheckCircle2, XCircle,
  Trash2, Search, AlertCircle, Bell, BarChart2, BookOpen, GraduationCap, User, Users, Upload, UserPlus,
  ClipboardList,
} from "lucide-react";
import type { MockSubmission, MockWorkflowStep, MockUser } from "@/types";
import { Role } from "@/types";

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function getStuckDays(sub: MockSubmission): number {
  if (sub.status !== "IN_PROGRESS") return 0;
  const last = sub.workflowSteps
    .filter((s) => s.actedAt)
    .sort((a, b) => new Date(b.actedAt!).getTime() - new Date(a.actedAt!).getTime())[0];
  return last?.actedAt ? daysSince(last.actedAt) : daysSince(sub.createdAt);
}

function resolvePendingName(
  sub: MockSubmission,
  step: MockWorkflowStep,
  users: { id: string; name: string; role: string; roles: string[] }[],
): string {
  switch (step.role) {
    case "ADVISOR":             return users.find((u) => u.id === sub.advisorId)?.name ?? ROLE_LABELS[step.role];
    case "HEAD_EXAM_COMMITTEE": return users.find((u) => u.id === sub.headCommitteeId)?.name ?? ROLE_LABELS[step.role];
    case "PROGRAM_CHAIR":
      return users.find((u) => u.id === (sub as any).programChairId)?.name
        ?? (sub.program ? users.find((u) => (u as any).programChairFor === sub.program)?.name : undefined)
        ?? ROLE_LABELS[step.role];
    case "EXAM_COMMITTEE": {
      const memberIds = step.committeeMembers?.length ? step.committeeMembers : (sub.committeeIds ?? []);
      const done = (step.committeeActions ?? []).filter((a) => a.decision === "APPROVED").length;
      return `${ROLE_LABELS[step.role]} (${done}/${memberIds.length})`;
    }
    default: return ROLE_LABELS[step.role];
  }
}

const STATUS_TABS: { label: string; value: SubmissionStatus | "ALL" }[] = [
  { label: "ทั้งหมด",         value: "ALL" },
  { label: "ฉบับร่าง",       value: "DRAFT" },
  { label: "กำลังดำเนินการ", value: "IN_PROGRESS" },
  { label: "เสร็จสิ้น",      value: "COMPLETED" },
  { label: "ถูกปฏิเสธ",      value: "REJECTED" },
  { label: "ยกเลิกแล้ว",     value: "CANCELLED" },
];

export default function AdminDashboard() {
  const { submissions, adminDeleteSubmission, user, users } = useApp();
  const { showToast } = useToast();
  const router = useRouter();

  const [activeTab,     setActiveTab]     = useState<"submissions" | "users">("submissions");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [statusFilter,  setStatusFilter]  = useState<SubmissionStatus | "ALL">("ALL");
  const [search,        setSearch]        = useState("");
  const [typeFilter,    setTypeFilter]    = useState<"ALL" | "PROPOSAL" | "THESIS_DEFENSE">("ALL");

  // Submission workflow is ADMIN's exclusive responsibility — SUPER_ADMIN is account/user management only
  useEffect(() => {
    if (user && !user.roles.includes("ADMIN")) router.replace(ROLE_ROUTES[user.role] ?? "/login");
  }, [user, router]);

  const typeSubs           = typeFilter === "ALL" ? submissions : submissions.filter((s) => s.submissionType === typeFilter);
  const inProgress         = typeSubs.filter((s) => s.status === "IN_PROGRESS");
  const needsMe            = inProgress.filter((s) => s.workflowSteps.find((w) => w.status === "PENDING")?.role === "ADMIN");
  const proposalInProgress = inProgress.filter((s) => s.submissionType === "PROPOSAL");
  const thesisInProgress   = inProgress.filter((s) => s.submissionType === "THESIS_DEFENSE");

  // PROPOSAL step 4 parallel: admin must upload FINANCE_DOC while student uploads B1C+B1D
  const needsFinanceUpload = inProgress.filter((s) => {
    if (s.submissionType !== "PROPOSAL") return false;
    const step = s.workflowSteps.find((w) => w.status === "PENDING");
    return step?.stepOrder === 4 && !s.uploads.some((u) => u.formType === "FINANCE_DOC");
  });

  // Cancellation requests need ADMIN attention regardless of the current type filter or whose turn it is
  const cancelRequests = submissions.filter((s) => s.cancelRequested);

  type AdminTask = { sub: MockSubmission; type: "turn" | "finance" | "cancel_request" };
  const adminTasks: AdminTask[] = [
    ...cancelRequests.map((sub) => ({ sub, type: "cancel_request" as const })),
    ...needsMe
      .filter((sub) => !cancelRequests.some((s) => s.id === sub.id))
      .map((sub) => ({ sub, type: "turn" as const })),
    ...needsFinanceUpload
      .filter((sub) => !needsMe.some((s) => s.id === sub.id) && !cancelRequests.some((s) => s.id === sub.id))
      .map((sub) => ({ sub, type: "finance" as const })),
  ];

  const counts = {
    ALL:         typeSubs.length,
    IN_PROGRESS: inProgress.length,
    COMPLETED:   typeSubs.filter((s) => s.status === "COMPLETED").length,
    REJECTED:    typeSubs.filter((s) => s.status === "REJECTED").length,
    CANCELLED:   typeSubs.filter((s) => s.status === "CANCELLED").length,
    DRAFT:       typeSubs.filter((s) => s.status === "DRAFT").length,
  };

  // Distinct professor emails named on a DRAFT submission that don't have an account yet
  const pendingProfessorEmails = new Set<string>();
  for (const s of submissions) {
    if (s.status !== "DRAFT" || !s.pendingPeople) continue;
    for (const p of s.pendingPeople) {
      const email = p.email?.trim().toLowerCase();
      if (email && !users.some((u) => u.email.toLowerCase() === email)) pendingProfessorEmails.add(email);
    }
  }

  if (user && !user.roles.includes("ADMIN")) return null;

  const filtered = typeSubs
    .filter((sub) => {
      if (statusFilter !== "ALL" && sub.status !== statusFilter) return false;
      if (search) {
        const student = users.find((u) => u.id === sub.studentId);
        const q = search.toLowerCase();
        if (
          !sub.title.toLowerCase().includes(q) &&
          !(student?.name ?? "").toLowerCase().includes(q) &&
          !(student?.studentId ?? "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    })
    .sort((a, b) => getStuckDays(b) - getStuckDays(a));

  return (
    <div className="space-y-6">
      {/* Top-level tabs */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setActiveTab("submissions")}
          className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
            activeTab === "submissions" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          จัดการคำร้อง
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
            activeTab === "users" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          <Users className="w-4 h-4" />
          จัดการผู้ใช้งาน
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 max-h-[75vh] overflow-y-auto">
      {activeTab === "users" && <AdminUsersPanel />}

      {activeTab === "submissions" && (
      <div className="space-y-6">
      {/* Admin task box — all pending tasks with specific descriptions */}
      {adminTasks.length > 0 && (
        <div className="bg-orange-50 border-2 border-orange-300 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-orange-500" />
            <h2 className="font-semibold text-orange-800 text-lg">งานที่ต้องดำเนินการ</h2>
            <span className="ml-auto text-sm font-bold text-orange-700 bg-orange-100 px-2.5 py-0.5 rounded-full">
              {adminTasks.length} รายการ
            </span>
          </div>
          <div className="space-y-2">
            {adminTasks.map(({ sub, type }) => {
              const student   = users.find((u) => u.id === sub.studentId);
              const step      = sub.workflowSteps.find((w) => w.status === "PENDING");
              const stuckDays = getStuckDays(sub);

              // Specific task description per step type
              let taskLabel: string;
              let taskIcon: React.ReactNode;
              if (type === "cancel_request") {
                taskLabel = "นิสิตขอยกเลิกคำร้อง — รอการอนุมัติ";
                taskIcon  = <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
              } else if (type === "finance") {
                taskLabel = "อัปโหลดเอกสารการเงิน";
                taskIcon  = <Upload className="w-3.5 h-3.5 text-yellow-600 shrink-0" />;
              } else if (sub.submissionType === "THESIS_DEFENSE" && step?.stepOrder === 7) {
                taskLabel = "พิมพ์ บ.2+บ.3 แล้วนำส่งไปยังคณะวิศวกรรมศาสตร์";
                taskIcon  = <Clock className="w-3.5 h-3.5 text-orange-500 shrink-0" />;
              } else if (sub.submissionType === "THESIS_DEFENSE" && step?.stepOrder === 8) {
                taskLabel = "รับเอกสารจากคณะ อัปโหลด แล้วส่งต่อนิสิต";
                taskIcon  = <Upload className="w-3.5 h-3.5 text-orange-500 shrink-0" />;
              } else {
                taskLabel = "ตรวจสอบเอกสารและอนุมัติ";
                taskIcon  = <CheckCircle2 className="w-3.5 h-3.5 text-orange-500 shrink-0" />;
              }

              return (
                <Link
                  key={`${sub.id}-${type}`}
                  href={`/dashboard/admin/${sub.id}`}
                  className={`flex items-start gap-3 bg-white rounded-xl px-4 py-3 border hover:shadow-sm transition group ${
                    type === "cancel_request" ? "border-red-200 hover:border-red-400" : "border-orange-200 hover:border-orange-400"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 truncate">{sub.title}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                      <User className="w-3 h-3 shrink-0" />
                      {student?.name ?? "—"}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {taskIcon}
                      <span className={`text-xs font-medium ${type === "finance" ? "text-yellow-700" : type === "cancel_request" ? "text-red-700" : "text-orange-700"}`}>
                        {taskLabel}
                      </span>
                      {stuckDays > 7 && (
                        <span className="text-xs text-red-600 font-semibold bg-red-50 px-1.5 py-0.5 rounded-full">
                          ค้างมา {stuckDays} วัน
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-orange-400 shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending professor account requests */}
      {pendingProfessorEmails.size > 0 && (
        <Link
          href="/dashboard/admin/pending-professors"
          className="flex items-center gap-3 bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 hover:border-amber-400 hover:shadow-sm transition group"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
            <UserPlus className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-900">รอสร้างบัญชีให้อาจารย์/กรรมการ</p>
            <p className="text-xs text-amber-700 mt-0.5">มีคำร้องฉบับร่างที่รอบัญชีใหม่ {pendingProfessorEmails.size} รายการ</p>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-500 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}

      {/* Step distribution */}
      {inProgress.length > 0 && (
        <StepDistributionDashboard
          proposalSubs={proposalInProgress}
          thesisSubs={thesisInProgress}
          users={users}
        />
      )}

      {/* Search + status tabs */}
      <div className="space-y-3">
        {/* Type filter pills */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              { label: "ทุกประเภท",        value: "ALL",            icon: null,                                           activeClass: "bg-gray-700 text-white" },
              { label: "โครงร่าง",          value: "PROPOSAL",       icon: <BookOpen className="w-3.5 h-3.5" />,          activeClass: "bg-blue-600 text-white" },
              { label: "สอบวิทยานิพนธ์",   value: "THESIS_DEFENSE", icon: <GraduationCap className="w-3.5 h-3.5" />,     activeClass: "bg-indigo-600 text-white" },
            ] as const
          ).map(({ label, value, icon, activeClass }) => (
            <button
              key={value}
              onClick={() => { setTypeFilter(value); setStatusFilter("ALL"); }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition ${
                typeFilter === value ? activeClass : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อวิทยานิพนธ์ หรือชื่อนักศึกษา..."
            className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
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
                {(counts as Record<string, number>)[tab.value]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Submission list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 py-16 text-center space-y-2 text-gray-400">
          <Search className="w-10 h-10 mx-auto opacity-25" />
          <p className="text-lg">ไม่พบรายการที่ตรงกับการค้นหา</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((sub) => {
            const student     = users.find((u) => u.id === sub.studentId);
            const currentStep = sub.workflowSteps.find((s) => s.status === "PENDING");
            const visibleSteps = sub.workflowSteps.filter((s) => s.status !== "SKIPPED");
            const doneCount   = visibleSteps.filter((s) => s.status === "APPROVED").length;
            const totalVisible = visibleSteps.length;
            const currentDisplayOrder = currentStep
              ? visibleSteps.findIndex((s) => s.id === currentStep.id) + 1
              : 0;
            const stuckDays   = getStuckDays(sub);
            const isMyTurn    = currentStep?.role === "ADMIN";
            const pendingName = currentStep ? resolvePendingName(sub, currentStep, users) : null;
            const stepName    = currentStep ? (getStepName(currentStep.stepOrder, sub.submissionType) || ROLE_LABELS[currentStep.role]) : null;

            return (
              <div
                key={sub.id}
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
              >
                {/* Top accent bar for urgency */}
                {(isMyTurn || stuckDays > 7) && (
                  <div className={`h-1 w-full ${isMyTurn ? "bg-orange-400" : "bg-amber-300"}`} />
                )}

                <div className="p-5 space-y-3">
                  {/* Row 1: type + title + actions */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {sub.submissionType === "PROPOSAL" && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full shrink-0">
                            <BookOpen className="w-3 h-3" />โครงร่าง
                          </span>
                        )}
                        {sub.submissionType === "THESIS_DEFENSE" && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full shrink-0">
                            <GraduationCap className="w-3 h-3" />สอบวิทยานิพนธ์
                          </span>
                        )}
                        <SubmissionStatusBadge status={sub.status} />
                        {sub.cancelRequested && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full shrink-0">
                            <XCircle className="w-3 h-3" />ขอยกเลิก
                          </span>
                        )}
                        {stuckDays > 7 && (
                          <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-semibold shrink-0">
                            <AlertCircle className="w-3.5 h-3.5" />ค้างมา {stuckDays} วัน
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-gray-900 text-base leading-snug">{sub.title}</p>
                      <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                        <User className="w-3.5 h-3.5 shrink-0" />
                        {student ? (
                          <Link
                            href={`/dashboard/admin/users/${student.id}`}
                            className="font-medium text-blue-600 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {student.name}
                          </Link>
                        ) : "—"}
                        {student?.studentId && <span className="text-gray-400">({student.studentId})</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {confirmDelete === sub.id ? (
                        <>
                          <span className="text-sm text-red-600 font-medium">ยืนยันลบ?</span>
                          <button
                            onClick={async () => {
                              setConfirmDelete(null);
                              try {
                                await adminDeleteSubmission(sub.id);
                                showToast("ลบคำร้องแล้ว");
                              } catch (err) {
                                showToast(toUserErrorMessage(err, "ลบไม่สำเร็จ กรุณาลองอีกครั้ง"), "error");
                              }
                            }}
                            className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700">ลบ</button>
                          <button onClick={() => setConfirmDelete(null)}
                            className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm rounded-lg">ยกเลิก</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setConfirmDelete(sub.id)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <Link href={`/dashboard/admin/${sub.id}`}
                            className={`flex items-center gap-1.5 px-4 py-2 text-white text-sm font-semibold rounded-xl transition ${
                              isMyTurn ? "bg-orange-500 hover:bg-orange-600" : "bg-blue-600 hover:bg-blue-700"
                            }`}>
                            {isMyTurn ? "ดำเนินการ" : "จัดการ"} <ChevronRight className="w-4 h-4" />
                          </Link>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Row 2: current waiting step */}
                  {currentStep && stepName && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${
                      isMyTurn ? "bg-orange-50 border border-orange-200" : "bg-gray-50 border border-gray-100"
                    }`}>
                      <Clock className={`w-4 h-4 shrink-0 ${isMyTurn ? "text-orange-500" : "text-gray-400"}`} />
                      <span className={`font-semibold shrink-0 ${isMyTurn ? "text-orange-700" : "text-gray-600"}`}>
                        ขั้นที่ {currentDisplayOrder}/{totalVisible}
                      </span>
                      <span className={`truncate ${isMyTurn ? "text-orange-700" : "text-gray-600"}`}>{stepName}</span>
                      {pendingName && !isMyTurn && (
                        <span className="text-gray-400 shrink-0 text-xs">— รอ {pendingName}</span>
                      )}
                      {isMyTurn && (
                        <span className="ml-auto text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full shrink-0">
                          รอท่าน
                        </span>
                      )}
                    </div>
                  )}
                  {sub.status === "COMPLETED" && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-green-50 border border-green-100">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      <span className="text-green-700 font-medium">ผ่านครบทุกขั้นตอน</span>
                    </div>
                  )}
                  {sub.status === "REJECTED" && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-red-50 border border-red-100">
                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <span className="text-red-600 font-medium">ถูกปฏิเสธ</span>
                    </div>
                  )}
                  {sub.status === "DRAFT" && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-amber-50 border border-amber-100">
                      <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className="text-amber-700 font-medium">ฉบับร่าง — รอสร้างบัญชีให้กรรมการที่ยังไม่มีในระบบ</span>
                    </div>
                  )}

                  {/* Row 3: progress bar */}
                  {sub.status !== "DRAFT" && (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            sub.status === "COMPLETED" ? "bg-green-500" :
                            sub.status === "REJECTED"  ? "bg-red-400"   :
                            isMyTurn                   ? "bg-orange-400" : "bg-blue-500"
                          }`}
                          style={{ width: `${totalVisible > 0 ? (doneCount / totalVisible) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{doneCount}/{totalVisible} ขั้น</span>
                      <span className="text-xs text-gray-400 shrink-0">{formatDate(sub.createdAt)}</span>
                    </div>
                  )}
                  {sub.status === "DRAFT" && (
                    <span className="text-xs text-gray-400">{formatDate(sub.createdAt)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
      )}
      </div>
    </div>
  );
}

type StepGroup = { stepOrder: number; role: Role; subs: MockSubmission[] };

function buildStepGroups(subs: MockSubmission[]): StepGroup[] {
  const map = new Map<number, StepGroup>();
  for (const sub of subs) {
    const pending = sub.workflowSteps.find((s) => s.status === "PENDING");
    if (!pending) continue;
    if (!map.has(pending.stepOrder)) {
      map.set(pending.stepOrder, { stepOrder: pending.stepOrder, role: pending.role as Role, subs: [] });
    }
    map.get(pending.stepOrder)!.subs.push(sub);
  }
  return Array.from(map.values()).sort((a, b) => a.stepOrder - b.stepOrder);
}

function StepDistributionDashboard({
  proposalSubs, thesisSubs, users,
}: {
  proposalSubs: MockSubmission[];
  thesisSubs: MockSubmission[];
  users: MockUser[];
}) {
  const proposalGroups = buildStepGroups(proposalSubs);
  const thesisGroups   = buildStepGroups(thesisSubs);
  const total = proposalSubs.length + thesisSubs.length;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <BarChart2 className="w-5 h-5 text-slate-500" />
        <h2 className="font-semibold text-gray-800">สถานะคำร้องตามขั้นตอน</h2>
        <span className="ml-auto text-sm text-gray-400">{total} คำร้องกำลังดำเนินการ</span>
      </div>
      <div className="divide-y divide-gray-100">
        {proposalGroups.length > 0 && (
          <div className="px-5 py-4 space-y-2">
            <div className="flex items-center mb-1">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">โครงร่าง · 11 ขั้นตอน</p>
              <span className="ml-auto text-xs font-semibold text-gray-400">ค้างอยู่</span>
            </div>
            {proposalGroups.map((g) => (
              <StepRow key={g.stepOrder} group={g} totalSteps={11} submissionType="PROPOSAL" users={users} />
            ))}
          </div>
        )}
        {thesisGroups.length > 0 && (
          <div className="px-5 py-4 space-y-2">
            <div className="flex items-center mb-1">
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">สอบวิทยานิพนธ์ · 22 ขั้นตอน</p>
              <span className="ml-auto text-xs font-semibold text-gray-400">ค้างอยู่</span>
            </div>
            {thesisGroups.map((g) => (
              <StepRow key={g.stepOrder} group={g} totalSteps={22} submissionType="THESIS_DEFENSE" users={users} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StepRow({ group, totalSteps, submissionType, users }: {
  group: StepGroup; totalSteps: number; submissionType: string; users: MockUser[];
}) {
  const [open, setOpen]  = useState(false);
  const isAdminStep      = group.role === "ADMIN";
  const stepName         = getStepName(group.stepOrder, submissionType);
  const count            = group.subs.length;

  return (
    <div className={`rounded-xl overflow-hidden border ${
      isAdminStep ? "border-orange-200" : "border-gray-100"
    }`}>
      {/* Header row — clickable */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition ${
          isAdminStep
            ? "bg-orange-50 hover:bg-orange-100"
            : "bg-gray-50 hover:bg-gray-100"
        }`}
      >
        <span className={`text-xs font-bold w-14 shrink-0 ${isAdminStep ? "text-orange-500" : "text-gray-400"}`}>
          ขั้น {group.stepOrder}/{totalSteps}
        </span>
        <span className={`flex-1 text-sm truncate ${isAdminStep ? "text-orange-900 font-medium" : "text-gray-700"}`}>
          {stepName}
        </span>
        {isAdminStep && (
          <span className="text-xs font-semibold text-orange-600 shrink-0">รอท่าน</span>
        )}
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
          isAdminStep ? "bg-orange-200 text-orange-800" : "bg-gray-200 text-gray-600"
        }`}>
          {count}
        </span>
        <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-90" : ""} ${
          isAdminStep ? "text-orange-400" : "text-gray-300"
        }`} />
      </button>

      {/* Expanded student list */}
      {open && (
        <div className={`border-t divide-y ${
          isAdminStep ? "border-orange-100 divide-orange-50" : "border-gray-100 divide-gray-50"
        }`}>
          {group.subs.map((sub) => {
            const student = users.find((u) => u.id === sub.studentId);
            return (
              <Link
                key={sub.id}
                href={`/dashboard/admin/${sub.id}`}
                className={`flex items-center gap-3 px-4 py-2.5 transition ${
                  isAdminStep
                    ? "bg-orange-50 hover:bg-orange-100"
                    : "bg-white hover:bg-gray-50"
                }`}
              >
                <User className={`w-3.5 h-3.5 shrink-0 ${isAdminStep ? "text-orange-400" : "text-gray-400"}`} />
                <span className={`text-sm font-medium flex-1 ${isAdminStep ? "text-orange-900" : "text-gray-700"}`}>
                  {student?.name ?? "นักศึกษา"}
                </span>
                {student?.studentId && (
                  <span className="text-xs text-gray-400 shrink-0">{student.studentId}</span>
                )}
                <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${isAdminStep ? "text-orange-400" : "text-gray-300"}`} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
