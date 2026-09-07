"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { ROLE_LABELS, ROLE_DESC, generatePassword, isValidPasscode, getRelatedSubmissions } from "@/lib/utils";
import { canManageAccount } from "@/lib/accountScope";
import { PasscodeField } from "@/components/PasscodeField";
import { Pencil, X, Loader2, Trash2, KeyRound, ChevronDown } from "lucide-react";

const INPUT_CLS = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition placeholder:text-gray-300";

// Identity + account-management actions for one user (name/email/studentId, role badge, edit /
// reset-passcode / delete) — extracted from UserDetailPanel so it renders directly on each row of
// AdminUsersPanel's user list (no need to expand a card first), and is also reused as-is by the
// standalone /dashboard/admin/users/[uid] deep-link page.
//
// `expanded`/`onToggleExpand` are optional: when passed (AdminUsersPanel's list), the quick-stats
// become the click target that expands/collapses the related-submissions panel below — there is
// no separate "ดูคำร้องที่เกี่ยวข้อง" button any more. Omitted on the standalone profile page, where
// the stats are just a static readout. `accent` is an optional whole Tailwind class string (e.g.
// a role-colored left border) applied to the outer card — AdminUsersPanel's list uses it in place
// of wrapping this card in a second, redundant colored card.
export function UserProfileHeader({
  uid, onDeleted, expanded, onToggleExpand, accent,
}: {
  uid: string;
  onDeleted?: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  accent?: string;
}) {
  const { user: viewer, users, submissions, adminUpdateUserInfo, superAdminDeleteUser, superAdminResetPasscode } = useApp();
  const { showToast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editStudentId, setEditStudentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwPasscode, setPwPasscode] = useState(generatePassword());

  const user = users.find((u) => u.id === uid);

  // See src/lib/accountScope.ts for the SUPER_ADMIN/ADMIN account-management tiers
  const canManageTarget = !!viewer && !!user && canManageAccount(viewer.roles, user.roles);

  if (!viewer || !user) {
    return <p className="text-center py-10 text-gray-400">ไม่พบผู้ใช้งาน</p>;
  }

  const related   = getRelatedSubmissions(submissions, uid, user.roles);
  const inProg    = related.filter((s) => s.status === "IN_PROGRESS").length;
  const completed = related.filter((s) => s.status === "COMPLETED").length;
  const rejected  = related.filter((s) => s.status === "REJECTED").length;

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

  function openResetPasscode() {
    setPwPasscode(generatePassword());
    setPwOpen(true);
  }

  async function handleResetPasscode() {
    if (!isValidPasscode(pwPasscode)) {
      showToast("รหัสเข้าใช้งานต้องมีความยาว 6-72 ตัวอักษร และไม่มีช่องว่าง", "error");
      return;
    }
    setPwSaving(true);
    try {
      await superAdminResetPasscode(uid, pwPasscode.trim());
      showToast("ออกรหัสเข้าใช้งานใหม่และส่งอีเมลแจ้งผู้ใช้งานแล้ว", "success");
      setPwOpen(false);
    } catch (err: any) {
      showToast(err.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่", "error");
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className={`bg-white rounded-2xl border border-gray-200 px-6 pt-6 pb-3 space-y-4 ${accent ?? ""}`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-stretch gap-4">
        {/* Avatar + identity — grows to fill remaining space */}
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center shrink-0">
            <span className="text-2xl font-bold text-blue-600">
              {user.name.charAt(0)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 leading-snug">{user.name}</h1>
              <span className="text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
                {user.roles.map((r) => ROLE_LABELS[r]).join(" / ")}
              </span>
            </div>
            <p className="text-gray-500 mt-0.5">{user.email}</p>
            {user.studentId && (
              <p className="text-sm text-gray-400 mt-0.5">รหัสนักศึกษา: {user.studentId}</p>
            )}
            <p className="text-gray-400 text-xs mt-1">{ROLE_DESC[user.role]}</p>
          </div>
        </div>

        {/* Submission status counts — right-aligned, right before the button stack; with the
            row's items-stretch, this box automatically matches the 3-button stack's height
            (buttons + their gaps), no manual height math needed */}
        {onToggleExpand ? (
          <button
            type="button"
            onClick={onToggleExpand}
            title="ดูคำร้องที่เกี่ยวข้อง"
            className="hidden md:flex items-center justify-center gap-10 shrink-0 px-8 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition"
          >
            <CompactStat value={inProg}    label="กำลังดำเนินการ" color="text-blue-700" />
            <CompactStat value={completed} label="เสร็จสิ้น"       color="text-green-700" />
            <CompactStat value={rejected}  label="ถูกปฏิเสธ"      color="text-red-500" />
            <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        ) : (
          <div className="hidden md:flex items-center justify-center gap-10 shrink-0 px-8 rounded-2xl border border-gray-100 bg-gray-50">
            <CompactStat value={inProg}    label="กำลังดำเนินการ" color="text-blue-700" />
            <CompactStat value={completed} label="เสร็จสิ้น"       color="text-green-700" />
            <CompactStat value={rejected}  label="ถูกปฏิเสธ"      color="text-red-500" />
          </div>
        )}

        {/* Account-management buttons */}
        {canManageTarget && (
          <div className="flex flex-col items-end justify-center gap-2 shrink-0">
            <button
              onClick={openEdit}
              className="w-40 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition"
              title="แก้ไขชื่อ / รหัสนิสิต"
            >
              <Pencil className="w-4 h-4" />
              แก้ไข
            </button>
            <button
              onClick={openResetPasscode}
              className="w-40 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition"
              title="รีเซ็ตรหัสเข้าใช้งาน"
            >
              <KeyRound className="w-4 h-4" />
              รหัสเข้าใช้งาน
            </button>
            {/* Always occupies its slot (even for your own account, where you can't delete
                yourself) so every card's button stack — and the stats box stretched to match
                it — stays the same height. */}
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={viewer.id === user.id}
              tabIndex={viewer.id === user.id ? -1 : 0}
              className={`w-40 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition ${viewer.id === user.id ? "invisible" : ""}`}
              title="ลบผู้ใช้งาน"
            >
              <Trash2 className="w-4 h-4" />
              ลบ
            </button>
          </div>
        )}
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

      {/* Quick stats — compact row, mobile-only fallback for the one docked between name and buttons */}
      {onToggleExpand ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex md:hidden items-center justify-center gap-6 pt-3 pb-1 border-t border-gray-100 w-full rounded-xl hover:bg-gray-50 transition"
        >
          <CompactStat value={inProg}    label="กำลังดำเนินการ" color="text-blue-700" />
          <CompactStat value={completed} label="เสร็จสิ้น"       color="text-green-700" />
          <CompactStat value={rejected}  label="ถูกปฏิเสธ"      color="text-red-500" />
          <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      ) : (
        <div className="flex md:hidden items-center justify-center gap-6 pt-3 border-t border-gray-100">
          <CompactStat value={inProg}    label="กำลังดำเนินการ" color="text-blue-700" />
          <CompactStat value={completed} label="เสร็จสิ้น"       color="text-green-700" />
          <CompactStat value={rejected}  label="ถูกปฏิเสธ"      color="text-red-500" />
        </div>
      )}

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
              กำหนดรหัสเข้าใช้งานใหม่ให้ <strong>{user.email}</strong> เอง หรือกดสุ่มรหัส — ระบบจะส่งอีเมลแจ้งรหัสนี้
              โดยอัตโนมัติ รหัสเดิมจะใช้งานไม่ได้อีกต่อไป
            </p>

            <PasscodeField value={pwPasscode} onChange={setPwPasscode} />

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

function CompactStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 leading-none">
      <p className={`text-4xl font-bold ${color}`}>{value}</p>
      <p className="text-sm text-gray-500 whitespace-nowrap">{label}</p>
    </div>
  );
}
