"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toUserErrorMessage } from "@/lib/utils";
import {
  UploadSlot, SectionLabel, DownloadRow, NoDownloads, NotesField, ActionError, postUpload,
  ACTION_CARD, PRIMARY_BUTTON, REJECT_BUTTON, CONFIRM_REJECT_BUTTON, CANCEL_BUTTON,
} from "@/components/FileUploader";
import { B1Checklist, allChecked } from "@/components/B1Checklist";
import type { B1Check } from "@/lib/utils";

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
  /** Forms listed under ① download only, with no upload slot (e.g. the student's แบบประเมินดีมาก) */
  downloadOnly?: string[];
  notePrefix?: string;
  requireNotePrefix?: boolean;
  extraSlots?: ExtraSlot[];
  /** Required pre-approve checklist (PROPOSAL step 3's บ.วศ.1 checks) — approve stays disabled until all ticked */
  checklist?: { title: string; checks: B1Check[] };
  /** Extra info line shown above the buttons (e.g. what approving triggers) */
  approveNote?: string;
  /** Unnumbered info shown at the top of the card in both modes (e.g. the student's exam result) */
  intro?: React.ReactNode;
  /** A section that comes before ① download (e.g. the head's ผ่าน/ไม่ผ่าน picker) — given its number */
  leadSection?: (n: number) => React.ReactNode;
  /** Replaces the ② sign section's heading/hint when the step also fills in a form (THESIS step 7) */
  signSection?: { title: string; hint: string };
}

/** Single-signer action card: ① download → ② sign → ③ upload → checklist → notes → ส่งต่อ / ปฏิเสธ.
 *  Same parts, in the same order, as CommitteeSignPanel (built from the FileUploader building blocks). */
export function SignatureButton({ submissionId, label = "ส่งต่อ", onSuccess, formsToShow, downloadOnly, notePrefix, requireNotePrefix, extraSlots, checklist, approveNote, intro, leadSection, signSection }: Props) {
  const { approveCurrentStep, rejectCurrentStep, submissions } = useApp();
  const { showToast } = useToast();
  const [notes,      setNotes]      = useState("");
  const [showReject, setShowReject] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Per-form upload state
  const [fileByForm,    setFileByForm]    = useState<Record<string, File | null>>({});
  const [uploadedForms, setUploadedForms] = useState<Set<string>>(new Set());
  const [checks,        setChecks]        = useState<Record<string, boolean>>({});
  const checklistDone = !checklist || allChecked(checklist.checks, checks);

  const sub = submissions.find((s) => s.id === submissionId);
  // Section numbers shift by one when a lead section comes first
  const base = leadSection ? 1 : 0;

  // Upload targets: use all formsToShow directly (each uploads as its own formType).
  // Fall back to a single SIGNED slot only when formsToShow is empty and no extraSlots.
  const uploadTargets: string[] = [
    ...(formsToShow?.length ? formsToShow : (extraSlots?.length ? [] : ["SIGNED"])),
    ...(extraSlots ?? []).map((s) => s.slotKey),
  ];
  // Ready when every slot is either already uploaded or has a file selected
  const allFormsReady = uploadTargets.every((ft) => uploadedForms.has(ft) || !!fileByForm[ft]);

  // Latest version of each form this step signs
  const downloads = (() => {
    const list = (sub?.uploads ?? []).filter((u) => !formsToShow?.length || formsToShow.includes(u.formType) || !!downloadOnly?.includes(u.formType));
    const latestByType = new Map<string, (typeof list)[number]>();
    for (const u of [...list].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()))
      if (!latestByType.has(u.formType)) latestByType.set(u.formType, u);
    return [...latestByType.values()];
  })();

  async function handleApprove() {
    if (requireNotePrefix && !notePrefix) {
      setError("กรุณาเลือกผลการสอบก่อน");
      return;
    }
    if (!allFormsReady) {
      setError("กรุณาเลือกไฟล์ที่ลงนามแล้วให้ครบก่อน");
      return;
    }
    if (!checklistDone) {
      setError("กรุณาตรวจสอบและทำเครื่องหมายให้ครบทุกข้อก่อน");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Upload any pending files first, then approve in one action
      for (const ft of uploadTargets) {
        if (!uploadedForms.has(ft) && fileByForm[ft]) {
          const actualFormType = extraSlots?.find((s) => s.slotKey === ft)?.formType ?? ft;
          await postUpload(submissionId, actualFormType, fileByForm[ft]!);
          setUploadedForms((prev) => new Set([...prev, ft]));
        }
      }
      const combinedNotes = [notePrefix, notes].filter(Boolean).join("\n") || undefined;
      await approveCurrentStep(submissionId, combinedNotes);
      showToast("อัปโหลดและส่งต่อเรียบร้อยแล้ว ✓");
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
    <div className={ACTION_CARD}>
      <h3 className="text-lg font-semibold text-gray-800">ดำเนินการ</h3>

      {intro}

      {!showReject && (
        <>
          {leadSection?.(1)}

          <div>
            <SectionLabel n={base + 1}>ดาวน์โหลดเอกสารเพื่อลงนาม</SectionLabel>
            {downloads.length > 0 ? (
              <div className="space-y-2">
                {downloads.map((u) => <DownloadRow key={u.id} upload={u} submissionTitle={sub?.title ?? ""} />)}
              </div>
            ) : <NoDownloads />}
          </div>

          <div>
            <SectionLabel n={base + 2} required={!!signSection}>{signSection?.title ?? "ลงนามในเอกสาร"}</SectionLabel>
            <p className="text-sm text-gray-500 pl-6">{signSection?.hint ?? "ลงนามในไฟล์ที่ดาวน์โหลด แล้วบันทึกเป็นไฟล์ PDF"}</p>
          </div>

          <div>
            <SectionLabel n={base + 3} required>อัปโหลดเอกสารที่ลงนามแล้ว</SectionLabel>
            <div className="space-y-3">
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
          </div>

          {checklist && (
            <B1Checklist title={checklist.title} checks={checklist.checks} value={checks} onChange={setChecks} />
          )}
        </>
      )}

      <NotesField value={notes} onChange={(v) => { setNotes(v); setError(null); }} reject={showReject} />

      <ActionError message={error} />

      {approveNote && !showReject && (
        <p className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">{approveNote}</p>
      )}

      <div className="flex gap-3">
        {!showReject ? (
          <>
            <button
              onClick={handleApprove}
              disabled={loading || !allFormsReady || !checklistDone}
              className={`${PRIMARY_BUTTON} flex-1`}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {loading ? "กำลังบันทึก..." : label}
            </button>
            <button onClick={() => setShowReject(true)} disabled={loading} className={REJECT_BUTTON}>
              <XCircle className="w-5 h-5" />
              ปฏิเสธ
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleReject}
              disabled={loading}
              className={CONFIRM_REJECT_BUTTON}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {loading ? "กำลังบันทึก..." : "ยืนยันการปฏิเสธ"}
            </button>
            <button
              onClick={() => { setShowReject(false); setError(null); }}
              disabled={loading}
              className={CANCEL_BUTTON}
            >
              ยกเลิก
            </button>
          </>
        )}
      </div>
    </div>
  );
}
