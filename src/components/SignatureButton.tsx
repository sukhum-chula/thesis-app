"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { CheckCircle2, XCircle, Loader2, Download, Pen } from "lucide-react";
import { FORM_LABELS, downloadFile, toUserErrorMessage } from "@/lib/utils";
import { UploadSlot } from "@/components/FileUploader";
import type { FormType } from "@/types";

interface ExtraSlot {
  slotKey: string;
  label: string;
  formType: string;
}

interface Props {
  submissionId: string;
  label?: string;
  onSuccess?: () => void;
  formsToShow?: string[];
  notePrefix?: string;
  requireNotePrefix?: boolean;
  extraSlots?: ExtraSlot[];
  hideDownloads?: boolean;
}

export function SignatureButton({ submissionId, label = "ส่งต่อ", onSuccess, formsToShow, notePrefix, requireNotePrefix, extraSlots, hideDownloads }: Props) {
  const { approveCurrentStep, rejectCurrentStep, submissions } = useApp();
  const { showToast } = useToast();
  const [notes,      setNotes]      = useState("");
  const [showReject, setShowReject] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Per-form upload state
  const [fileByForm,    setFileByForm]    = useState<Record<string, File | null>>({});
  const [uploadedForms, setUploadedForms] = useState<Set<string>>(new Set());

  const sub = submissions.find((s) => s.id === submissionId);

  // Upload targets: use all formsToShow directly (each uploads as its own formType).
  // Fall back to a single SIGNED slot only when formsToShow is empty and no extraSlots.
  const uploadTargets: string[] = [
    ...(formsToShow?.length ? formsToShow : (extraSlots?.length ? [] : ["SIGNED"])),
    ...(extraSlots ?? []).map((s) => s.slotKey),
  ];
  // Ready when every slot is either already uploaded or has a file selected
  const allFormsReady = uploadTargets.every((ft) => uploadedForms.has(ft) || !!fileByForm[ft]);

  async function handleApprove() {
    if (requireNotePrefix && !notePrefix) {
      setError("กรุณาเลือกผลการสอบวิทยานิพนธ์ก่อน");
      return;
    }
    if (!allFormsReady) {
      setError("กรุณาเลือกไฟล์ที่ลงนามแล้วให้ครบก่อน");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Upload any pending files first, then approve in one action
      for (const ft of uploadTargets) {
        if (!uploadedForms.has(ft) && fileByForm[ft]) {
          const actualFormType = extraSlots?.find((s) => s.slotKey === ft)?.formType ?? ft;
          const fd = new FormData();
          fd.append("file", fileByForm[ft]!);
          fd.append("submissionId", submissionId);
          fd.append("formType", actualFormType);
          const res = await fetch("/api/upload", { method: "POST", body: fd });
          if (!res.ok) throw new Error("upload failed");
          setUploadedForms((prev) => new Set([...prev, ft]));
        }
      }
      const combinedNotes = [notePrefix, notes].filter(Boolean).join("\n") || undefined;
      await approveCurrentStep(submissionId, combinedNotes);
      showToast("อัปโหลดและอนุมัติเรียบร้อยแล้ว ✓");
      onSuccess?.();
    } catch (err) {
      setError(toUserErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    if (!notes.trim()) { setError("กรุณาระบุเหตุผลในการปฏิเสธ"); return; }
    setLoading(true);
    setError(null);
    try {
      await rejectCurrentStep(submissionId, notes);
      showToast("บันทึกการปฏิเสธเรียบร้อยแล้ว", "error");
      onSuccess?.();
    } catch (err) {
      setError(toUserErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-5">
      <h3 className="text-lg font-semibold text-gray-800">ดำเนินการ</h3>

      {/* Step 1: Download forms to sign (hidden for steps where role uploads new files, not signed copies) */}
      {!hideDownloads && !showReject && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">
            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full mr-1.5">1</span>
            ดาวน์โหลดเอกสารเพื่อลงนาม
          </p>
          {(() => {
            const downloads = sub?.uploads
              ? (formsToShow?.length
                  ? sub.uploads.filter((u) => formsToShow.includes(u.formType))
                  : sub.uploads)
              : [];
            // Show only the latest version of each formType
            const latestByType = new Map<string, typeof downloads[0]>();
            for (const u of [...downloads].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())) {
              if (!latestByType.has(u.formType)) latestByType.set(u.formType, u);
            }
            const latestDownloads = [...latestByType.values()];
            return latestDownloads.length > 0 ? (
              <div className="space-y-2">
                {latestDownloads.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => downloadFile(u.id, u.fileName, FORM_LABELS[u.formType as FormType], sub?.title ?? "", u.fileUrl)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 border border-blue-200 rounded-xl hover:bg-blue-50 transition text-left"
                  >
                    <Download className="w-4 h-4 text-blue-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-700 truncate">{FORM_LABELS[u.formType as FormType] ?? u.formType}</p>
                      <p className="text-xs text-gray-400 truncate">{u.fileName}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-3 text-center">
                ยังไม่มีเอกสารแนบ — นิสิตยังไม่ได้อัปโหลดไฟล์
              </p>
            );
          })()}
        </div>
      )}

      {/* Sign reminder — shown between download and upload when downloads are visible */}
      {!hideDownloads && !showReject && (
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

      {/* Step 3 (or 1 when downloads hidden): Upload signed file(s) */}
      {!showReject && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">
            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full mr-1.5">
              {hideDownloads ? "1" : "3"}
            </span>
            อัปโหลดเอกสารที่ลงนามแล้ว <span className="text-red-500">*</span>
          </p>

          {uploadTargets.map((ft) => {
            const extraSlot = extraSlots?.find((s) => s.slotKey === ft);
            return (
              <UploadSlot
                key={ft}
                formType={extraSlot?.formType ?? ft}
                slotLabel={extraSlot?.label}
                selectedFile={fileByForm[ft] ?? null}
                onFileSelect={(f) => { setFileByForm((prev) => ({ ...prev, [ft]: f })); setError(null); }}
                done={uploadedForms.has(ft)}
                disabled={loading}
              />
            );
          })}
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block font-medium text-gray-700 mb-2">
          {showReject ? "เหตุผลในการปฏิเสธ *" : "หมายเหตุ (ไม่บังคับ)"}
        </label>
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setError(null); }}
          placeholder={showReject ? "ระบุเหตุผล..." : "หมายเหตุเพิ่มเติม..."}
          className="w-full border border-gray-200 rounded-xl p-3 text-base resize-none h-24 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3">
        {!showReject ? (
          <>
            <button
              onClick={handleApprove}
              disabled={loading || !allFormsReady}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-60 transition"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {loading ? "กำลังบันทึก..." : label}
            </button>
            <button
              onClick={() => setShowReject(true)}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 border-2 border-red-200 text-red-600 font-semibold rounded-xl hover:bg-red-50 disabled:opacity-60 transition"
            >
              <XCircle className="w-5 h-5" />
              ปฏิเสธ
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleReject}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 disabled:opacity-60 transition"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {loading ? "กำลังบันทึก..." : "ยืนยันการปฏิเสธ"}
            </button>
            <button
              onClick={() => { setShowReject(false); setError(null); }}
              disabled={loading}
              className="px-5 py-3.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 disabled:opacity-60 transition"
            >
              ยกเลิก
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
