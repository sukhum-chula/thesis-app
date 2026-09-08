"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { ROLE_ROUTES } from "@/lib/roleRoutes";
import { ROLE_LABELS, toUserErrorMessage, formatDate, generatePassword, isValidPasscode, NAME_TITLES, NAME_TITLE_LABELS, formatUserName } from "@/lib/utils";
import { PasscodeField } from "@/components/PasscodeField";
import { ArrowLeft, UserPlus, Mail, Phone, ChevronRight, CheckCircle2 } from "lucide-react";
import type { MockSubmission, NameTitle } from "@/types";

const INPUT_CLS = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition";

type PendingPerson = { name?: string; email?: string; role?: string; phone?: string };

interface PendingRequest {
  email: string;
  name: string;
  phone: string;
  roles: Set<string>;
  submissions: MockSubmission[];
}

export default function PendingProfessorsPage() {
  const { user, submissions, users, superAdminAddUser } = useApp();
  const { showToast } = useToast();
  const router = useRouter();
  const isAdmin = user?.roles.includes("ADMIN") ?? false;

  const [openEmail, setOpenEmail] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", name: "", phone: "", passcode: generatePassword() });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user && !isAdmin) router.replace(ROLE_ROUTES[user.role]);
  }, [user, isAdmin, router]);

  if (!user || !isAdmin) return null;

  // Build one request per distinct pending email across all DRAFT submissions
  const requestsByEmail = new Map<string, PendingRequest>();
  for (const sub of submissions) {
    if (sub.status !== "DRAFT" || !sub.pendingPeople) continue;
    for (const p of sub.pendingPeople as PendingPerson[]) {
      const email = p.email?.trim().toLowerCase();
      if (!email) continue;
      if (users.some((u) => u.email.toLowerCase() === email)) continue; // already resolved
      const existing = requestsByEmail.get(email);
      if (existing) {
        if (p.role) existing.roles.add(p.role);
        if (!existing.submissions.some((s) => s.id === sub.id)) existing.submissions.push(sub);
      } else {
        requestsByEmail.set(email, {
          email,
          name: p.name?.trim() ?? "",
          phone: p.phone?.trim() ?? "",
          roles: new Set(p.role ? [p.role] : []),
          submissions: [sub],
        });
      }
    }
  }
  const requests = [...requestsByEmail.values()].sort((a, b) => a.name.localeCompare(b.name));

  function openForm(req: PendingRequest) {
    setOpenEmail(req.email);
    setForm({ title: "", name: req.name, phone: req.phone, passcode: generatePassword() });
  }

  async function handleCreate(req: PendingRequest) {
    if (!form.name.trim()) { showToast("กรุณากรอกชื่อ-นามสกุล", "error"); return; }
    if (!isValidPasscode(form.passcode)) {
      showToast("รหัสเข้าใช้งานต้องมีความยาว 6-72 ตัวอักษร และไม่มีช่องว่าง", "error");
      return;
    }
    setSaving(true);
    try {
      // Same route as the regular "เพิ่มผู้ใช้" flow — the server notifies any student whose
      // draft this email was blocking, regardless of which screen created the account.
      await superAdminAddUser({
        title: (form.title || null) as NameTitle | null,
        name: form.name.trim(),
        email: req.email,
        role: "PROFESSOR",
        roles: ["PROFESSOR"],
        passcode: form.passcode.trim(),
      });
      showToast(`สร้างบัญชีให้ ${form.name.trim()} แล้ว`, "success");
      setOpenEmail(null);
    } catch (err) {
      showToast(toUserErrorMessage(err, "สร้างบัญชีไม่สำเร็จ"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin-dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-2 -my-2">
        <ArrowLeft className="w-4 h-4" />
        ย้อนกลับ
      </Link>

      <div>
        <h1 className="text-xl font-bold text-gray-900">รอสร้างบัญชีให้อาจารย์/กรรมการ</h1>
        <p className="text-sm text-gray-500 mt-1">
          นิสิตระบุบุคคลเหล่านี้เป็นกรรมการ แต่ยังไม่มีบัญชีในระบบ — คำร้องที่เกี่ยวข้องจะเป็นฉบับร่างจนกว่าจะสร้างบัญชีให้ครบ
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center text-gray-400">
          <CheckCircle2 className="w-10 h-10 mx-auto opacity-25 mb-2" />
          <p>ไม่มีคำขอที่รอดำเนินการ</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.email} className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
              <div className="p-4 sm:p-5 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{req.name || "(ไม่ระบุชื่อ)"}</p>
                    <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-0.5">
                      <Mail className="w-3.5 h-3.5 shrink-0" />{req.email}
                    </p>
                    {req.phone && (
                      <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-0.5">
                        <Phone className="w-3.5 h-3.5 shrink-0" />{req.phone}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {[...req.roles].map((r) => (
                        <span key={r} className="text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                          {ROLE_LABELS[r] ?? r}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => (openEmail === req.email ? setOpenEmail(null) : openForm(req))}
                    className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 transition shrink-0"
                  >
                    <UserPlus className="w-4 h-4" />
                    สร้างบัญชี
                  </button>
                </div>

                <div className="space-y-1.5 pt-1 border-t border-gray-100">
                  <p className="text-xs text-gray-400 pt-2">คำร้องที่รอ:</p>
                  {req.submissions.map((s) => {
                    const student = users.find((u) => u.id === s.studentId);
                    return (
                      <Link
                        key={s.id}
                        href={`/dashboard/admin/${s.id}`}
                        className="flex items-center gap-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-xl px-3 py-2 transition"
                      >
                        <span className="flex-1 min-w-0 truncate text-gray-700">{s.title}</span>
                        <span className="text-gray-400 text-xs shrink-0">{student ? formatUserName(student) : "—"} · {formatDate(s.createdAt)}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                      </Link>
                    );
                  })}
                </div>

                {openEmail === req.email && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">คำนำหน้าชื่อ</label>
                        <select value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={INPUT_CLS}>
                          <option value="">— ไม่มี —</option>
                          {NAME_TITLES.map((t) => (
                            <option key={t} value={t}>{NAME_TITLE_LABELS[t]}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อ-นามสกุล</label>
                        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={INPUT_CLS} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">เบอร์โทรศัพท์ (ถ้ามี)</label>
                        <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={INPUT_CLS} />
                      </div>
                    </div>
                    <PasscodeField value={form.passcode} onChange={(passcode) => setForm((f) => ({ ...f, passcode }))} />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCreate(req)}
                        disabled={saving}
                        className="flex-1 py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 disabled:opacity-50 transition"
                      >
                        {saving ? "กำลังสร้าง..." : "ยืนยันสร้างบัญชี"}
                      </button>
                      <button
                        onClick={() => setOpenEmail(null)}
                        disabled={saving}
                        className="px-4 py-2.5 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 transition"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
