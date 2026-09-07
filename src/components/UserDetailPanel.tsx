"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { SubmissionStatusBadge } from "@/components/StatusBadge";
import { ROLE_LABELS, getStepName } from "@/lib/utils";
import { canManageAccount } from "@/lib/accountScope";
import { MockSubmission, Role } from "@/types";
import {
  ChevronRight, FileText, Clock,
  CheckCircle2, XCircle, AlertCircle, Pencil, X, Loader2, Trash2, KeyRound,
} from "lucide-react";

const INPUT_CLS = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition placeholder:text-gray-300";

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

function getRelatedSubmissions(
  submissions: MockSubmission[],
  userId: string,
  roles: Role[]
): MockSubmission[] {
  if (roles.includes("ADMIN")) return submissions; // submission workflow is ADMIN's exclusive responsibility
  return submissions.filter((s) =>
    s.studentId === userId ||
    (s as any).advisorId === userId ||
    ((s.coAdvisorIds ?? []) as string[]).includes(userId) ||
    ((s.committeeIds ?? []) as string[]).includes(userId) ||
    (s as any).headCommitteeId === userId ||
    (s as any).invitedCommitteeId === userId ||
    (s as any).programChairId === userId
  );
}

export function UserDetailPanel({ uid, onDeleted }: { uid: string; onDeleted?: () => void }) {
  const { user: viewer, submissions, users, adminUpdateUserInfo, superAdminDeleteUser, superAdminResetPasscode } = useApp();
  const { showToast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editStudentId, setEditStudentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const user = users.find((u) => u.id === uid);

  // See src/lib/accountScope.ts for the SUPER_ADMIN/ADMIN account-management tiers
  const canManageTarget = !!viewer && !!user && canManageAccount(viewer.roles, user.roles);

  if (!viewer || !user) {
    return <p className="text-center py-10 text-gray-400">ไม่พบผู้ใช้งาน</p>;
  }

  function openEdit() {
    setEditName(user?.name ?? "");
    setEditStudentId(user?.studentId ?? "");
    setEditOpen(true);
  }

  async function handleSaveInfo(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updates: { name?: string; studentId?: string } = {};
      if (editName.trim() !== user?.name) updates.name = editName.trim();
      if (editStudentId.trim() !== (user?.studentId ?? "")) updates.studentId = editStudentId.trim();
      if (Object.keys(updates).length === 0) { setEditOpen(false); return; }
      await adminUpdateUserInfo(uid, updates);
      showToast("แก้ไขข้อมูลสำเร็จ", "success");
      setEditOpen(false);
    } catch (err: any) {
      showToast(err.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await superAdminDeleteUser(uid);
      showToast("ลบผู้ใช้งานสำเร็จ", "success");
      onDeleted?.();
    } catch (err: any) {
      showToast(err.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่", "error");
      setConfirmDelete(false);
    }
  }

  async function handleResetPasscode() {
    setPwSaving(true);
    try {
      await superAdminResetPasscode(uid);
      showToast("ออกรหัสเข้าใช้งานใหม่และส่งอีเมลแจ้งผู้ใช้งานแล้ว", "success");
      setPwOpen(false);
    } catch (err: any) {
      showToast(err.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่", "error");
    } finally {
      setPwSaving(false);
    }
  }

  const related   = getRelatedSubmissions(submissions, uid, user.roles);
  const inProg    = related.filter((s) => s.status === "IN_PROGRESS").length;
  const completed = related.filter((s) => s.status === "COMPLETED").length;
  const rejected  = related.filter((s) => s.status === "REJECTED").length;

  // Sort: in-progress first, then by date desc
  const sorted = [...related].sort((a, b) => {
    const order = { IN_PROGRESS: 0, DRAFT: 1, REJECTED: 2, COMPLETED: 3, CANCELLED: 4 };
    const diff = (order[a.status] ?? 9) - (order[b.status] ?? 9);
    return diff !== 0 ? diff : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="space-y-6">
      {/* Profile card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-start gap-4">
          {/* Avatar initial */}
          <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center shrink-0">
            <span className="text-2xl font-bold text-blue-600">
              {user.name.charAt(0)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 leading-snug">{user.name}</h1>
            <p className="text-gray-500 mt-0.5">{user.email}</p>
            {user.studentId && (
              <p className="text-sm text-gray-400 mt-0.5">รหัสนักศึกษา: {user.studentId}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {canManageTarget && (
              <>
                <button
                  onClick={openEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition"
                  title="แก้ไขชื่อ / รหัสนิสิต"
                >
                  <Pencil className="w-4 h-4" />
                  แก้ไข
                </button>
                <button
                  onClick={() => setPwOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition"
                  title="รีเซ็ตรหัสเข้าใช้งาน"
                >
                  <KeyRound className="w-4 h-4" />
                  รหัสเข้าใช้งาน
                </button>
                {viewer.id !== user.id && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition"
                    title="ลบผู้ใช้งาน"
                  >
                    <Trash2 className="w-4 h-4" />
                    ลบ
                  </button>
                )}
              </>
            )}
            <span className="text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
              {user.roles.map((r) => ROLE_LABELS[r]).join(" / ")}
            </span>
          </div>
        </div>

        {confirmDelete && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
            <p className="text-sm text-red-700 font-medium">ยืนยันการลบผู้ใช้งานนี้? การกระทำนี้ไม่สามารถย้อนกลับได้</p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                className="flex-1 py-2 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition"
              >
                ยืนยันลบ
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}

        {/* Quick stats */}
        {related.length > 0 && (
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100">
            <StatBox icon={<Clock className="w-5 h-5 text-blue-500" />}        value={inProg}    label="กำลังดำเนินการ" color="text-blue-700" />
            <StatBox icon={<CheckCircle2 className="w-5 h-5 text-green-500" />} value={completed} label="เสร็จสิ้น"       color="text-green-700" />
            <StatBox icon={<XCircle className="w-5 h-5 text-red-400" />}        value={rejected}  label="ถูกปฏิเสธ"      color="text-red-600" />
          </div>
        )}
      </div>

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

      {/* Edit name / studentId modal */}
      {editOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setEditOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">แก้ไขข้อมูลผู้ใช้</h2>
              <button onClick={() => setEditOpen(false)} className="text-gray-400 hover:text-gray-600 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveInfo} className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">ชื่อ-นามสกุล *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={INPUT_CLS}
                />
              </div>

              {canManageTarget && user.roles.includes("STUDENT") && (
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">รหัสนิสิต (10 หลัก)</label>
                  <input
                    type="text"
                    value={editStudentId}
                    onChange={(e) => setEditStudentId(e.target.value)}
                    placeholder="เว้นว่างเพื่อลบรหัส"
                    maxLength={10}
                    className={INPUT_CLS}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? "กำลังบันทึก..." : "บันทึก"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset passcode confirm modal */}
      {pwOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setPwOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">รีเซ็ตรหัสเข้าใช้งาน</h2>
              <button onClick={() => setPwOpen(false)} className="text-gray-400 hover:text-gray-600 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600">
              ระบบจะสร้างรหัสเข้าใช้งานใหม่และส่งอีเมลแจ้ง <strong>{user.email}</strong> โดยอัตโนมัติ
              รหัสเดิมจะใช้งานไม่ได้อีกต่อไป
            </p>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setPwOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleResetPasscode}
                disabled={pwSaving}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {pwSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {pwSaving ? "กำลังดำเนินการ..." : "ยืนยันรีเซ็ต"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({
  icon, value, label, color,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 py-3">
      {icon}
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
