"use client";

import { useState, useRef } from "react";
import { FormType } from "@/types";
import { FORM_LABELS, FORM_SHORT, formatBytes, formatDate, cn, formFileKind, FORM_FILE_ACCEPT, FORM_FILE_KIND_LABEL, checkFormFile, downloadFile, previewFile } from "@/lib/utils";
import { Upload, FileText, CheckCircle2, Loader2, X, Download, XCircle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import type { MockUpload } from "@/types";

interface Props {
  submissionId: string;
  formType: FormType;
  existingUpload?: MockUpload | null;
  onSuccess?: () => void;
  /** replaces the form's description in the slot header, e.g. the committee member a บ.3 belongs to */
  slotLabel?: string;
  // Picker mode — parent owns the file, no upload button
  selectedFile?: File | null;
  onFileSelect?: (file: File | null) => void;
}

// ─── Shared action-card building blocks ─────────────────────────────────────
// Every "it's your turn" card — student upload, single signer, committee signer, admin — is built
// from these, so the parts look and read the same whichever role and step is acting:
// ① download → ② sign/fill → ③ upload → ④ checklist → ⑤ notes → one green ✓ button.

/** Frame of an action card (the card a user acts in when it's their turn). */
export const ACTION_CARD = "bg-white border-2 border-blue-300 rounded-2xl p-5 shadow-sm space-y-5";
/** The card's one primary button (ส่งต่อ / อนุมัติ). */
export const PRIMARY_BUTTON = "w-full flex items-center justify-center gap-2 py-3.5 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition";
/** The reject (ปฏิเสธ) button next to the primary one. */
export const REJECT_BUTTON = "flex-1 flex items-center justify-center gap-2 py-3.5 border-2 border-red-200 text-red-600 font-semibold rounded-xl hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed transition";

/** Numbered section heading inside an action card. */
export function SectionLabel({ n, children, required }: { n: number; children: React.ReactNode; required?: boolean }) {
  return (
    <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
      <span className="bg-blue-100 text-blue-700 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0">{n}</span>
      {children}
      {required && <span className="text-red-500">*</span>}
    </p>
  );
}

/** One file to download: the form's Thai name, then file name · upload date. */
export function DownloadRow({ upload, submissionTitle, title }: {
  upload: MockUpload; submissionTitle: string; title?: string;
}) {
  const label = FORM_LABELS[upload.formType as FormType] ?? upload.formType;
  return (
    <button
      type="button"
      onClick={() => downloadFile(upload.id, upload.fileName, label, submissionTitle, upload.fileUrl)}
      className="w-full flex items-center gap-3 px-3 py-2.5 bg-white border border-blue-200 rounded-xl hover:bg-blue-50 transition text-left"
    >
      <Download className="w-4 h-4 text-blue-500 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-700 truncate">{title ?? label}</p>
        <p className="text-xs text-gray-400 truncate">{upload.fileName} · {formatDate(upload.uploadedAt)}</p>
      </div>
    </button>
  );
}

/** Shown in the download section when the step has nothing to download yet. */
export function NoDownloads() {
  return (
    <p className="text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-3 text-center">
      ยังไม่มีเอกสารในระบบสำหรับขั้นตอนนี้ — กรุณาติดต่อเจ้าหน้าที่
    </p>
  );
}

/** The card's notes box — optional on approve, required (red) on reject. */
export function NotesField({ value, onChange, reject = false }: {
  value: string; onChange: (v: string) => void; reject?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {reject ? <>เหตุผลในการปฏิเสธ <span className="text-red-500">*</span></> : "หมายเหตุ (ไม่บังคับ)"}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={reject ? "ระบุเหตุผล..." : "หมายเหตุเพิ่มเติม..."}
        className={cn(
          "w-full border rounded-xl p-3 text-base resize-none h-20 focus:outline-none focus:ring-2",
          reject ? "border-red-300 focus:ring-red-400" : "border-gray-200 focus:ring-blue-400"
        )}
      />
    </div>
  );
}

/** Inline error box — errors stay on the card rather than in a toast that disappears. */
export function ActionError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
      <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
      <p className="text-sm text-red-700">{message}</p>
    </div>
  );
}

/** Uploads one file; throws the server's own (Thai) error message on failure. */
export async function postUpload(submissionId: string, formType: string, file: File, memberId?: string) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("submissionId", submissionId);
  fd.append("formType", formType);
  if (memberId) fd.append("memberId", memberId);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง");
  }
}

/** Slot header: form code badge + description + status chip — same identity in every state */
export function SlotHeader({ formType, status, desc: descOverride }: { formType: string; status: "done" | "picked" | "empty"; desc?: string }) {
  const full  = FORM_LABELS[formType as FormType] ?? formType;
  const short = FORM_SHORT[formType as FormType] ?? formType;
  const desc  = descOverride ?? (full.includes(" — ") ? full.split(" — ")[1] : (full === short ? "" : full));
  const chip =
    status === "done"   ? { text: "✓ อัปโหลดแล้ว", cls: "bg-green-100 text-green-700" } :
    status === "picked" ? { text: "✓ เลือกไฟล์แล้ว", cls: "bg-blue-100 text-blue-700" } :
                          { text: "ยังไม่ได้เลือกไฟล์", cls: "bg-gray-100 text-gray-500" };
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-xs font-bold text-blue-800 bg-blue-50 border border-blue-200 rounded-md px-2 py-0.5">
        {short}
      </span>
      {desc && <span className="text-xs text-gray-500 truncate flex-1">{desc}</span>}
      <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${chip.cls}`}>{chip.text}</span>
    </div>
  );
}

/**
 * Shared picker slot — the ONE upload design for every role (student, admin,
 * signing professors, committee). Parent owns the selected file; the actual
 * upload happens in the parent's submit action.
 */
export function UploadSlot({
  formType,
  slotLabel,
  selectedFile,
  onFileSelect,
  done = false,
  doneLabel = "อัปโหลดสำเร็จแล้ว",
  disabled = false,
}: {
  formType: string;
  slotLabel?: string;
  selectedFile: File | null;
  onFileSelect: (f: File | null) => void;
  done?: boolean;
  doneLabel?: string;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    if (f) {
      const err = checkFormFile(formType, f);
      if (err) { setError(err); return; }
    }
    onFileSelect(f);
  }

  if (done) {
    return (
      <div className="border-2 border-green-200 rounded-xl p-4 space-y-3 bg-green-50">
        <SlotHeader formType={formType} status="done" desc={slotLabel} />
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
          <p className="text-sm font-medium text-green-800">{doneLabel}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "border-2 rounded-xl p-4 space-y-3 bg-white",
      selectedFile ? "border-blue-300" : "border-dashed border-gray-300"
    )}>
      <SlotHeader formType={formType} status={selectedFile ? "picked" : "empty"} desc={slotLabel} />

      <div
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center gap-2 py-5 rounded-lg transition",
          disabled ? "bg-gray-50 cursor-wait" : "cursor-pointer hover:bg-gray-50"
        )}
      >
        {selectedFile ? (
          <FileText className="w-7 h-7 text-blue-400" />
        ) : (
          <Upload className="w-7 h-7 text-gray-300" />
        )}
        <span className="text-xs text-gray-500 text-center px-2">
          {selectedFile
            ? `${selectedFile.name} (${formatBytes(selectedFile.size)})`
            : `คลิกเพื่อเลือกไฟล์ ${FORM_FILE_KIND_LABEL[formFileKind(formType)]} (สูงสุด 20 MB)`}
        </span>
      </div>

      {selectedFile && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFileSelect(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          className="w-full py-1.5 rounded-lg border border-gray-200 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition flex items-center justify-center gap-1"
        >
          <X className="w-3 h-3" /> เลือกไฟล์ใหม่
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={FORM_FILE_ACCEPT[formFileKind(formType)]}
        className="hidden"
        onChange={handleChange}
      />

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function FileUploader({
  submissionId,
  formType,
  existingUpload,
  onSuccess,
  selectedFile,
  onFileSelect,
  slotLabel,
}: Props) {
  const { refresh } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickerMode = onFileSelect !== undefined;
  const activeFile = pickerMode ? selectedFile : file;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    if (f) {
      const err = checkFormFile(formType, f);
      if (err) { setError(err); return; }
    }
    if (pickerMode) {
      onFileSelect!(f);
    } else {
      setFile(f);
    }
  }

  function clearFile(e: React.MouseEvent) {
    e.stopPropagation();
    if (pickerMode) {
      onFileSelect!(null);
    } else {
      setFile(null);
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleUpload() {
    if (!file) return;
    const err = checkFormFile(formType, file);
    if (err) { setError(err); return; }

    setUploading(true);
    setError(null);
    try {
      await postUpload(submissionId, formType, file);
      setFile(null);
      await refresh();
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setUploading(false);
    }
  }

  // ── Existing upload (no new file selected) ────────────────────────────────
  if (existingUpload && !activeFile) {
    return (
      <div className="border-2 border-green-200 rounded-xl p-4 space-y-3 bg-green-50">
        <SlotHeader formType={formType} status="done" desc={slotLabel} />
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
          <button
            type="button"
            onClick={() => previewFile(existingUpload.id, existingUpload.fileUrl, existingUpload.fileName)}
            className="min-w-0 flex-1 text-left hover:underline"
            title="เปิดดูไฟล์"
          >
            <p className="text-sm font-medium text-green-800 truncate">{existingUpload.fileName}</p>
            <p className="text-xs text-green-600">{formatBytes(existingUpload.fileSize)} · {formatDate(existingUpload.uploadedAt)}</p>
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-white transition"
        >
          เปลี่ยนไฟล์
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={FORM_FILE_ACCEPT[formFileKind(formType)]}
          className="hidden"
          onChange={handleChange}
        />
      </div>
    );
  }

  // ── Picker / uploader area ────────────────────────────────────────────────
  return (
    <div className={cn(
      "border-2 rounded-xl p-4 space-y-3 bg-white",
      activeFile ? "border-blue-300" : "border-dashed border-gray-300"
    )}>
      <SlotHeader formType={formType} status={activeFile ? "picked" : "empty"} desc={slotLabel} />

      <div
        onClick={() => !uploading && inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center gap-2 py-5 rounded-lg transition",
          uploading ? "bg-gray-50 cursor-wait" : "cursor-pointer hover:bg-gray-50"
        )}
      >
        {uploading ? (
          <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
        ) : activeFile ? (
          <FileText className="w-7 h-7 text-blue-400" />
        ) : (
          <Upload className="w-7 h-7 text-gray-300" />
        )}
        <span className="text-xs text-gray-500 text-center px-2">
          {uploading
            ? "กำลังอัปโหลด..."
            : activeFile
            ? `${activeFile.name} (${formatBytes(activeFile.size)})`
            : `คลิกเพื่อเลือกไฟล์ ${FORM_FILE_KIND_LABEL[formFileKind(formType)]} (สูงสุด 20 MB)`}
        </span>
      </div>

      {activeFile && (
        <button
          onClick={clearFile}
          className="w-full py-1.5 rounded-lg border border-gray-200 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition flex items-center justify-center gap-1"
        >
          <X className="w-3 h-3" /> เลือกไฟล์ใหม่
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={FORM_FILE_ACCEPT[formFileKind(formType)]}
        className="hidden"
        onChange={handleChange}
      />

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Upload button — only in immediate mode and only after a file is chosen */}
      {!pickerMode && file && (
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full py-2 rounded-lg bg-blue-600 text-white text-xs font-medium disabled:opacity-40 hover:bg-blue-700 transition flex items-center justify-center gap-1.5"
        >
          {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {uploading ? "กำลังอัปโหลด..." : "อัปโหลด"}
        </button>
      )}
    </div>
  );
}
