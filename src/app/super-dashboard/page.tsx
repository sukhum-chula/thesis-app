"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { ROLE_LABELS, ROLE_GRADIENT, ROLE_EMOJI, ROLE_DESC, formatDate, generatePassword, isValidPasscode } from "@/lib/utils";
import { ROLE_ROUTES } from "@/lib/roleRoutes";
import { SubmissionStatusBadge } from "@/components/StatusBadge";
import { PasscodeField } from "@/components/PasscodeField";
import { useToast } from "@/context/ToastContext";
import { Role, MockUser } from "@/types";
import {
  Crown, Users, ClipboardList, BookOpen, GraduationCap, XCircle,
  Trash2, Plus, X, AlertTriangle, KeyRound,
} from "lucide-react";

// SUPER_ADMIN's own remit: SUPER_ADMIN + ADMIN accounts only — everything else (STUDENT,
// PROFESSOR) is ADMIN's exclusive territory. See src/lib/accountScope.ts. It CAN, however,
// view every account read-only via GET /api/super-admin/users (oversight, not management).
const MANAGEABLE_ROLES: Role[] = ["ADMIN", "SUPER_ADMIN"];
// Standard user-type sort order used elsewhere in the app (src/lib/utils.ts's ROLE_SORT_ORDER).
const ALL_ROLES: Role[] = ["SUPER_ADMIN", "ADMIN", "PROFESSOR", "STUDENT"];

interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  role: string;
  roles: string[];
  studentId?: string;
}

interface DirectorySubmission {
  id: string;
  title: string;
  submissionType: "PROPOSAL" | "THESIS_DEFENSE" | null;
  status: "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | "CANCELLED";
  cancelRequested: boolean;
  studentName: string | null;
  studentCode: string | null;
  createdAt: string;
  currentStepName: string | null;
  doneCount: number;
  totalSteps: number;
}

export default function SuperDashboardPage() {
  const {
    user, users,
    superAdminUpdateUserRole, superAdminDeleteUser, superAdminAddUser, superAdminResetPasscode,
  } = useApp();
  const { showToast } = useToast();
  const router = useRouter();
  const isSuperAdmin = user?.roles.includes("SUPER_ADMIN") ?? false;

  useEffect(() => {
    if (user && !isSuperAdmin) router.replace(ROLE_ROUTES[user.role]);
  }, [user, isSuperAdmin, router]);

  const [directory, setDirectory] = useState<DirectoryUser[] | null>(null);
  const [submissions, setSubmissions] = useState<DirectorySubmission[] | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch("/api/super-admin/users")
      .then((r) => (r.ok ? r.json() : null))
      .then(setDirectory)
      .catch(() => setDirectory(null));
    fetch("/api/super-admin/submissions")
      .then((r) => (r.ok ? r.json() : null))
      .then(setSubmissions)
      .catch(() => setSubmissions(null));
  }, [isSuperAdmin]);

  const [confirmDelete,    setConfirmDelete]    = useState<string | null>(null);
  const [showAddForm,      setShowAddForm]       = useState(false);
  const [newName,          setNewName]           = useState("");
  const [newEmail,         setNewEmail]          = useState("");
  const [newRole,          setNewRole]           = useState<Role>("ADMIN");
  const [newPasscode,      setNewPasscode]       = useState(generatePassword());
  const [pwUserId,         setPwUserId]          = useState<string | null>(null);
  const [pwPasscode,       setPwPasscode]        = useState(generatePassword());
  const [pwLoading,        setPwLoading]         = useState(false);

  function openPasswordForm(uid: string) {
    setPwPasscode(generatePassword());
    setPwUserId(uid);
  }
  function closePasswordForm() {
    setPwUserId(null);
  }
  async function handleResetPasscode() {
    if (!isValidPasscode(pwPasscode)) {
      showToast("รหัสเข้าใช้งานต้องมีความยาว 6-72 ตัวอักษร และไม่มีช่องว่าง", "error");
      return;
    }
    setPwLoading(true);
    try {
      await superAdminResetPasscode(pwUserId!, pwPasscode.trim());
      showToast("ออกรหัสเข้าใช้งานใหม่และส่งอีเมลแจ้งผู้ใช้งานแล้ว ✓");
      closePasswordForm();
    } catch {
      showToast("เกิดข้อผิดพลาด กรุณาลองอีกครั้ง", "error");
    } finally {
      setPwLoading(false);
    }
  }

  if (!user || !isSuperAdmin) return null;

  function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) return;
    if (!isValidPasscode(newPasscode)) {
      showToast("รหัสเข้าใช้งานต้องมีความยาว 6-72 ตัวอักษร และไม่มีช่องว่าง", "error");
      return;
    }
    const userData: Omit<MockUser, "id"> & { passcode?: string } = {
      name:  newName.trim(),
      email: newEmail.trim().toLowerCase(),
      role:  newRole,
      roles: [newRole],
      passcode: newPasscode.trim(),
    };
    superAdminAddUser(userData);
    setNewName(""); setNewEmail(""); setNewRole("ADMIN"); setNewPasscode(generatePassword());
    setShowAddForm(false);
  }

  return (
    <div className="space-y-6">
      {/* User management — SUPER_ADMIN + ADMIN accounts only */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            <h2 className="font-semibold text-gray-800 text-lg">จัดการผู้ดูแลระบบ</h2>
          </div>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition"
          >
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showAddForm ? "ยกเลิก" : "เพิ่มผู้ดูแลระบบ"}
          </button>
        </div>

        {/* Add user form */}
        {showAddForm && (
          <form onSubmit={handleAddUser} className="p-5 border-b border-amber-100 bg-amber-50 space-y-4">
            <p className="font-medium text-amber-800">เพิ่มบัญชีผู้ดูแลระบบใหม่</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล *</label>
                <input
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="ชื่อ-นามสกุล"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล *</label>
                <input
                  required
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">บทบาท *</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                >
                  {MANAGEABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_EMOJI[r]} {ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
            </div>
            <PasscodeField value={newPasscode} onChange={setNewPasscode} />
            <p className="text-sm text-amber-700">ระบบจะส่งรหัสเข้าใช้งานนี้ไปยังอีเมลของบัญชีนี้โดยอัตโนมัติ</p>
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition"
            >
              <Plus className="w-4 h-4" />
              เพิ่มผู้ดูแลระบบ
            </button>
          </form>
        )}

        {/* User table */}
        <div className="divide-y divide-gray-100">
          {users.map((u) => (
            <div key={u.id}>
              {/* Main row */}
              <div className="flex items-center gap-3 px-5 py-4">
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${ROLE_GRADIENT[u.role]} flex items-center justify-center shrink-0 text-base`}>
                  {ROLE_EMOJI[u.role]}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{u.name}</p>
                  <p className="text-sm text-gray-400 truncate">{u.email}</p>
                </div>

                {/* Role selector */}
                <select
                  value={u.role}
                  onChange={(e) => superAdminUpdateUserRole(u.id, e.target.value as Role)}
                  disabled={u.id === user?.id}
                  className="shrink-0 border border-gray-200 rounded-xl px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  title={u.id === user?.id ? "ไม่สามารถเปลี่ยนบทบาทของตัวเองได้" : "เปลี่ยนบทบาท"}
                >
                  {MANAGEABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>

                {/* Reset passcode */}
                <button
                  onClick={() => pwUserId === u.id ? closePasswordForm() : openPasswordForm(u.id)}
                  className={`p-2 rounded-lg transition shrink-0 ${
                    pwUserId === u.id
                      ? "text-amber-600 bg-amber-100"
                      : "text-gray-300 hover:text-amber-500 hover:bg-amber-50"
                  }`}
                  title="รีเซ็ตรหัสเข้าใช้งาน"
                >
                  <KeyRound className="w-4 h-4" />
                </button>

                {/* Delete */}
                {u.id === user?.id ? (
                  <div className="w-8 shrink-0" />
                ) : confirmDelete === u.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { superAdminDeleteUser(u.id); setConfirmDelete(null); }}
                      className="px-2.5 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700"
                    >ลบ</button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="px-2.5 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg"
                    >ยกเลิก</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(u.id)}
                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0"
                    title="ลบผู้ใช้"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Inline reset-passcode confirm */}
              {pwUserId === u.id && (
                <div className="mx-5 mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3">
                  <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4" />
                    รีเซ็ตรหัสเข้าใช้งานสำหรับ {u.name}
                  </p>
                  <p className="text-sm text-amber-700">
                    กำหนดรหัสเข้าใช้งานใหม่เอง หรือกดสุ่มรหัส — ระบบจะส่งอีเมลแจ้ง {u.email} โดยอัตโนมัติ รหัสเดิมจะใช้งานไม่ได้อีกต่อไป
                  </p>
                  <PasscodeField value={pwPasscode} onChange={setPwPasscode} />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleResetPasscode}
                      disabled={pwLoading}
                      className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl disabled:opacity-60 transition"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      {pwLoading ? "กำลังดำเนินการ..." : "ยืนยันรีเซ็ต"}
                    </button>
                    <button
                      type="button"
                      onClick={closePasswordForm}
                      className="px-4 py-2 bg-white border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50 transition"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Submission list — read-only, system-wide oversight. No approve/reject/override, no
          detail-page link: acting on a submission stays exclusively ADMIN's job. */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <ClipboardList className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold text-gray-800 text-lg">รายการคำร้องทั้งหมด</h2>
          <span className="text-sm text-gray-400">({submissions?.length ?? "…"})</span>
        </div>
        <div className="divide-y divide-gray-100">
          {submissions === null ? (
            <p className="px-5 py-6 text-sm text-gray-400">กำลังโหลด...</p>
          ) : submissions.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">ยังไม่มีคำร้องในระบบ</p>
          ) : (
            submissions.map((sub) => (
              <div key={sub.id} className="px-5 py-4">
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
                </div>
                <p className="font-semibold text-gray-900 text-sm leading-snug truncate">{sub.title}</p>
                <div className="flex items-center justify-between gap-3 mt-1 flex-wrap">
                  <p className="text-sm text-gray-500 truncate">
                    {sub.studentName ?? "—"}
                    {sub.studentCode && <span className="text-gray-400"> ({sub.studentCode})</span>}
                  </p>
                  <p className="text-xs text-gray-400 shrink-0">{formatDate(sub.createdAt)}</p>
                </div>
                {sub.currentStepName && (
                  <p className="text-xs text-gray-400 mt-1">
                    รอ: {sub.currentStepName} ({sub.doneCount}/{sub.totalSteps})
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* User directory — read-only, system-wide (incl. STUDENT/PROFESSOR), oversight only */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <Users className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold text-gray-800 text-lg">รายชื่อผู้ใช้งานทั้งหมด</h2>
          <span className="text-sm text-gray-400">({directory?.length ?? "…"})</span>
        </div>
        <div className="divide-y divide-gray-100">
          {directory === null ? (
            <p className="px-5 py-6 text-sm text-gray-400">กำลังโหลด...</p>
          ) : (
            ALL_ROLES.map((r) => {
              const group = directory.filter((u) => u.role === r);
              if (group.length === 0) return null;
              return (
                <div key={r} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-6 h-6 rounded-lg bg-gradient-to-br ${ROLE_GRADIENT[r]} flex items-center justify-center text-xs shrink-0`}>
                      {ROLE_EMOJI[r]}
                    </span>
                    <p className="text-sm font-semibold text-gray-700">{ROLE_LABELS[r]}</p>
                    <span className="text-xs text-gray-400">({group.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {group.map((u) => (
                      <div key={u.id} className="flex items-center gap-3 pl-8">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                        </div>
                        <p className="text-sm text-gray-400 truncate">{u.email}</p>
                        {u.studentId && (
                          <span className="text-xs text-gray-400 shrink-0">{u.studentId}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Role reference (informational) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <h2 className="font-semibold text-gray-800">อ้างอิงบทบาทในระบบ</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {ALL_ROLES.map((r) => (
            <div key={r} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${ROLE_GRADIENT[r]} flex items-center justify-center text-sm shrink-0`}>
                {ROLE_EMOJI[r]}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-800 text-sm">{ROLE_LABELS[r]}</p>
                <p className="text-xs text-gray-400 truncate">{ROLE_DESC[r]}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        <p className="text-sm text-red-700">
          การลบผู้ใช้หรือเปลี่ยนบทบาทจะมีผลทันที การจัดการบัญชีนิสิต/อาจารย์เป็นหน้าที่ของเจ้าหน้าที่ภาควิชา (Admin) เท่านั้น
        </p>
      </div>
    </div>
  );
}
