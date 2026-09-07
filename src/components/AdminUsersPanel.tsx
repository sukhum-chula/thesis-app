"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { ROLE_LABELS, sortUsersByRole, generatePassword, isValidPasscode, toUserErrorMessage, formatDate } from "@/lib/utils";
import { DEMO_MODE } from "@/lib/config";
import { UserDetailPanel } from "@/components/UserDetailPanel";
import { UserProfileHeader } from "@/components/UserProfileHeader";
import { PasscodeField } from "@/components/PasscodeField";
import { Role } from "@/types";
import type { MockSubmission } from "@/types";
import {
  Users, RotateCcw,
  UserPlus, X, Loader2, Mail, UserCheck, ThumbsDown,
} from "lucide-react";

type PendingPerson = { name?: string; email?: string; role?: string };

interface PendingProfessorRequest {
  email: string;
  name: string;
  roles: Set<string>;
  submissions: MockSubmission[];
}

// Left accent border on each user's card — role at a glance without a second, redundant card
// wrapper around UserProfileHeader's own white card.
const ROLE_ACCENT: Record<Role, string> = {
  SUPER_ADMIN: "border-l-4 border-l-amber-400",
  ADMIN:       "border-l-4 border-l-orange-400",
  STUDENT:     "border-l-4 border-l-blue-400",
  PROFESSOR:   "border-l-4 border-l-purple-400",
  EXTERNAL:    "border-l-4 border-l-purple-400",
};

const DB_ROLES: Role[] = ["STUDENT", "PROFESSOR", "EXTERNAL", "ADMIN", "SUPER_ADMIN"];

const INPUT_CLS = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition placeholder:text-gray-300";

// Shared ADMIN account-management UI — embedded as a tab on /admin-dashboard and also
// rendered standalone at /dashboard/admin/users (still linked to directly, e.g. student
// names in the submission list deep-link to /dashboard/admin/users/[uid]). Callers are
// responsible for their own ADMIN-role guard before rendering this.
export function AdminUsersPanel() {
  const { submissions, users: allUsers, externalRequests, superAdminAddUser, rejectExternalRequest } = useApp();
  const { showToast } = useToast();
  const [confirmReset, setConfirmReset] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", email: "", role: "STUDENT" as Role, studentId: "",
    affiliation: "", phone: "", externalRequestId: undefined as string | undefined,
    passcode: generatePassword(),
  });
  const [saving, setSaving] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const pendingExternalRequests = externalRequests
    .filter((r) => r.status === "PENDING")
    .sort((a, b) => a.name.localeCompare(b.name));

  const creatableRoles = DB_ROLES.filter((r) => r !== "SUPER_ADMIN");

  // People named as committee on a DRAFT submission who don't have an account yet — grouped by
  // email (the same person may be named on multiple drafts, or in multiple roles). Shown as
  // cards at the top of the user list below, each a one-click shortcut into the same "เพิ่มผู้ใช้"
  // flow as any other new account, just prefilled — see openAddUserModal().
  const pendingRequestsByEmail = new Map<string, PendingProfessorRequest>();
  for (const s of submissions) {
    if (s.status !== "DRAFT" || !s.pendingPeople) continue;
    for (const p of s.pendingPeople as PendingPerson[]) {
      const email = p.email?.trim().toLowerCase();
      if (!email || allUsers.some((u) => u.email.toLowerCase() === email)) continue; // already resolved
      const existing = pendingRequestsByEmail.get(email);
      if (existing) {
        if (p.role) existing.roles.add(p.role);
        if (!existing.submissions.some((sub) => sub.id === s.id)) existing.submissions.push(s);
      } else {
        pendingRequestsByEmail.set(email, {
          email,
          name: p.name?.trim() ?? "",
          roles: new Set(p.role ? [p.role] : []),
          submissions: [s],
        });
      }
    }
  }
  const pendingRequests = [...pendingRequestsByEmail.values()].sort((a, b) => a.name.localeCompare(b.name));

  function closeModal() {
    setShowModal(false);
    setForm({ name: "", email: "", role: "STUDENT", studentId: "", affiliation: "", phone: "", externalRequestId: undefined, passcode: generatePassword() });
  }

  // Opens the same "เพิ่มผู้ใช้" modal used for any new account, prefilled from a pending
  // committee request — role defaults to PROFESSOR since every unresolved-email committee
  // person is one. Approving an ExternalCommitteeRequest instead prefills role EXTERNAL plus
  // its affiliation/phone and carries the request id through to POST /api/users.
  function openAddUserModal(prefill?: {
    name: string; email: string; role?: Role; affiliation?: string; phone?: string; externalRequestId?: string;
  }) {
    setForm(
      prefill
        ? {
            name: prefill.name, email: prefill.email, role: prefill.role ?? "PROFESSOR", studentId: "",
            affiliation: prefill.affiliation ?? "", phone: prefill.phone ?? "", externalRequestId: prefill.externalRequestId,
            passcode: generatePassword(),
          }
        : { name: "", email: "", role: "STUDENT", studentId: "", affiliation: "", phone: "", externalRequestId: undefined, passcode: generatePassword() }
    );
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidPasscode(form.passcode)) {
      showToast("รหัสเข้าใช้งานต้องมีความยาว 6-72 ตัวอักษร และไม่มีช่องว่าง", "error");
      return;
    }
    setSaving(true);
    try {
      await superAdminAddUser({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        roles: [form.role],
        studentId: form.role === "STUDENT" && form.studentId.trim() ? form.studentId.trim() : undefined,
        affiliation: form.role === "EXTERNAL" && form.affiliation.trim() ? form.affiliation.trim() : undefined,
        phone: form.role === "EXTERNAL" && form.phone.trim() ? form.phone.trim() : undefined,
        externalRequestId: form.externalRequestId,
        passcode: form.passcode.trim(),
      });
      showToast("เพิ่มผู้ใช้สำเร็จ — ระบบส่งรหัสเข้าใช้งานไปยังอีเมลของผู้ใช้แล้ว", "success");
      closeModal();
    } catch (err: any) {
      showToast(err.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject(id: string) {
    setRejecting(true);
    try {
      await rejectExternalRequest(id, rejectNote.trim() || undefined);
      showToast("ปฏิเสธคำขอแล้ว", "info");
      setRejectingId(null);
      setRejectNote("");
    } catch (err) {
      showToast(toUserErrorMessage(err), "error");
    } finally {
      setRejecting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users className="w-7 h-7 text-gray-600" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">ผู้ใช้งานในระบบ</h1>
          <p className="text-gray-500 mt-0.5">คลิกที่ผู้ใช้เพื่อดูรายละเอียดและคำร้องที่เกี่ยวข้อง</p>
        </div>
        <button
          onClick={() => openAddUserModal()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          เพิ่มผู้ใช้
        </button>
      </div>

      <div className="space-y-3">
        {/* Committee people named on a DRAFT submission with no account yet — one click each,
            straight into the same "เพิ่มผู้ใช้" flow as any other new account, prefilled. */}
        {pendingRequests.map((req) => (
          <div key={req.email} className="flex items-center gap-4 p-5 rounded-2xl border-2 border-amber-300 bg-amber-50">
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
              <UserPlus className="w-5 h-5 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-amber-900 text-lg">{req.name || "(ไม่ระบุชื่อ)"}</p>
                <span className="text-xs font-semibold text-amber-700 bg-white px-2 py-0.5 rounded-full border border-amber-200">
                  ยังไม่มีบัญชี
                </span>
              </div>
              <p className="text-amber-700 text-sm mt-0.5 flex items-center gap-1.5 truncate">
                <Mail className="w-3.5 h-3.5 shrink-0" />{req.email}
              </p>
              <p className="text-amber-600 text-xs mt-1">
                {[...req.roles].map((r) => ROLE_LABELS[r] ?? r).join(", ")} — {req.submissions.length} คำร้องรออยู่
              </p>
            </div>
            <button
              onClick={() => openAddUserModal({ name: req.name, email: req.email })}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 transition shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              เพิ่มผู้ใช้
            </button>
          </div>
        ))}

        {/* Students' standalone requests for a new กรรมการภายนอก (EXTERNAL) account — see the
            "กรรมการภายนอก" tab on /student-dashboard. Approve opens the same "เพิ่มผู้ใช้" modal,
            prefilled, with the request id carried through so POST /api/users can link the two. */}
        {pendingExternalRequests.map((req) => (
          <div key={req.id} className="p-5 rounded-2xl border-2 border-sky-300 bg-sky-50 space-y-3">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                <UserCheck className="w-5 h-5 text-sky-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sky-900 text-lg">{req.name}</p>
                  <span className="text-xs font-semibold text-sky-700 bg-white px-2 py-0.5 rounded-full border border-sky-200">
                    คำขอกรรมการภายนอกใหม่
                  </span>
                </div>
                <p className="text-sky-700 text-sm mt-0.5 flex items-center gap-1.5 truncate">
                  <Mail className="w-3.5 h-3.5 shrink-0" />{req.email}
                  {req.affiliation ? ` — ${req.affiliation}` : ""}
                </p>
                <p className="text-sky-600 text-xs mt-1">ยื่นเมื่อ {formatDate(req.createdAt)}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => openAddUserModal({
                    name: req.name, email: req.email, role: "EXTERNAL",
                    affiliation: req.affiliation ?? undefined, phone: req.phone ?? undefined,
                    externalRequestId: req.id,
                  })}
                  className="flex items-center gap-2 px-4 py-2.5 bg-sky-500 text-white text-sm font-semibold rounded-xl hover:bg-sky-600 transition"
                >
                  <UserPlus className="w-4 h-4" />
                  อนุมัติ
                </button>
                <button
                  onClick={() => setRejectingId(rejectingId === req.id ? null : req.id)}
                  className="flex items-center gap-2 px-4 py-2.5 border border-sky-300 text-sky-700 text-sm font-semibold rounded-xl hover:bg-sky-100 transition"
                >
                  <ThumbsDown className="w-4 h-4" />
                  ปฏิเสธ
                </button>
              </div>
            </div>
            {rejectingId === req.id && (
              <div className="flex items-center gap-2 pt-1 border-t border-sky-200">
                <input
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="เหตุผล (ถ้ามี)"
                  className="flex-1 border border-sky-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
                <button
                  onClick={() => handleReject(req.id)}
                  disabled={rejecting}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 transition"
                >
                  ยืนยันปฏิเสธ
                </button>
                <button
                  onClick={() => { setRejectingId(null); setRejectNote(""); }}
                  className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 transition"
                >
                  ยกเลิก
                </button>
              </div>
            )}
          </div>
        ))}

        {sortUsersByRole(allUsers).map((u) => {
          const isExpanded = expandedId === u.id;
          return (
            <div key={u.id} className="space-y-2">
              {/* Identity + edit/reset-passcode/delete — always visible; clicking the 3 quick
                  stats toggles the related-submissions panel below */}
              <UserProfileHeader
                uid={u.id}
                onDeleted={() => setExpandedId(null)}
                expanded={isExpanded}
                onToggleExpand={() => setExpandedId(isExpanded ? null : u.id)}
                accent={ROLE_ACCENT[u.role]}
              />

              {isExpanded && <UserDetailPanel uid={u.id} />}
            </div>
          );
        })}
      </div>

      {/* Demo tools */}
      {DEMO_MODE && (
        <div className="bg-white rounded-2xl border border-amber-200 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-amber-600" />
            <h2 className="font-semibold text-amber-700">เครื่องมือสำหรับสาธิต</h2>
          </div>
          <p className="text-sm text-gray-500">
            รีเซ็ตข้อมูลทั้งหมดกลับสู่ค่าเริ่มต้น — ใช้ก่อนเริ่มสาธิตระบบ (ลบคำร้องและการแจ้งเตือนที่สร้างระหว่างทดสอบ)
          </p>
          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              className="flex items-center justify-center gap-2 w-full py-2.5 border-2 border-amber-200 text-amber-700 font-medium rounded-xl hover:bg-amber-50 transition"
            >
              <RotateCcw className="w-4 h-4" />
              รีเซ็ตข้อมูลทดสอบ
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-amber-700 font-medium text-center">ยืนยันการรีเซ็ต? ข้อมูลที่สร้างไว้จะหายทั้งหมด</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setConfirmReset(false); showToast("ฟีเจอร์นี้ไม่รองรับในโหมดฐานข้อมูลจริง", "error"); }}
                  className="flex-1 py-2.5 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 transition"
                >
                  ยืนยันรีเซ็ต
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add User modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">เพิ่มผู้ใช้งาน</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField label="ชื่อ-นามสกุล *">
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="เช่น สมชาย ใจดี"
                  className={INPUT_CLS}
                />
              </FormField>

              <FormField label="อีเมล *">
                <input
                  type="email"
                  required
                  disabled={!!form.externalRequestId}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="example@eng.chula.ac.th"
                  className={INPUT_CLS + " disabled:opacity-60"}
                />
                {form.externalRequestId && (
                  <p className="text-xs text-gray-400 mt-1">ล็อกตามคำขอที่เลือกอนุมัติ</p>
                )}
              </FormField>

              <FormField label="บทบาท *">
                <select
                  value={form.role}
                  disabled={!!form.externalRequestId}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role, studentId: "" })}
                  className={INPUT_CLS + " disabled:opacity-60"}
                >
                  {creatableRoles.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </FormField>

              {form.role === "STUDENT" && (
                <FormField label="รหัสนิสิต">
                  <input
                    type="text"
                    value={form.studentId}
                    onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                    placeholder="เช่น 6570123456"
                    className={INPUT_CLS}
                  />
                </FormField>
              )}

              {form.role === "EXTERNAL" && (
                <>
                  <FormField label="สังกัด">
                    <input
                      type="text"
                      value={form.affiliation}
                      onChange={(e) => setForm({ ...form, affiliation: e.target.value })}
                      placeholder="เช่น มหาวิทยาลัย..."
                      className={INPUT_CLS}
                    />
                  </FormField>
                  <FormField label="เบอร์โทรศัพท์">
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="0812345678"
                      className={INPUT_CLS}
                    />
                  </FormField>
                </>
              )}

              <PasscodeField
                value={form.passcode}
                onChange={(passcode) => setForm({ ...form, passcode })}
              />

              <p className="text-xs text-gray-400">ระบบจะส่งรหัสเข้าใช้งานนี้ไปยังอีเมลของผู้ใช้โดยอัตโนมัติ</p>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
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
                  {saving ? "กำลังบันทึก..." : "เพิ่มผู้ใช้"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
