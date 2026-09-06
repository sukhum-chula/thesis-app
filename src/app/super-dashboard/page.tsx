"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { ROLE_LABELS, ROLE_GRADIENT, ROLE_EMOJI, ROLE_DESC } from "@/lib/utils";
import { ROLE_ROUTES } from "@/lib/roleRoutes";
import { DashboardHeader } from "@/components/DashboardHeader";
import { useToast } from "@/context/ToastContext";
import { Role, MockUser } from "@/types";
import {
  Crown,
  Trash2, Plus, X, AlertTriangle, KeyRound, Eye, EyeOff,
} from "lucide-react";

// SUPER_ADMIN's own remit: SUPER_ADMIN + ADMIN accounts only — everything else (STUDENT,
// PROFESSOR) is ADMIN's exclusive territory. See src/lib/accountScope.ts.
const MANAGEABLE_ROLES: Role[] = ["ADMIN", "SUPER_ADMIN"];
const ALL_ROLES: Role[] = ["SUPER_ADMIN", "ADMIN", "STUDENT", "PROFESSOR"];

interface SystemStats {
  users: { superAdmin: number; admin: number; professor: number; student: number; total: number };
  submissions: { total: number; inProgress: number; completed: number; rejected: number };
}

export default function SuperDashboardPage() {
  const {
    user, users,
    superAdminUpdateUserRole, superAdminDeleteUser, superAdminAddUser, superAdminChangePassword,
  } = useApp();
  const { showToast } = useToast();
  const router = useRouter();
  const isSuperAdmin = user?.roles.includes("SUPER_ADMIN") ?? false;

  useEffect(() => {
    if (user && !isSuperAdmin) router.replace(ROLE_ROUTES[user.role]);
  }, [user, isSuperAdmin, router]);

  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch("/api/super-admin/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => setStats(null));
  }, [isSuperAdmin]);

  const [confirmDelete,    setConfirmDelete]    = useState<string | null>(null);
  const [showAddForm,      setShowAddForm]       = useState(false);
  const [newName,          setNewName]           = useState("");
  const [newEmail,         setNewEmail]          = useState("");
  const [newRole,          setNewRole]           = useState<Role>("ADMIN");
  const [newPassword,      setNewPassword]       = useState("");
  const [newPwShow,        setNewPwShow]         = useState(false);
  const [newPwError,       setNewPwError]        = useState<string | null>(null);
  const [pwUserId,         setPwUserId]          = useState<string | null>(null);
  const [pwValue,          setPwValue]           = useState("");
  const [pwConfirm,        setPwConfirm]         = useState("");
  const [pwShow,           setPwShow]            = useState(false);
  const [pwLoading,        setPwLoading]         = useState(false);
  const [pwError,          setPwError]           = useState<string | null>(null);

  function openPasswordForm(uid: string) {
    setPwUserId(uid); setPwValue(""); setPwConfirm(""); setPwError(null); setPwShow(false);
  }
  function closePasswordForm() {
    setPwUserId(null); setPwValue(""); setPwConfirm(""); setPwError(null);
  }
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwValue.length < 6)           { setPwError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"); return; }
    if (pwValue !== pwConfirm)        { setPwError("รหัสผ่านไม่ตรงกัน"); return; }
    setPwLoading(true); setPwError(null);
    try {
      await superAdminChangePassword(pwUserId!, pwValue);
      showToast("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว ✓");
      closePasswordForm();
    } catch {
      setPwError("เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
    } finally {
      setPwLoading(false);
    }
  }

  if (!user || !isSuperAdmin) return null;

  function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) return;
    if (newPassword.length < 6) { setNewPwError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"); return; }
    setNewPwError(null);
    const userData: Omit<MockUser, "id"> = {
      name:  newName.trim(),
      email: newEmail.trim().toLowerCase(),
      role:  newRole,
      roles: [newRole],
      isProgramChair: false,
    };
    superAdminAddUser(userData, newPassword);
    setNewName(""); setNewEmail(""); setNewRole("ADMIN");
    setNewPassword(""); setNewPwShow(false); setNewPwError(null);
    setShowAddForm(false);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <DashboardHeader
        role="SUPER_ADMIN"
        name={user?.name ?? "ผู้ดูแลระบบสูงสุด"}
        title="ควบคุมระบบทั้งหมด"
        highlight={{ label: "ผู้ดูแลระบบ", value: users.length }}
        stats={[
          { label: "นิสิตทั้งหมด",          value: stats?.users.student ?? "…" },
          { label: "อาจารย์ทั้งหมด",        value: stats?.users.professor ?? "…" },
          { label: "คำร้องกำลังดำเนินการ", value: stats?.submissions.inProgress ?? "…" },
          { label: "คำร้องเสร็จสิ้น",       value: stats?.submissions.completed ?? "…" },
        ]}
      />
      <p className="text-xs text-gray-400 -mt-3">
        ตัวเลขสรุปในหัวข้อด้านบนสำหรับการกำกับดูแลเท่านั้น — การจัดการคำร้องเป็นหน้าที่ของเจ้าหน้าที่ภาควิชา (Admin) โดยเฉพาะ
      </p>

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
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน *</label>
                <input
                  required
                  type={newPwShow ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setNewPwError(null); }}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 pr-10 text-base focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                />
                <button
                  type="button"
                  onClick={() => setNewPwShow((v) => !v)}
                  className="absolute right-3 bottom-2.5 text-gray-400 hover:text-gray-600"
                >
                  {newPwShow ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {newPwError && <p className="text-sm text-red-600">{newPwError}</p>}
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

                {/* Change password */}
                <button
                  onClick={() => pwUserId === u.id ? closePasswordForm() : openPasswordForm(u.id)}
                  className={`p-2 rounded-lg transition shrink-0 ${
                    pwUserId === u.id
                      ? "text-amber-600 bg-amber-100"
                      : "text-gray-300 hover:text-amber-500 hover:bg-amber-50"
                  }`}
                  title="เปลี่ยนรหัสผ่าน"
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

              {/* Inline password form */}
              {pwUserId === u.id && (
                <form
                  onSubmit={handleChangePassword}
                  className="mx-5 mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3"
                >
                  <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4" />
                    ตั้งรหัสผ่านใหม่สำหรับ {u.name}
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="relative">
                      <input
                        type={pwShow ? "text" : "password"}
                        value={pwValue}
                        onChange={(e) => { setPwValue(e.target.value); setPwError(null); }}
                        placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)"
                        className="w-full border border-gray-300 rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      <button
                        type="button"
                        onClick={() => setPwShow((v) => !v)}
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                      >
                        {pwShow ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <input
                      type={pwShow ? "text" : "password"}
                      value={pwConfirm}
                      onChange={(e) => { setPwConfirm(e.target.value); setPwError(null); }}
                      placeholder="ยืนยันรหัสผ่าน"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  {pwError && <p className="text-sm text-red-600">{pwError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={pwLoading}
                      className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl disabled:opacity-60 transition"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      {pwLoading ? "กำลังบันทึก..." : "บันทึกรหัสผ่าน"}
                    </button>
                    <button
                      type="button"
                      onClick={closePasswordForm}
                      className="px-4 py-2 bg-white border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50 transition"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
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
