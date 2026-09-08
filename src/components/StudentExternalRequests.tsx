"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { toUserErrorMessage, isValidEmail, isValidThaiPhone, formatDate, NAME_TITLES, NAME_TITLE_LABELS, formatUserName } from "@/lib/utils";
import { Section, Field, INPUT } from "@/components/SubmissionForms";
import { UserPlus, Clock, CheckCircle2, XCircle, Info } from "lucide-react";
import type { NameTitle } from "@/types";

const STATUS_STYLE: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  PENDING:  { label: "รอเจ้าหน้าที่อนุมัติ", cls: "bg-amber-50 text-amber-700 border-amber-200",  icon: <Clock className="w-3.5 h-3.5" /> },
  APPROVED: { label: "อนุมัติแล้ว",          cls: "bg-green-50 text-green-700 border-green-200",  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  REJECTED: { label: "ไม่อนุมัติ",            cls: "bg-red-50 text-red-700 border-red-200",        icon: <XCircle className="w-3.5 h-3.5" /> },
};

/** Student-facing tab on /student-dashboard for requesting a new กรรมการภายนอก (EXTERNAL)
 *  account — the self-service path when the committee editor's dropdown doesn't have the
 *  person they need yet. See "Committee accounts must pre-exist" in AGENTS.md. */
export function StudentExternalRequests() {
  const { user, externalRequests, submitExternalRequest } = useApp();
  const { showToast } = useToast();

  const mine = externalRequests.filter((r) => r.requestedById === user?.id);

  const [title, setTitle] = useState<NameTitle | "">("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim())  { setError("กรุณาระบุชื่อ-นามสกุล"); return; }
    if (!email.trim()) { setError("กรุณาระบุอีเมล"); return; }
    if (!isValidEmail(email)) { setError("รูปแบบอีเมลไม่ถูกต้อง"); return; }
    if (phone.trim() && !isValidThaiPhone(phone)) { setError("เบอร์โทรศัพท์ไม่ถูกต้อง (ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0)"); return; }

    setError(null);
    setSubmitting(true);
    try {
      await submitExternalRequest({
        title: title || null,
        name: name.trim(),
        email: email.trim(),
        affiliation: affiliation.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      showToast("ส่งคำขอแล้ว — รอเจ้าหน้าที่อนุมัติ", "info");
      setTitle(""); setName(""); setEmail(""); setAffiliation(""); setPhone("");
    } catch (err) {
      setError(toUserErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 bg-sky-50 border border-sky-200 rounded-2xl p-4">
        <Info className="w-5 h-5 text-sky-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-sky-900">ขอเพิ่มบัญชีกรรมการภายนอก</p>
          <p className="text-xs text-sky-700 mt-0.5">
            คำร้องขอสอบต้องเลือกกรรมการภายนอกจากรายชื่อที่มีบัญชีในระบบแล้วเท่านั้น
            หากไม่พบชื่อที่ต้องการ ให้ยื่นคำขอด้านล่างก่อน แล้วรอเจ้าหน้าที่ภาควิชาสร้างบัญชีให้
            เมื่ออนุมัติแล้วจึงจะสามารถเลือกชื่อนี้ในคำร้องขอสอบได้
          </p>
        </div>
      </div>

      <Section icon={<UserPlus className="w-4 h-4" />} title="ยื่นคำขอใหม่">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="คำนำหน้าชื่อ">
              <select value={title} onChange={(e) => setTitle(e.target.value as NameTitle | "")} className={INPUT}>
                <option value="">— ไม่มี —</option>
                {NAME_TITLES.map((t) => (
                  <option key={t} value={t}>{NAME_TITLE_LABELS[t]}</option>
                ))}
              </select>
            </Field>
            <Field label="ชื่อ-นามสกุล" required>
              <input value={name} onChange={(e) => { setName(e.target.value); setError(null); }} className={INPUT} placeholder="เช่น สมชาย ใจดี" />
            </Field>
            <Field label="อีเมล" required>
              <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} className={INPUT} placeholder="email@university.ac.th" />
            </Field>
            <Field label="สังกัด">
              <input value={affiliation} onChange={(e) => setAffiliation(e.target.value)} className={INPUT} placeholder="เช่น มหาวิทยาลัย..." />
            </Field>
            <Field label="เบอร์โทรศัพท์">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT} placeholder="0812345678" />
            </Field>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 text-white font-semibold rounded-xl transition shadow-sm text-sm disabled:opacity-50 bg-sky-600 hover:bg-sky-700"
          >
            {submitting ? "กำลังส่งคำขอ..." : "ส่งคำขอ"}
          </button>
        </form>
      </Section>

      {mine.length > 0 && (
        <Section icon={<Clock className="w-4 h-4" />} title="คำขอของท่าน">
          <div className="space-y-2">
            {mine.map((r) => {
              const s = STATUS_STYLE[r.status];
              return (
                <div key={r.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">{formatUserName(r)}</p>
                    <p className="text-xs text-gray-400 truncate">{r.email}{r.affiliation ? ` — ${r.affiliation}` : ""}</p>
                    {r.status === "REJECTED" && r.reviewNote && (
                      <p className="text-xs text-red-600 mt-0.5">เหตุผล: {r.reviewNote}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">ยื่นเมื่อ {formatDate(r.createdAt)}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${s.cls}`}>
                    {s.icon}{s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
