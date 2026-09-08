"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { MockWorkflowStep } from "@/types";
import { CheckCircle2, XCircle, Clock, Loader2, Users, Download, Pen } from "lucide-react";
import { FORM_LABELS, FORM_SHORT, downloadFile, toUserErrorMessage, formatUserName } from "@/lib/utils";
import { UploadSlot } from "@/components/FileUploader";
import type { FormType } from "@/types";

interface Props {
  submissionId: string;
  step: MockWorkflowStep;
  onSuccess?: () => void;
  formsToShow?: string[];
  title?: string;
}

export function CommitteeSignPanel({ submissionId, step, onSuccess, formsToShow, title }: Props) {
  const { user, users, submissions, committeeSign } = useApp();
  const { showToast } = useToast();
  const [notes,      setNotes]      = useState("");
  const [showReject, setReject]     = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [signedFile, setSignedFile] = useState<File | null>(null);

  // When the step signs exactly one named form, version that slot; otherwise SIGNED
  const nonSignedForms = (formsToShow ?? []).filter((f) => f !== "SIGNED");
  const uploadFormType = nonSignedForms.length === 1 ? nonSignedForms[0] : "SIGNED";

  const sub     = submissions.find((s) => s.id === submissionId);
  const members = step.committeeMembers ?? [];
  const actions = step.committeeActions ?? [];
  const approvedCount = actions.filter((a) => a.decision === "APPROVED").length;
  const myAction  = actions.find((a) => a.userId === user?.id);
  const iAmMember = user ? members.includes(user.id) : false;
  const myIndex   = user ? members.indexOf(user.id) : -1;
  const prevMembers = myIndex > 0 ? members.slice(0, myIndex) : [];
  const isMyTurn  = prevMembers.every((mid) => actions.find((a) => a.userId === mid)?.decision === "APPROVED");

  async function act(decision: "APPROVED" | "REJECTED") {
    if (decision === "APPROVED" && !signedFile) {
      setError("กรุณาแนบเอกสารที่ลงนามแล้วก่อนอัปโหลด");
      return;
    }
    if (decision === "REJECTED" && !notes.trim()) {
      setError("กรุณาระบุเหตุผลในการไม่อนุมัติ");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (decision === "APPROVED" && signedFile) {
        const formData = new FormData();
        formData.append("file", signedFile);
        formData.append("submissionId", submissionId);
        formData.append("formType", uploadFormType);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) {
          setError("อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง");
          return;
        }
      }
      await committeeSign(submissionId, decision, notes || undefined);
      showToast(
        decision === "APPROVED" ? "อัปโหลดและลงนามเรียบร้อยแล้ว ✓" : "บันทึกการไม่อนุมัติแล้ว",
        decision === "APPROVED" ? "success" : "error"
      );
      onSuccess?.();
    } catch (err) {
      setError(toUserErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
      <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
        <Users className="w-5 h-5 text-blue-500" />
        {title ?? "คณะกรรมการสอบ"}
      </h3>

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${members.length ? (approvedCount / members.length) * 100 : 0}%` }}
          />
        </div>
        <span className="text-sm font-medium text-gray-600 shrink-0">
          ลงนาม {approvedCount}/{members.length}
        </span>
      </div>

      {/* Member roster — sequential order */}
      <ul className="space-y-2">
        {members.map((mid, idx) => {
          const m = users.find((u) => u.id === mid);
          const a = actions.find((x) => x.userId === mid);
          const prevDone = members.slice(0, idx).every((pid) => actions.find((x) => x.userId === pid)?.decision === "APPROVED");
          const isActive = !a && prevDone;
          return (
            <li key={mid} className="flex items-center gap-2.5 text-sm">
              <span className="text-xs font-bold text-gray-400 w-5 shrink-0 text-center">{idx + 1}</span>
              {a?.decision === "APPROVED" ? (
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              ) : a?.decision === "REJECTED" ? (
                <XCircle className="w-4 h-4 text-red-500 shrink-0" />
              ) : isActive ? (
                <Clock className="w-4 h-4 text-blue-400 shrink-0" />
              ) : (
                <Clock className="w-4 h-4 text-gray-200 shrink-0" />
              )}
              <span className={`flex-1 ${a ? "text-gray-700" : isActive ? "text-blue-700 font-medium" : "text-gray-300"}`}>
                {m ? formatUserName(m) : mid}
                {mid === user?.id && <span className="text-blue-500"> (ท่าน)</span>}
              </span>
              {a ? (
                <span className={`text-xs font-medium ${a.decision === "APPROVED" ? "text-green-600" : "text-red-500"}`}>
                  {a.decision === "APPROVED" ? "อัปโหลดแล้ว" : "ไม่อนุมัติ"}
                </span>
              ) : isActive ? (
                <span className="text-xs font-medium text-blue-500">● กำลังรอ</span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* This member's action area */}
      {!iAmMember ? (
        <p className="text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-3 text-center">
          ท่านไม่ได้เป็นกรรมการสอบของวิทยานิพนธ์นี้
        </p>
      ) : myAction ? (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${myAction.decision === "APPROVED" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {myAction.decision === "APPROVED"
            ? "✓ ท่านอัปโหลดแล้ว — รอกรรมการลำดับถัดไป"
            : "ท่านไม่อนุมัติวิทยานิพนธ์นี้"}
        </div>
      ) : !isMyTurn ? (
        (() => {
          const waitingId = prevMembers.find(
            (mid) => actions.find((a) => a.userId === mid)?.decision !== "APPROVED"
          );
          const waitingUser = users.find((u) => u.id === waitingId);
          const waitingName = waitingUser ? formatUserName(waitingUser) : undefined;
          return (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500 text-center">
              รอ{waitingName ? ` ${waitingName}` : `กรรมการลำดับที่ ${myIndex}`} ลงนามและอัปโหลดก่อน จึงจะถึงคิวของท่าน
            </div>
          );
        })()
      ) : (
        <div className="space-y-4 pt-1 border-t border-gray-100">

          {/* Step 1: Download */}
          {!showReject && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">
                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full mr-1.5">1</span>
                ดาวน์โหลดเอกสารเพื่อลงนาม
              </p>
              {sub?.uploads && sub.uploads.length > 0 ? (
                <div className="space-y-1.5">
                  {(() => {
                    const filtered = formsToShow?.length
                      ? sub.uploads.filter((u) => formsToShow.includes(u.formType))
                      : sub.uploads;
                    // Show latest version of each formType
                    const latestByType = new Map<string, typeof sub.uploads[0]>();
                    for (const u of [...filtered].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())) {
                      if (!latestByType.has(u.formType)) latestByType.set(u.formType, u);
                    }
                    return Array.from(latestByType.values()).map((u) => {
                      const label = FORM_SHORT[u.formType as FormType] ?? FORM_LABELS[u.formType as FormType] ?? u.formType;
                      const sublabel = FORM_LABELS[u.formType as FormType] ?? u.fileName;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => downloadFile(u.id, u.fileName, label, sub.title, u.fileUrl)}
                          className="w-full flex items-center gap-3 px-3 py-2 border border-blue-200 rounded-xl hover:bg-blue-50 transition text-left"
                        >
                          <Download className="w-4 h-4 text-blue-500 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-700 truncate">{label}</p>
                            <p className="text-xs text-gray-400 truncate">{sublabel}</p>
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>
              ) : (
                <p className="text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-3 text-center">
                  ยังไม่มีเอกสารแนบ — นิสิตยังไม่ได้อัปโหลดไฟล์
                </p>
              )}
            </div>
          )}

          {/* Sign reminder */}
          {!showReject && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <span className="bg-amber-100 text-amber-700 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5">2</span>
              <div>
                <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                  <Pen className="w-3.5 h-3.5 shrink-0" />
                  ลงนามในเอกสาร
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Upload signed file */}
          {!showReject && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">
                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full mr-1.5">3</span>
                อัปโหลดเอกสารที่ลงนามแล้ว <span className="text-red-500">*</span>
              </p>
              <UploadSlot
                formType={uploadFormType}
                selectedFile={signedFile}
                onFileSelect={(f) => { setSignedFile(f); setError(null); }}
                disabled={loading}
              />
            </div>
          )}

          <p className="text-sm font-medium text-gray-700">ความเห็นของท่าน</p>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setError(null); }}
            placeholder={showReject ? "เหตุผลในการไม่อนุมัติ *" : "หมายเหตุ (ไม่บังคับ)"}
            className="w-full border border-gray-200 rounded-xl p-3 text-base resize-none h-20 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            {!showReject ? (
              <>
                <button
                  onClick={() => act("APPROVED")}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-60 transition"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  {loading ? "กำลังบันทึก..." : "ส่งต่อ"}
                </button>
                <button
                  onClick={() => setReject(true)}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-red-200 text-red-600 font-semibold rounded-xl hover:bg-red-50 disabled:opacity-60 transition"
                >
                  <XCircle className="w-5 h-5" />
                  ไม่อนุมัติ
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => act("REJECTED")}
                  disabled={loading}
                  className="flex-1 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 disabled:opacity-60 transition"
                >
                  {loading ? "กำลังบันทึก..." : "ยืนยันไม่อนุมัติ"}
                </button>
                <button
                  onClick={() => { setReject(false); setError(null); }}
                  disabled={loading}
                  className="px-5 py-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition"
                >
                  ยกเลิก
                </button>
              </>
            )}
          </div>
          <p className="text-xs text-gray-400 text-center">
            กรรมการต้องลงนามตามลำดับ — แต่ละท่านต้องอัปโหลดก่อนจึงจะถึงคิวท่านถัดไป
          </p>
        </div>
      )}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
