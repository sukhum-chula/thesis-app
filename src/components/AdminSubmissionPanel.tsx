"use client";

import { useState, useRef } from "react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { SubmissionStatusBadge, StepStatusBadge } from "@/components/StatusBadge";
import {
  FORM_LABELS, ROLE_LABELS, getStepName, PROGRAM_LABELS, formatBytes, formatDate, previewFile,
  toUserErrorMessage, formatUserName, FORM_FILE_ACCEPT, checkFormFile,
  B1_CHECKS, ADMIN_B1_EXTRA_CHECKS, ADMIN_STEP6_CHECKS, ADMIN_STEP8_CHECKS, ADMIN_DEFENSE_FINANCE_CHECKS, ADMIN_DEFENSE_FORWARD_CHECKS,
  ADMIN_DEFENSE_RESULT_CHECKS, ADMIN_DEFENSE_SEND_CHECKS, freshUploadCutoff,
  ADMIN_DEFENSE_THESIS_CHECKS, ADMIN_DEFENSE_THESIS_SEND_CHECKS, ADMIN_DEFENSE_THESIS_FORWARD_CHECKS,
} from "@/lib/utils";
import { THESIS_STEP, financeStepOf, previousActiveStep, committeeRoster, isPerMemberForm } from "@/lib/workflowSteps";
import { docxText } from "@/lib/docxText";
import { stepNumbering } from "@/lib/stepNumbering";
import { B1Checklist, allChecked } from "@/components/B1Checklist";
import {
  CommitteePeopleEditor, ProgramChairAutoField, ExamLogisticsSection, buildPeopleFromSubmission,
  initialPeople, resolveProgramChair, withProgramChair, validatePeopleClient, validateNoInvalidRows,
  Section, Field, INPUT, type Person,
} from "@/components/SubmissionForms";
import { MockWorkflowStep, MockUpload } from "@/types";
import {
  ArrowLeft, Download, FileText, Pencil, Check, X,
  Trash2, ShieldCheck, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Clock, User, Users, CalendarDays, Upload, Loader2, Info,
  AlertTriangle, RefreshCw,
} from "lucide-react";
import { FileList } from "@/components/FileList";
import {
  FileUploader, SlotHeader, SectionLabel, DownloadRow, NotesField, ActionError, postUpload,
  ACTION_CARD, PRIMARY_BUTTON, SEND_BACK_BUTTON, CONFIRM_SEND_BACK_BUTTON, CANCEL_BUTTON,
} from "@/components/FileUploader";

// Documents the ADMIN checks at each of their steps — shown as the action card's ① download section,
// latest version of each (one per member for per-member forms). Steps not listed have nothing to check.
const ADMIN_STEP_FORMS: Record<string, Record<number, string[]>> = {
  PROPOSAL: { 2: ["B1"], 10: ["B1"], 12: ["B1"] },
  THESIS_DEFENSE: {
    [THESIS_STEP.ADMIN_CHECK]:        ["B2", "B3"],
    [THESIS_STEP.ADMIN_RELAY]:        ["B2", "B3"],
    [THESIS_STEP.ADMIN_RESULT_CHECK]: ["EXAM_RESULT", "SIGNED", "VERY_GOOD_EVAL"],
    [THESIS_STEP.ADMIN_RESULT_SEND]:  ["EXAM_RESULT"],
  },
};

// ─── Step control card ────────────────────────────────────────────────────────

function StepCard({
  step,
  isCurrentStep,
  onOverride,
  onSendBack,
  stepUploads,
  assignedName,
  committeeStatus,
  submissionType,
  displayOrder,
}: {
  step: MockWorkflowStep;
  isCurrentStep: boolean;
  onOverride: (stepOrder: number, action: "APPROVED" | "REJECTED", notes?: string) => Promise<void>;
  /** ส่งกลับ from the current step to the previous one (`return_to_prev`); unset where there is none */
  onSendBack?: (notes?: string) => Promise<void>;
  stepUploads: MockUpload[];
  assignedName?: string | null;
  committeeStatus?: { name: string; signed: boolean; approved: boolean }[];
  submissionType?: string | null;
  displayOrder: string;
}) {
  const [open,    setOpen]    = useState(false);
  // The admin's pick between อนุมัติ / ส่งกลับ — only offered on the current PENDING step
  const [picked,  setAction]  = useState<"APPROVE" | "SEND_BACK">("APPROVE");
  // Derived from the step's live status, not frozen at mount: an approved step can only be sent
  // back to (the card may have mounted while it was still PENDING), and a step with no previous
  // one to return to can only be approved
  const action: "APPROVE" | "SEND_BACK" =
    step.status === "APPROVED" ? "SEND_BACK" : onSendBack ? picked : "APPROVE";
  const [notes,   setNotes]   = useState("");
  const [saving,  setSaving]  = useState(false);
  const [errMsg,  setErrMsg]  = useState<string | null>(null);

  const borderColor =
    step.status === "APPROVED" ? "border-green-200 bg-green-50"
    : step.status === "REJECTED" ? "border-red-200 bg-red-50"
    : isCurrentStep ? "border-blue-300 bg-blue-50"
    : "border-gray-100 bg-white";

  return (
    <div className={`rounded-xl border-2 p-4 transition-all ${borderColor}`}>
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-400 uppercase">ขั้นที่ {displayOrder}</span>
            <span className="font-semibold text-gray-800">{getStepName(step.stepOrder, submissionType) || ROLE_LABELS[step.role]}</span>
            {isCurrentStep && (
              <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
                ● กำลังดำเนินการ
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">{ROLE_LABELS[step.role]}</p>
          {assignedName && !step.actedByName && (
            <p className="text-sm text-blue-600 flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              {assignedName}
            </p>
          )}
          {step.actedByName && (
            <p className="text-sm text-gray-500">
              โดย <span className="font-medium text-gray-700">{step.actedByName}</span>
              {step.actedAt && <span className="text-gray-400"> · {formatDate(step.actedAt)}</span>}
            </p>
          )}
          {step.notes && (
            <p className="text-sm text-gray-500 italic">"{step.notes}"</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <StepStatusBadge status={step.status} />
          <button
            onClick={() => { setOpen(!open); setErrMsg(null); }}
            className="flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg transition"
          >
            <ShieldCheck className="w-4 h-4" />
            จัดการ
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Uploaded files for this step */}
      {stepUploads.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
          {stepUploads.map((u) => (
            <div key={u.id} className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-xs text-gray-600 truncate flex-1">{FORM_LABELS[u.formType]} — {u.fileName} <span className="text-gray-400">({formatBytes(u.fileSize)})</span></span>
              <button
                onClick={() => previewFile(u.id, u.fileUrl, u.fileName)}
                className="shrink-0 text-xs text-blue-600 hover:underline flex items-center gap-0.5"
              >
                <Download className="w-3 h-3" />
                ดาวน์โหลด
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Committee sign status */}
      {committeeStatus && committeeStatus.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">สถานะลงนามกรรมการ</p>
          {committeeStatus.map((m) => (
            <div key={m.name} className="flex items-center gap-2">
              {m.signed ? (
                m.approved
                  ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  : <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              ) : (
                <Clock className="w-4 h-4 text-gray-300 shrink-0" />
              )}
              <span className={`text-sm ${m.signed ? (m.approved ? "text-green-700" : "text-red-600") : "text-gray-500"}`}>
                {m.name}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                m.signed
                  ? m.approved ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-400"
              }`}>
                {m.signed ? (m.approved ? "อนุมัติ" : "ปฏิเสธ") : "รอลงนาม"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Expandable admin controls */}
      {open && (
        <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
          {/* Two override actions: อนุมัติ (approve up to this step) and ส่งกลับ. On an APPROVED step
              ส่งกลับ brings the workflow back to this step; on the current step it sends it back
              one step (same as the action card's ส่งกลับ). A future or REJECTED step can only be
              approved — a REJECTED one is waiting on the student's resubmit. */}
          <p className="text-sm font-medium text-gray-600">
            {step.status === "APPROVED" ? "ส่งกลับมาขั้นนี้เพื่อดำเนินการใหม่:" : "บังคับเปลี่ยนสถานะขั้นนี้:"}
          </p>
          {step.status !== "APPROVED" && onSendBack && (
            <div className="flex gap-2">
              <button
                onClick={() => setAction("APPROVE")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-medium text-sm transition ${
                  action === "APPROVE"
                    ? "bg-green-600 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-green-400"
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                อนุมัติ
              </button>
              <button
                onClick={() => setAction("SEND_BACK")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-medium text-sm transition ${
                  action === "SEND_BACK"
                    ? "bg-orange-500 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-orange-400"
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
                ส่งกลับ
              </button>
            </div>
          )}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={action === "SEND_BACK" ? "เหตุผลการส่งกลับ (ไม่บังคับ)..." : "หมายเหตุ (ไม่บังคับ)..."}
            className={`w-full border rounded-xl p-3 text-sm resize-none h-16 focus:outline-none focus:ring-2 ${
              action === "SEND_BACK" ? "border-orange-300 focus:ring-orange-400" : "border-gray-200 focus:ring-orange-400"
            }`}
          />

          {errMsg && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errMsg}</p>
          )}
          <div className="flex gap-2">
            <button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                setErrMsg(null);
                try {
                  if (step.status === "APPROVED") {
                    // ส่งกลับมาขั้นนี้: reset from this step onward
                    await onOverride(step.stepOrder, "REJECTED", notes || undefined);
                  } else if (action === "SEND_BACK" && onSendBack) {
                    // ส่งกลับ from the current step: back to the previous step
                    await onSendBack(notes || undefined);
                  } else {
                    await onOverride(step.stepOrder, "APPROVED", notes || undefined);
                  }
                  setOpen(false);
                  setNotes("");
                } catch (e) {
                  setErrMsg(e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
                } finally {
                  setSaving(false);
                }
              }}
              className={`flex-1 py-2.5 text-white font-semibold rounded-xl transition text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                action === "SEND_BACK" ? "bg-orange-500 hover:bg-orange-600"
                : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {saving ? "กำลังบันทึก..."
                : action === "SEND_BACK" ? "ยืนยันส่งกลับ"
                : "ยืนยันอนุมัติ"}
            </button>
            <button
              onClick={() => { setOpen(false); setNotes(""); setErrMsg(null); }}
              className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition text-sm"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const ADMIN_STEP2_CHECKS = [...B1_CHECKS, ...ADMIN_B1_EXTRA_CHECKS];

// ─── Proposal step-2 finance attachment: generate → (download, edit, re-upload) ─

type CompareState = "idle" | "checking" | "same" | "different" | "unknown";

/** Text of the currently stored version, fetched through the signed-URL route (bucket is private). */
async function storedDocxText(uploadId: string): Promise<string> {
  const r = await fetch(`/api/upload/${uploadId}/signed-url`);
  const { url } = await r.json();
  if (!url) throw new Error("no signed url");
  const buf = await (await fetch(url)).arrayBuffer();
  return docxText(buf);
}

function ProposalFinanceGeneratePanel({ submissionId, submissionTitle, latest }: { submissionId: string; submissionTitle: string; latest: MockUpload | null }) {
  const { refresh }  = useApp();
  const { showToast } = useToast();
  const [busy,    setBusy]    = useState<"generate" | "upload" | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [picked,  setPicked]  = useState<File | null>(null);
  const [compare, setCompare] = useState<CompareState>("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  function clearPicked() {
    setPicked(null);
    setCompare("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleGenerate() {
    setBusy("generate");
    setError(null);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/finance-attach`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
      clearPicked();
      await refresh();
      showToast("สร้างเอกสารการเงินเรียบร้อยแล้ว ✓");
    } catch (e) {
      setError(toUserErrorMessage(e, "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง"));
    } finally {
      setBusy(null);
    }
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    if (!f) return;
    const err = checkFormFile("FINANCE_ATTACH", f);
    if (err) { setError(err); if (inputRef.current) inputRef.current.value = ""; return; }
    setPicked(f);
    if (!latest) { setCompare("idle"); return; }
    setCompare("checking");
    try {
      const [mine, current] = await Promise.all([f.arrayBuffer().then(docxText), storedDocxText(latest.id)]);
      setCompare(mine === current ? "same" : "different");
    } catch {
      setCompare("unknown");
    }
  }

  async function handleUpload() {
    if (!picked) return;
    setBusy("upload");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", picked);
      fd.append("submissionId", submissionId);
      fd.append("formType", "FINANCE_ATTACH");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "อัปโหลดไม่สำเร็จ กรุณาลองอีกครั้ง");
      clearPicked();
      await refresh();
      showToast("อัปโหลดเอกสารการเงินแล้ว — แทนที่ไฟล์เดิม ✓");
    } catch (e) {
      setError(toUserErrorMessage(e, "อัปโหลดไม่สำเร็จ กรุณาลองอีกครั้ง"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={ACTION_CARD}>
      <h3 className="text-lg font-semibold text-gray-800">เอกสารการเงินแนบกรรมการสอบ</h3>
      <p className="text-sm text-gray-500">
        ระบบจะกรอกชื่อนิสิต รหัสนิสิต และรายชื่อคณะกรรมการให้ — วันที่ หน่วยกิต ลงนาม รวมเงิน และการจ่ายเช็คเว้นว่างไว้
      </p>

      {!latest ? (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy !== null}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {busy === "generate" ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
          {busy === "generate" ? "กำลังสร้าง..." : "สร้างเอกสารการเงินแนบกรรมการสอบ"}
        </button>
      ) : (
        <>
          {/* Upload box — holds the one current version (generated, or the admin's edited copy) */}
          <div className={picked
            ? "border-2 border-blue-300 rounded-xl p-4 space-y-3 bg-white"
            : "border-2 border-green-200 rounded-xl p-4 space-y-3 bg-green-50"}>
            <SlotHeader formType="FINANCE_ATTACH" status={picked ? "picked" : "done"} desc="ไฟล์ Word (.docx) — เก็บไว้เพียงไฟล์เดียว" />

            {!picked ? (
              <>
                <DownloadRow upload={latest} submissionTitle={submissionTitle} />
                <p className="text-xs text-gray-500">
                  หากต้องการแก้ไข: ดาวน์โหลด แก้ไขในโปรแกรม Word แล้วกด &quot;เปลี่ยนไฟล์&quot; เพื่ออัปโหลดไฟล์ที่แก้ไขแล้ว
                </p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={busy !== null}
                  className="w-full py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-white transition disabled:opacity-60"
                >
                  เปลี่ยนไฟล์
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-blue-400 shrink-0" />
                  <p className="text-sm text-gray-700 truncate flex-1">{picked.name} ({formatBytes(picked.size)})</p>
                </div>
                {compare === "checking" && (
                  <p className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> กำลังเปรียบเทียบกับไฟล์ปัจจุบัน...
                  </p>
                )}
                {compare === "different" && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-2.5 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    ไฟล์นี้มีเนื้อหาแตกต่างจากไฟล์ปัจจุบัน — เมื่ออัปโหลด ไฟล์ปัจจุบันจะถูกแทนที่และไม่เก็บไว้ กรุณาตรวจสอบข้อมูลให้ถูกต้องก่อนอัปโหลด
                  </p>
                )}
                {compare === "unknown" && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-2.5 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    ไม่สามารถเปรียบเทียบกับไฟล์ปัจจุบันได้ — เมื่ออัปโหลด ไฟล์ปัจจุบันจะถูกแทนที่และไม่เก็บไว้
                  </p>
                )}
                {compare === "same" && (
                  <p className="flex items-start gap-1.5 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    เนื้อหาเหมือนกับไฟล์ปัจจุบัน
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={busy !== null || compare === "checking"}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {busy === "upload" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {busy === "upload" ? "กำลังอัปโหลด..." : "อัปโหลดแทนที่ไฟล์ปัจจุบัน"}
                  </button>
                  <button
                    type="button"
                    onClick={clearPicked}
                    disabled={busy !== null}
                    className="px-4 py-2.5 bg-gray-100 text-gray-600 text-sm rounded-xl hover:bg-gray-200 transition disabled:opacity-60"
                  >
                    ยกเลิก
                  </button>
                </div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={FORM_FILE_ACCEPT.docx}
              className="hidden"
              onChange={handlePick}
            />
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy !== null}
            className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-green-300 text-green-700 font-semibold rounded-xl hover:bg-green-100 transition disabled:opacity-60 disabled:cursor-not-allowed text-sm"
          >
            {busy === "generate" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {busy === "generate" ? "กำลังสร้าง..." : "สร้างใหม่จากข้อมูลในระบบ (แทนที่ไฟล์ปัจจุบัน)"}
          </button>
        </>
      )}

      <ActionError message={error} />
    </div>
  );
}

// ─── Main panel ─────────────────────────────────────────────────────────────
// Full admin action surface for one submission — extracted from what used to be all of
// /dashboard/admin/[id]/page.tsx so it can render both there (thin wrapper) and inline,
// expanded directly under a row in the /admin-dashboard submission list (see AdminUsersPanel/
// StudentSubmissionActions for the same "extract the whole page body into a { id } component"
// pattern used elsewhere in this app).

export function AdminSubmissionPanel({ submissionId, onDeleted }: { submissionId: string; onDeleted?: () => void }) {
  const { submissions, users, adminUpdateSubmission, adminDeleteSubmission, adminOverrideStep, approveCurrentStep, returnToPrevStep, adminAcceptCancel, adminDeclineCancel } = useApp();
  const { showToast } = useToast();
  const [cancelActionBusy, setCancelActionBusy] = useState(false);
  const [confirmAcceptCancel, setConfirmAcceptCancel] = useState(false);

  const sub = submissions.find((s) => s.id === submissionId);

  const pendingStep$ = sub?.workflowSteps.find((s) => s.status === "PENDING");
  const isMyTurn = pendingStep$?.role === "ADMIN";
  // ADMIN steps offer อนุมัติ + ส่งกลับ only (no ปฏิเสธ); ส่งกลับ goes to this step's previous one
  const sendBackToStudent = isMyTurn && !!sub && previousActiveStep(sub.workflowSteps, pendingStep$!)?.role === "STUDENT";
  const isThesisRelayStep  = sub?.submissionType === "THESIS_DEFENSE" && pendingStep$?.stepOrder === THESIS_STEP.ADMIN_RELAY;
  const isThesisForwardStep = sub?.submissionType === "THESIS_DEFENSE" && pendingStep$?.stepOrder === THESIS_STEP.ADMIN_FORWARD;
  // After the committee's ใบรายงานผล signatures: check the documents, then (after the department
  // chair signs) upload the cover page and confirm the email to the Faculty
  const isThesisResultCheckStep = sub?.submissionType === "THESIS_DEFENSE" && pendingStep$?.stepOrder === THESIS_STEP.ADMIN_RESULT_CHECK;
  const isThesisResultSendStep  = sub?.submissionType === "THESIS_DEFENSE" && pendingStep$?.stepOrder === THESIS_STEP.ADMIN_RESULT_SEND;
  // After the student's บ.4 + thesis: check them + cover page, then (after the department chair signs)
  // confirm the email to the Faculty, then confirm forwarding the Faculty's reply to the student
  const isThesisDocCheckStep   = sub?.submissionType === "THESIS_DEFENSE" && pendingStep$?.stepOrder === THESIS_STEP.ADMIN_THESIS_CHECK;
  const isThesisDocSendStep    = sub?.submissionType === "THESIS_DEFENSE" && pendingStep$?.stepOrder === THESIS_STEP.ADMIN_THESIS_SEND;
  const isThesisDocForwardStep = sub?.submissionType === "THESIS_DEFENSE" && pendingStep$?.stepOrder === THESIS_STEP.ADMIN_THESIS_FORWARD;
  // The ADMIN check that generates the finance form (PROPOSAL 2, THESIS_DEFENSE 4); approving sends the email
  const isFinanceReviewStep = (sub?.submissionType === "PROPOSAL" || sub?.submissionType === "THESIS_DEFENSE")
    && pendingStep$?.stepOrder === financeStepOf(sub?.submissionType) && pendingStep$?.role === "ADMIN";
  // PROPOSAL step 6 (stepOrder 10): verify the fully-signed B1 before the chair's final signature
  const isProposalVerifyStep  = sub?.submissionType === "PROPOSAL" && pendingStep$?.stepOrder === 10;
  // PROPOSAL step 8 (stepOrder 12): final recheck + the Faculty cover page — the proposal's last step
  const isProposalCoverStep   = sub?.submissionType === "PROPOSAL" && pendingStep$?.stepOrder === 12;
  // Steps whose approve is gated on the department-chair-signed cover page (COVER_PAGE): PROPOSAL
  // step 8, THESIS_DEFENSE step 4 (sent with บ.2 + บ.3) and step 11 (sent with the exam result).
  // Step 11's must be a new copy — the step-4 one already exists (freshUploadCutoff, same as the server)
  const isCoverStep = isProposalCoverStep || isThesisRelayStep || isThesisResultSendStep || isThesisDocCheckStep;
  const coverCutoff = sub && pendingStep$ ? freshUploadCutoff(sub.workflowSteps, sub.submissionType, pendingStep$.stepOrder) : null;
  const latestCover = (sub?.uploads ?? [])
    .filter((u) => u.formType === "COVER_PAGE" && (coverCutoff === null || new Date(u.uploadedAt).getTime() > coverCutoff))
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0] ?? null;
  const deptChair = users.find((u) => u.isDepartmentChair) ?? null;
  const latestFinanceAttach = (sub?.uploads ?? [])
    .filter((u) => u.formType === "FINANCE_ATTACH")
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0] ?? null;
  // PROPOSAL step 2 can't be approved until the finance attachment exists and the admin has ticked
  // the student's บ.วศ.1 checklist plus the committee check; step 6 needs its verification checks
  const adminChecks = isFinanceReviewStep ? (sub?.submissionType === "THESIS_DEFENSE" ? ADMIN_DEFENSE_FINANCE_CHECKS : ADMIN_STEP2_CHECKS)
    : isProposalVerifyStep ? ADMIN_STEP6_CHECKS
    : isProposalCoverStep ? ADMIN_STEP8_CHECKS
    : isThesisForwardStep ? ADMIN_DEFENSE_FORWARD_CHECKS
    : isThesisResultCheckStep ? ADMIN_DEFENSE_RESULT_CHECKS
    : isThesisResultSendStep ? ADMIN_DEFENSE_SEND_CHECKS
    : isThesisDocCheckStep ? ADMIN_DEFENSE_THESIS_CHECKS
    : isThesisDocSendStep ? ADMIN_DEFENSE_THESIS_SEND_CHECKS
    : isThesisDocForwardStep ? ADMIN_DEFENSE_THESIS_FORWARD_CHECKS
    : null;
  const [adminCheckState, setAdminCheckState] = useState<Record<string, boolean>>({});
  const adminAllChecked = !adminChecks || allChecked(adminChecks, adminCheckState);
  // Files picked in the action card's upload section (cover page) — uploaded on อนุมัติ
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({});
  const [actionError,  setActionError]  = useState<string | null>(null);
  const approveBlocked = (isFinanceReviewStep && !latestFinanceAttach)
    || (isCoverStep && !latestCover && !pendingFiles.COVER_PAGE)
    || !adminAllChecked;
  const [approveNotes, setApproveNotes] = useState("");
  const [actionMode,   setActionMode]   = useState<"return" | null>(null);
  const [actionNotes,  setActionNotes]  = useState("");
  const [actionBusy,   setActionBusy]   = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState({
    title: "", studentFullName: "", studentCode: "", program: "",
    studentEmail: "", studentPhone: "",
    examDate: "", examTime: "", roomNeeded: false, parkingNeeded: false, carPlate: "",
  });
  const upd = (key: string, val: unknown) => setEditDraft((p) => ({ ...p, [key]: val }));
  // The committee is edited with the exact editor the student uses (CommitteePeopleEditor) —
  // same rows, same degree-dependent pickers, same one-person-one-role filtering, no slot limit.
  const [editPeople, setEditPeople] = useState<Person[]>([]);
  const [confirmDel,  setConfirmDel]  = useState(false);
  const [activeTab,   setActiveTab]   = useState<"steps" | "timeline">("steps");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  if (!sub) {
    return <p className="text-center py-10 text-gray-400">ไม่พบข้อมูลคำร้อง</p>;
  }

  const allUsers   = users;
  const student    = allUsers.find((u) => u.id === sub.studentId);
  const advisor    = allUsers.find((u) => u.id === sub.advisorId);
  // When REJECTED, no step is treated as "current" — future pending steps aren't highlighted
  const currentOrd        = sub.status === "REJECTED"
    ? null
    : sub.workflowSteps.find((s) => s.status === "PENDING")?.stepOrder ?? null;
  // Display numbering (sub-steps 5.1–5.x, SKIPPED hidden) — lib/stepNumbering
  const numbering         = stepNumbering(sub.workflowSteps, sub.submissionType);
  const currentDisplayOrd = currentOrd !== null ? numbering.label(currentOrd) || null : null;
  const doneCount  = numbering.done;
  const totalSteps = numbering.total;
  // ประธานหลักสูตร is admin-designated per program (see "จัดการประธานหลักสูตร"), not freely
  // selectable per submission — it always follows whichever หลักสูตร is picked in the edit form.
  const resolvedProgramChair = resolveProgramChair(allUsers, editDraft.program) ?? null;

  // ① download section of the admin's action card
  const adminStepForms = pendingStep$ ? ADMIN_STEP_FORMS[sub.submissionType ?? "PROPOSAL"]?.[pendingStep$.stepOrder] : undefined;
  const adminDownloads = (() => {
    if (!isMyTurn || !adminStepForms) return [];
    const roster = committeeRoster(sub);
    const newest = (list: MockUpload[]) =>
      [...list].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0] ?? null;
    return adminStepForms.flatMap((ft) => {
      if (isPerMemberForm(sub.submissionType ?? "PROPOSAL", ft)) {
        return roster.flatMap((m) => {
          const u = newest(sub.uploads.filter((x) => x.formType === ft && x.memberId === m.id));
          const person = allUsers.find((x) => x.id === m.id);
          const formLabel = FORM_LABELS[ft as keyof typeof FORM_LABELS] ?? ft;
          return u ? [{ upload: u, title: `${formLabel} — ${person ? formatUserName(person) : ROLE_LABELS[m.role] ?? m.role}` }] : [];
        });
      }
      const u = newest(sub.uploads.filter((x) => x.formType === ft));
      return u ? [{ upload: u, title: undefined as string | undefined }] : [];
    });
  })();

  async function handleAcceptCancel() {
    setCancelActionBusy(true);
    try {
      await adminAcceptCancel(sub!.id);
      setConfirmAcceptCancel(false);
      showToast("อนุมัติการยกเลิกแล้ว");
    } catch (err) {
      showToast(toUserErrorMessage(err, "ไม่สำเร็จ กรุณาลองอีกครั้ง"), "error");
    } finally {
      setCancelActionBusy(false);
    }
  }

  async function handleDeclineCancel() {
    setCancelActionBusy(true);
    try {
      await adminDeclineCancel(sub!.id);
      showToast("ปฏิเสธคำขอยกเลิกแล้ว — คำร้องดำเนินการต่อตามปกติ");
    } catch (err) {
      showToast(toUserErrorMessage(err, "ไม่สำเร็จ กรุณาลองอีกครั้ง"), "error");
    } finally {
      setCancelActionBusy(false);
    }
  }

  function enterEditMode() {
    if (!sub) return;
    setEditDraft({
      title:               sub.title               ?? "",
      studentFullName:     sub.studentFullName      ?? "",
      studentCode:         sub.studentCode          ?? "",
      program:             sub.program              ?? "",
      studentEmail:        sub.studentEmail         ?? "",
      studentPhone:        sub.studentPhone         ?? "",
      examDate:            sub.examDate             ?? "",
      examTime:            sub.examTime             ?? "",
      roomNeeded:          sub.roomNeeded           ?? false,
      parkingNeeded:       sub.parkingNeeded        ?? false,
      carPlate:            sub.carPlate             ?? "",
    });
    const people = buildPeopleFromSubmission(sub, allUsers, sub.program ?? "");
    setEditPeople(people.length ? people : initialPeople());
    setEditMode(true);
  }

  async function saveEdit() {
    if (!sub) return;
    if (!editDraft.title.trim()) { showToast("กรุณาระบุชื่อหัวข้อวิทยานิพนธ์", "error"); return; }
    // Same client checks the student's own draft uses: a DRAFT may be incomplete (only a mistake
    // blocks it — an unusable or double-booked member); anything past DRAFT needs the full
    // committee, same as the server's admin_update count check.
    const peopleError = sub.status === "DRAFT"
      ? validateNoInvalidRows(editPeople, editDraft.program, allUsers)
      : validatePeopleClient(
          withProgramChair(editPeople, resolvedProgramChair ?? undefined),
          [editDraft.studentEmail.trim().toLowerCase(), student?.email.toLowerCase() ?? ""].filter(Boolean),
          editDraft.program,
          allUsers
        );
    if (peopleError) { showToast(peopleError, "error"); return; }
    // Rows -> id columns. Row order is the sign order for the multi-member roles.
    const idsFor = (role: string) => [...new Set(editPeople
      .filter((p) => p.role === role && p.email.trim())
      .map((p) => allUsers.find((u) => u.email.toLowerCase() === p.email.trim().toLowerCase())?.id)
      .filter((x): x is string => !!x))];
    try {
      await adminUpdateSubmission(sub.id, {
      title:               editDraft.title.trim(),
      advisorId:           idsFor("ADVISOR")[0]          ?? null,
      studentFullName:     editDraft.studentFullName      || null,
      studentCode:         editDraft.studentCode          || null,
      program:             editDraft.program              || null,
      studentEmail:        editDraft.studentEmail         || null,
      studentPhone:        editDraft.studentPhone         || null,
      coAdvisorIds:        idsFor("CO_ADVISOR"),
      programChairId:      resolvedProgramChair?.id        || null,
      headCommitteeId:     idsFor("HEAD_EXAM_COMMITTEE")[0] ?? null,
      committeeIds:        idsFor("EXAM_COMMITTEE"),
      invitedCommitteeIds: idsFor("INVITED_EXAM_COMMITTEE"),
      examDate:            editDraft.examDate             || null,
      examTime:            editDraft.examTime             || null,
      roomNeeded:          editDraft.roomNeeded,
      parkingNeeded:       editDraft.parkingNeeded,
      carPlate:            editDraft.carPlate             || null,
      });
      setEditMode(false);
    } catch (err) {
      showToast(toUserErrorMessage(err, "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง"), "error");
    }
  }

  async function handleDelete() {
    if (!sub) return;
    try {
      await adminDeleteSubmission(sub.id);
      showToast("ลบคำร้องแล้ว");
      onDeleted?.();
    } catch (err) {
      showToast(toUserErrorMessage(err, "ลบไม่สำเร็จ กรุณาลองอีกครั้ง"), "error");
    }
  }

  function pickPending(key: string, file: File | null) {
    setActionError(null);
    setPendingFiles((prev) => {
      const next = { ...prev };
      if (file) next[key] = file; else delete next[key];
      return next;
    });
  }

  async function handleApproveStep() {
    if (!sub || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      // Upload the files picked in the card first (each one is removed from the list once stored,
      // so a retry after a failed approve doesn't upload it twice), then approve
      for (const [key, file] of Object.entries(pendingFiles)) {
        await postUpload(sub.id, key, file);
        setPendingFiles((prev) => { const next = { ...prev }; delete next[key]; return next; });
      }
      await approveCurrentStep(sub.id, approveNotes || undefined);
      setApproveNotes("");
      setAdminCheckState({});
      showToast("อนุมัติเรียบร้อยแล้ว ✓");
    } catch (err) {
      setActionError(toUserErrorMessage(err, "อนุมัติไม่สำเร็จ กรุณาลองอีกครั้ง"));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleReturnToPrev() {
    if (!sub || actionBusy) return;
    setActionBusy(true);
    try {
      await returnToPrevStep(sub.id, actionNotes.trim() || undefined);
      setActionMode(null);
      setActionNotes("");
      setActionError(null);
      showToast("ส่งกลับเรียบร้อยแล้ว", "info");
    } catch (err) {
      setActionError(toUserErrorMessage(err, "ส่งกลับไม่สำเร็จ กรุณาลองอีกครั้ง"));
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Admin badge */}
      <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5">
        <ShieldCheck className="w-5 h-5 text-orange-500 shrink-0" />
        <span className="text-sm font-semibold text-orange-700">
          โหมด Admin — สามารถจัดการและแก้ไขทุกขั้นตอนได้
        </span>
      </div>

      {/* Header + edit */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-4">
        <div className="flex items-start flex-wrap gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-snug">{sub.title}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SubmissionStatusBadge status={sub.status} />
            {!editMode ? (
              <button
                onClick={enterEditMode}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-xl transition"
              >
                <Pencil className="w-4 h-4" />
                แก้ไข
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={saveEdit} className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setEditMode(false)} className="p-2 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Cancellation request — needs ADMIN accept/decline; everything else is frozen meanwhile */}
        {sub.cancelRequested && (
          <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <XCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-800">นิสิตขอยกเลิกคำร้องนี้</p>
                <p className="text-sm text-red-600 mt-0.5">
                  คำร้องถูกระงับจนกว่าท่านจะอนุมัติหรือปฏิเสธคำขอนี้
                  {sub.submissionType === "PROPOSAL" && " หากอนุมัติ คำร้องขอสอบวิทยานิพนธ์ที่เกี่ยวข้อง (ถ้ามี) จะถูกยกเลิกไปด้วย"}
                </p>
              </div>
            </div>
            {confirmAcceptCancel ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-700 font-medium flex-1">ยืนยันอนุมัติการยกเลิก?</span>
                <button
                  onClick={handleAcceptCancel}
                  disabled={cancelActionBusy}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 transition"
                >
                  {cancelActionBusy ? "กำลังดำเนินการ..." : "ยืนยัน"}
                </button>
                <button
                  onClick={() => setConfirmAcceptCancel(false)}
                  disabled={cancelActionBusy}
                  className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 transition"
                >
                  ยกเลิก
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmAcceptCancel(true)}
                  className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition"
                >
                  อนุมัติการยกเลิก
                </button>
                <button
                  onClick={handleDeclineCancel}
                  disabled={cancelActionBusy}
                  className="flex-1 py-2.5 bg-white border border-red-300 text-red-700 text-sm font-semibold rounded-xl hover:bg-red-50 disabled:opacity-50 transition"
                >
                  ปฏิเสธคำขอ
                </button>
              </div>
            )}
          </div>
        )}

        {/* Meta info — view mode only */}
        {!editMode && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-400 mb-0.5">นิสิต</p>
              <p className="font-medium text-gray-800">{student ? formatUserName(student) : undefined}</p>
              {student?.studentId && <p className="text-gray-400 text-xs">{student.studentId}</p>}
            </div>
            <div>
              <p className="text-gray-400 mb-0.5">อาจารย์ที่ปรึกษา</p>
              <p className="font-medium text-gray-800">{advisor ? formatUserName(advisor) : "—"}</p>
            </div>
            <div>
              <p className="text-gray-400 mb-0.5">วันที่ยื่น</p>
              <p className="font-medium text-gray-800">{formatDate(sub.createdAt)}</p>
            </div>
          </div>
        )}

        {/* View mode: detailed info sections */}
        {!editMode && (sub.examDate || sub.program || sub.headCommitteeId || sub.committeeIds?.length || sub.studentFullName) && (
          <div className="border-t border-gray-100 pt-4 space-y-4">
            {(sub.studentFullName || sub.studentCode || sub.program || sub.studentEmail || sub.studentPhone) && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-sm text-gray-400"><User className="w-3.5 h-3.5" />ข้อมูลนิสิต</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                  {sub.studentFullName && <AdminInfoItem label="ชื่อ-นามสกุล" value={sub.studentFullName} />}
                  {sub.studentCode && <AdminInfoItem label="รหัสนิสิต" value={sub.studentCode} />}
                  {sub.program && <AdminInfoItem label="หลักสูตร" value={PROGRAM_LABELS[sub.program] ?? sub.program} />}
                  {sub.studentEmail && <AdminInfoItem label="อีเมล" value={sub.studentEmail} />}
                  {sub.studentPhone && <AdminInfoItem label="เบอร์โทร" value={sub.studentPhone} />}
                </div>
              </div>
            )}
            {(advisor || sub.headCommitteeId || (sub.coAdvisorIds?.length ?? 0) > 0 || (sub.committeeIds?.length ?? 0) > 0 || (sub.invitedCommitteeIds?.length ?? 0) > 0) && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-sm text-gray-400"><Users className="w-3.5 h-3.5" />คณะกรรมการและผู้เกี่ยวข้อง</div>
                <div className="space-y-1.5">
                  {([
                    { label: "อาจารย์ที่ปรึกษา",    ids: sub.advisorId ? [sub.advisorId] : [] },
                    { label: "อาจารย์ที่ปรึกษาร่วม", ids: sub.coAdvisorIds ?? [] },
                    { label: "ประธานหลักสูตร",       ids: (sub as any).programChairId ? [(sub as any).programChairId] : [] },
                    { label: "ประธานกรรมการสอบ",    ids: sub.headCommitteeId ? [sub.headCommitteeId] : [] },
                    { label: "กรรมการสอบ",           ids: sub.committeeIds ?? [] },
                    { label: "กรรมการภายนอก",        ids: sub.invitedCommitteeIds ?? [] },
                  ] as { label: string; ids: string[] }[]).flatMap(({ label, ids }) =>
                    ids.map((uid, i) => {
                      const u = allUsers.find((x) => x.id === uid);
                      return (
                        <div key={`${label}-${uid}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1 border-b border-gray-50 last:border-0">
                          <p className="text-xs text-gray-400 w-32 shrink-0">{ids.length > 1 ? `${label} ${i + 1}` : label}</p>
                          <p className="text-sm font-medium text-gray-800">
                            {u ? formatUserName(u) : uid}
                            {u?.affiliation && <span className="text-gray-400 font-normal"> · {u.affiliation}</span>}
                          </p>
                          {u?.email && <a href={`mailto:${u.email}`} className="text-xs text-blue-500 hover:underline">{u.email}</a>}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
            {(sub.examDate || sub.roomNeeded || (sub.parkingNeeded && sub.carPlate)) && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-sm text-gray-400"><CalendarDays className="w-3.5 h-3.5" />กำหนดการสอบ</div>
                <div className="space-y-2">
                  {sub.examDate && <AdminInfoRow label="วันที่สอบ" value={`${sub.examDate}${sub.examTime ? ` เวลา ${sub.examTime} น.` : ""}`} />}
                  {sub.roomNeeded && <AdminInfoRow label="ห้องประชุม" value="ต้องการ" />}
                  {sub.parkingNeeded && sub.carPlate && <AdminInfoRow label="ทะเบียนรถ" value={sub.carPlate} />}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Edit mode: full edit form */}
        {editMode && (
          <div className="border-t border-gray-100 pt-4 space-y-5">

            {/* ข้อมูลวิทยานิพนธ์ / ข้อมูลนิสิต / ผู้รับผิดชอบ — same sections, fields and layout as the
                student's draft form (ProposalDraftReview). Unlike the student, the admin may also
                correct the student-info snapshot (name/code/email), so those are inputs, not
                read-only. */}
            <Section icon={<Info className="w-4 h-4" />} title="ข้อมูลวิทยานิพนธ์">
              <Field label="ชื่อหัวข้อวิทยานิพนธ์" required>
                <input
                  value={editDraft.title}
                  onChange={(e) => upd("title", e.target.value)}
                  className={INPUT}
                  placeholder="เช่น การพัฒนาระบบ..."
                  autoFocus
                />
              </Field>
            </Section>

            <Section icon={<User className="w-4 h-4" />} title="ข้อมูลนิสิต">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="ชื่อ-นามสกุล">
                  <input value={editDraft.studentFullName} onChange={(e) => upd("studentFullName", e.target.value)} className={INPUT} />
                </Field>
                <Field label="รหัสนิสิต">
                  <input value={editDraft.studentCode} onChange={(e) => upd("studentCode", e.target.value)} className={INPUT} />
                </Field>
                <Field label="หลักสูตร" required>
                  <select value={editDraft.program} onChange={(e) => upd("program", e.target.value)} className={INPUT + " bg-white"}>
                    <option value="">— เลือกหลักสูตร —</option>
                    {(Object.entries(PROGRAM_LABELS) as [string, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </Field>
                <ProgramChairAutoField program={editDraft.program} users={allUsers} />
                <Field label="อีเมล">
                  <input type="email" value={editDraft.studentEmail} onChange={(e) => upd("studentEmail", e.target.value)} className={INPUT} />
                </Field>
                <Field label="เบอร์โทรศัพท์">
                  <input value={editDraft.studentPhone} onChange={(e) => upd("studentPhone", e.target.value)} className={INPUT} placeholder="0812345678" />
                </Field>
              </div>
            </Section>

            <Section icon={<Users className="w-4 h-4" />} title="ผู้รับผิดชอบวิทยานิพนธ์">
              <CommitteePeopleEditor
                people={editPeople}
                setPeople={setEditPeople}
                clearError={() => {}}
                program={editDraft.program}
              />
            </Section>

            {/* Exam schedule — the same section the student uses. An admin may be correcting the
                record after the exam, so a past date is allowed here. */}
            <ExamLogisticsSection
              examDate={editDraft.examDate}           setExamDate={(v) => upd("examDate", v)}
              examTime={editDraft.examTime}           setExamTime={(v) => upd("examTime", v)}
              roomNeeded={editDraft.roomNeeded}       setRoomNeeded={(v) => upd("roomNeeded", v)}
              parkingNeeded={editDraft.parkingNeeded} setParkingNeeded={(v) => upd("parkingNeeded", v)}
              carPlate={editDraft.carPlate}           setCarPlate={(v) => upd("carPlate", v)}
              clearError={() => {}}
              allowPastDate
            />
          </div>
        )}

        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${totalSteps > 0 ? (doneCount / totalSteps) * 100 : 0}%` }}
            />
          </div>
          <span className="text-sm font-medium text-gray-600 shrink-0">{doneCount}/{totalSteps} ขั้น</span>
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Left: Steps control */}
        <div className="space-y-4">
          {/* Tab switch */}
          <div className="flex border-b border-gray-200 bg-white rounded-t-2xl px-4">
            <button
              onClick={() => setActiveTab("steps")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === "steps"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              🎛️ จัดการแต่ละขั้นตอน
            </button>
            <button
              onClick={() => setActiveTab("timeline")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === "timeline"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              📋 ไทม์ไลน์
            </button>
          </div>

          {activeTab === "steps" ? (
            <div className="space-y-3">
              {sub.workflowSteps.filter((s) => s.status !== "SKIPPED").map((step) => {
                const allIdx = sub.workflowSteps.indexOf(step);
                // Walk backwards skipping SKIPPED steps (which have actedAt: null) to find last real timestamp
                const prevActedAt = sub.workflowSteps
                  .slice(0, allIdx)
                  .reverse()
                  .find((s) => s.actedAt != null)?.actedAt ?? null;
                const allStepUploads = sub.uploads.filter((u) => {
                  const t = new Date(u.uploadedAt).getTime();
                  const from = prevActedAt ? new Date(prevActedAt).getTime() : 0;
                  const to = step.actedAt ? new Date(step.actedAt).getTime() : Infinity;
                  return t >= from && t <= to;
                });
                // Deduplicate: one entry per formType — and per member for per-member forms (the
                // defense's บ.3, one copy per committee member) — most recent wins
                const _byType = new Map<string, MockUpload>();
                for (const u of allStepUploads) {
                  const key = `${u.formType}:${u.memberId ?? ""}`;
                  const ex = _byType.get(key);
                  if (!ex || new Date(u.uploadedAt) > new Date(ex.uploadedAt)) _byType.set(key, u);
                }
                const stepUploads = Array.from(_byType.values());

                // Resolve who is assigned to this step
                let assignedName: string | null = null;
                if (step.role === "STUDENT") assignedName = student ? formatUserName(student) : null;
                else if (step.role === "ADMIN") { const u = allUsers.find((u) => u.roles.includes("ADMIN")); assignedName = u ? formatUserName(u) : null; }
                else if (step.role === "ADVISOR") assignedName = advisor ? formatUserName(advisor) : null;
                else if (step.role === "CO_ADVISOR") assignedName = (sub.coAdvisorIds ?? []).map((uid: string) => { const u = allUsers.find((u) => u.id === uid); return u ? formatUserName(u) : uid; }).join(", ") || null;
                else if (step.role === "HEAD_EXAM_COMMITTEE") { const u = allUsers.find((u) => u.id === sub.headCommitteeId); assignedName = u ? formatUserName(u) : null; }
                else if (step.role === "INVITED_EXAM_COMMITTEE") assignedName = (sub.invitedCommitteeIds ?? []).map((uid: string) => { const u = allUsers.find((u) => u.id === uid); return u ? formatUserName(u) : uid; }).join(", ") || null;
                else if (step.role === "DEPARTMENT_CHAIR") { const u = allUsers.find((u) => u.isDepartmentChair); assignedName = u ? formatUserName(u) : null; }
                else if (step.role === "PROGRAM_CHAIR") {
                  const u = allUsers.find((u) => u.id === (sub as any).programChairId)
                    ?? (sub.program ? allUsers.find((u) => (u as any).programChairFor?.includes(sub.program)) : undefined);
                  assignedName = u ? formatUserName(u) : null;
                }

                // Committee sign breakdown
                const committeeStatus = (step.role === "EXAM_COMMITTEE" || step.role === "CO_ADVISOR" || step.role === "INVITED_EXAM_COMMITTEE")
                  ? (step.committeeMembers?.length ? step.committeeMembers : (step.role === "CO_ADVISOR" ? (sub.coAdvisorIds ?? []) : step.role === "INVITED_EXAM_COMMITTEE" ? (sub.invitedCommitteeIds ?? []) : (sub.committeeIds ?? []))).map((uid) => {
                      const u = allUsers.find((u) => u.id === uid);
                      const action = step.committeeActions?.find((a) => a.userId === uid);
                      const stepApproved = step.status === "APPROVED";
                      return { name: u ? formatUserName(u) : uid, signed: stepApproved || !!action, approved: stepApproved || action?.decision === "APPROVED" };
                    })
                  : undefined;

                const isFutureStep = step.status === "PENDING" && step.stepOrder !== currentOrd;

                return (
                  <StepCard
                    key={step.id}
                    step={step}
                    stepUploads={isFutureStep ? [] : stepUploads}
                    isCurrentStep={step.stepOrder === currentOrd}
                    assignedName={assignedName}
                    committeeStatus={committeeStatus}
                    submissionType={sub.submissionType}
                    displayOrder={numbering.label(step.stepOrder)}
                    onOverride={(stepOrder, action, notes) =>
                      adminOverrideStep(sub.id, stepOrder, action, notes)
                    }
                    onSendBack={step.stepOrder === currentOrd && step.status === "PENDING" && previousActiveStep(sub.workflowSteps, step)
                      ? (notes) => returnToPrevStep(sub.id, notes)
                      : undefined}
                  />
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-b-2xl border border-gray-200 border-t-0 p-4 sm:p-6">
              <WorkflowTimeline steps={sub.workflowSteps} users={allUsers} submissionType={sub.submissionType} submission={sub} />
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">

          {/* Task description card — numbered instructions for special admin steps */}
          {!sub.cancelRequested && isMyTurn && sub.status !== "REJECTED" && (isThesisRelayStep || isThesisForwardStep || isThesisResultCheckStep || isThesisResultSendStep
            || isThesisDocCheckStep || isThesisDocSendStep || isThesisDocForwardStep
            || (sub.submissionType === "PROPOSAL" && (isFinanceReviewStep || isProposalVerifyStep || isProposalCoverStep))) && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-500" />
                <h2 className="font-semibold text-blue-800">
                  สิ่งที่ต้องดำเนินการ
                </h2>
              </div>
              {sub.submissionType === "PROPOSAL" && isFinanceReviewStep ? (
                <ol className="list-decimal list-inside space-y-1.5 pl-1 text-sm text-gray-700">
                  <li>ตรวจสอบ บ.วศ.1 ที่นิสิตอัปโหลด (บ.วศ.1ก + 1ข) และรายชื่อคณะกรรมการ</li>
                  <li>สร้างเอกสารการเงินแนบกรรมการสอบ (แก้ไขและอัปโหลดใหม่ได้หากจำเป็น)</li>
                  <li>ทำเครื่องหมายรายการตรวจสอบ แล้วกดอนุมัติ — ระบบจะส่งเอกสารการเงินทางอีเมล</li>
                </ol>
              ) : isProposalVerifyStep ? (
                <ol className="list-decimal list-inside space-y-1.5 pl-1 text-sm text-gray-700">
                  <li>ตรวจสอบ บ.วศ.1 ฉบับล่าสุดที่คณะกรรมการลงนามครบแล้ว</li>
                  <li>แก้ไขชื่อหัวข้อวิทยานิพนธ์ในระบบให้ตรงกับ บ.วศ.1ง (ปุ่ม &quot;แก้ไข&quot; ด้านบน)</li>
                  <li>ทำเครื่องหมายรายการตรวจสอบ แล้วกดอนุมัติ — ระบบจะแจ้งประธานหลักสูตรให้ลงนาม</li>
                </ol>
              ) : isProposalCoverStep ? (
                <ol className="list-decimal list-inside space-y-1.5 pl-1 text-sm text-gray-700">
                  <li>ตรวจสอบ บ.วศ.1ก–ง ฉบับสุดท้ายว่าครบถ้วนและลงนามครบทุกจุด</li>
                  <li>เตรียมใบปะหน้าให้หัวหน้าภาควิชาลงนาม แล้วเลือกไฟล์ด้านล่าง</li>
                  <li>ทำเครื่องหมายรายการตรวจสอบ แล้วกดอนุมัติ — การสอบโครงร่างจะเสร็จสมบูรณ์</li>
                </ol>
              ) : isThesisRelayStep ? (
                <ol className="list-decimal list-inside space-y-1.5 pl-1 text-sm text-gray-700">
                  <li>พิมพ์ / รวบรวม บ.2 + บ.3 จากระบบ</li>
                  <li>เตรียมใบปะหน้าให้หัวหน้าภาควิชาลงนาม แล้วเลือกไฟล์ด้านล่าง</li>
                  <li>นำส่ง บ.2 + บ.3 พร้อมใบปะหน้าไปยังคณะวิศวกรรมศาสตร์</li>
                  <li>กดอนุมัติเพื่อยืนยันว่านำส่งแล้ว</li>
                </ol>
              ) : isThesisResultCheckStep ? (
                <ol className="list-decimal list-inside space-y-1.5 pl-1 text-sm text-gray-700">
                  <li>ตรวจสอบใบรายงานผลการสอบและแบบรายงานการเสนอผลงานฯ ฉบับล่าสุดในระบบ</li>
                  <li>ทำเครื่องหมายรายการตรวจสอบด้านล่าง แล้วกดอนุมัติ — ระบบจะแจ้งหัวหน้าภาควิชาให้ลงนาม</li>
                </ol>
              ) : isThesisResultSendStep ? (
                <ol className="list-decimal list-inside space-y-1.5 pl-1 text-sm text-gray-700">
                  <li>เตรียมใบปะหน้า แล้วเลือกไฟล์ด้านล่าง</li>
                  <li>ส่งอีเมลใบรายงานผลการสอบที่หัวหน้าภาควิชาลงนามแล้ว พร้อมใบปะหน้าไปยังคณะวิศวกรรมศาสตร์</li>
                  <li>ทำเครื่องหมายยืนยันว่าส่งอีเมลแล้ว และกดอนุมัติ</li>
                </ol>
              ) : isThesisDocCheckStep ? (
                <ol className="list-decimal list-inside space-y-1.5 pl-1 text-sm text-gray-700">
                  <li>ตรวจสอบ บ.4 และวิทยานิพนธ์ฉบับสมบูรณ์ที่นิสิตอัปโหลด</li>
                  <li>เตรียมใบปะหน้า แล้วเลือกไฟล์ด้านล่าง</li>
                  <li>ทำเครื่องหมายรายการตรวจสอบ แล้วกดอนุมัติ — ระบบจะแจ้งหัวหน้าภาควิชาให้ลงนาม</li>
                </ol>
              ) : isThesisDocSendStep ? (
                <ol className="list-decimal list-inside space-y-1.5 pl-1 text-sm text-gray-700">
                  <li>ส่งอีเมล บ.4 และวิทยานิพนธ์ที่หัวหน้าภาควิชาลงนามแล้ว พร้อมใบปะหน้าไปยังคณะวิศวกรรมศาสตร์</li>
                  <li>ทำเครื่องหมายยืนยันว่าส่งอีเมลแล้ว และกดอนุมัติ</li>
                </ol>
              ) : isThesisDocForwardStep ? (
                <ol className="list-decimal list-inside space-y-1.5 pl-1 text-sm text-gray-700">
                  <li>เมื่อได้รับเอกสารจากคณะวิศวกรรมศาสตร์ที่คณบดีลงนามแล้ว ให้ส่งต่อให้นิสิต</li>
                  <li>ทำเครื่องหมายยืนยัน และกดอนุมัติ — ระบบจะแจ้งนิสิตให้ยืนยันการส่งเอกสารเข้าระบบ iThesis</li>
                </ol>
              ) : (
                <ol className="list-decimal list-inside space-y-1.5 pl-1 text-sm text-gray-700">
                  <li>ส่งต่ออีเมลจากคณะวิศวกรรมศาสตร์ให้นิสิต</li>
                  <li>กดอนุมัติเพื่อยืนยันว่าส่งต่อแล้ว — ระบบจะแจ้งนิสิตให้อัปโหลดเอกสารต่อ</li>
                </ol>
              )}
            </div>
          )}

          {/* PROPOSAL step 2: generate the finance attachment from the submission's data */}
          {!sub.cancelRequested && isMyTurn && sub.status !== "REJECTED" && isFinanceReviewStep && (
            <ProposalFinanceGeneratePanel submissionId={sub.id} submissionTitle={sub.title} latest={latestFinanceAttach} />
          )}

          {/* Admin's action card — same parts and order as every other role's card:
              ① download (the step's documents to check) → ② upload (cover page, when the step has one)
              → checklist → notes → อนุมัติ, with ส่งกลับ beside it (admin steps never reject) */}
          {!sub.cancelRequested && isMyTurn && sub.status !== "REJECTED" && (
              <div className={ACTION_CARD}>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">ดำเนินการ</h3>
                  <p className="text-sm text-gray-500">ตรวจสอบเอกสาร แล้วเลือกการดำเนินการ</p>
                </div>

                {actionMode === null && (
                  <>
                    {adminStepForms && (
                      <div>
                        <SectionLabel n={1}>ดาวน์โหลดเอกสารเพื่อตรวจสอบ</SectionLabel>
                        {adminDownloads.length > 0 ? (
                          <div className="space-y-2">
                            {adminDownloads.map((d) => (
                              <DownloadRow key={d.upload.id} upload={d.upload} submissionTitle={sub.title} title={d.title} />
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-3 text-center">ยังไม่มีเอกสารในระบบสำหรับขั้นตอนนี้</p>
                        )}
                      </div>
                    )}

                    {/* Upload section — the step's own files, uploaded on อนุมัติ */}
                    {isCoverStep && (
                      <div>
                        <SectionLabel n={adminStepForms ? 2 : 1} required>
                          {isThesisRelayStep ? "อัปโหลดใบปะหน้าส่ง บ.2 + บ.3 ไปคณะวิศวกรรมศาสตร์"
                            : isThesisResultSendStep ? "อัปโหลดใบปะหน้าส่งใบรายงานผลการสอบไปคณะวิศวกรรมศาสตร์"
                            : isThesisDocCheckStep ? "อัปโหลดใบปะหน้าส่ง บ.4 + วิทยานิพนธ์ไปคณะวิศวกรรมศาสตร์"
                            : "อัปโหลดใบปะหน้าส่งคณะวิศวกรรมศาสตร์"}
                        </SectionLabel>
                        <p className="text-sm text-gray-600 mb-2">
                          ใบปะหน้า (PDF) ที่หัวหน้าภาควิชาลงนามแล้ว — หัวหน้าภาควิชา:{" "}
                          <span className="font-semibold">{deptChair ? formatUserName(deptChair) : "ยังไม่ได้กำหนด (ตั้งค่าได้ที่แท็บ \"ตั้งค่าระบบ\")"}</span>
                        </p>
                        <FileUploader
                          submissionId={sub.id}
                          formType="COVER_PAGE"
                          slotLabel={latestCover ? "ไฟล์ใหม่จะแทนที่ไฟล์ปัจจุบัน" : undefined}
                          existingUpload={latestCover}
                          selectedFile={pendingFiles.COVER_PAGE ?? null}
                          onFileSelect={(f) => pickPending("COVER_PAGE", f)}
                        />
                      </div>
                    )}

                    {adminChecks && (
                      <B1Checklist
                        title="ตรวจสอบก่อนอนุมัติ"
                        checks={adminChecks}
                        value={adminCheckState}
                        onChange={setAdminCheckState}
                      />
                    )}
                    <NotesField value={approveNotes} onChange={setApproveNotes} />
                    {isFinanceReviewStep && (
                      <p className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                        เมื่อกดอนุมัติ ระบบจะส่งเอกสารการเงินแนบกรรมการสอบไปยังเจ้าหน้าที่การเงินทางอีเมลโดยอัตโนมัติ
                      </p>
                    )}
                    {isProposalCoverStep && (
                      <p className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                        เมื่อกดอนุมัติ การสอบโครงร่างวิทยานิพนธ์จะเสร็จสมบูรณ์ และนิสิตจะสามารถยื่นขอสอบวิทยานิพนธ์ต่อได้
                      </p>
                    )}
                    {approveBlocked && (
                      <p className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <Info className="w-3.5 h-3.5 shrink-0" />
                        {isFinanceReviewStep && !latestFinanceAttach
                          ? "ต้องสร้างเอกสารการเงินก่อนจึงจะอนุมัติได้"
                          : isCoverStep && !latestCover && !pendingFiles.COVER_PAGE
                          ? "ต้องเลือกไฟล์ใบปะหน้าก่อนจึงจะอนุมัติได้"
                          : "กรุณาตรวจสอบและทำเครื่องหมายให้ครบทุกข้อก่อนอนุมัติ"}
                      </p>
                    )}
                    <ActionError message={actionError} />
                    <div className="flex gap-3">
                      <button
                        onClick={handleApproveStep}
                        disabled={actionBusy || approveBlocked}
                        className={`${PRIMARY_BUTTON} flex-1`}
                      >
                        {actionBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                        {actionBusy ? "กำลังดำเนินการ..." : "อนุมัติ"}
                      </button>
                      <button
                        onClick={() => { setActionMode("return"); setActionError(null); }}
                        disabled={actionBusy}
                        className={SEND_BACK_BUTTON}
                      >
                        <ArrowLeft className="w-5 h-5" />
                        ส่งกลับ
                      </button>
                    </div>
                  </>
                )}

                {/* Send-back form — replaces the card body, same as a signer's ปฏิเสธ form */}
                {actionMode === "return" && (
                  <>
                    <p className="text-sm font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                      {sendBackToStudent ? "ส่งกลับ — นิสิตต้องแก้ไขและส่งต่อใหม่" : "ส่งกลับ — ขั้นตอนก่อนหน้าต้องดำเนินการใหม่"}
                    </p>
                    <NotesField value={actionNotes} onChange={setActionNotes} sendBack />
                    <ActionError message={actionError} />
                    <div className="flex gap-3">
                      <button disabled={actionBusy} onClick={handleReturnToPrev} className={CONFIRM_SEND_BACK_BUTTON}>
                        {actionBusy && <Loader2 className="w-5 h-5 animate-spin" />}
                        {actionBusy ? "กำลังดำเนินการ..." : "ยืนยันส่งกลับ"}
                      </button>
                      <button
                        disabled={actionBusy}
                        onClick={() => { setActionMode(null); setActionNotes(""); setActionError(null); }}
                        className={CANCEL_BUTTON}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </>
                )}
              </div>
          )}

          {/* Waiting-for-resubmit — blocked until student fixes and resubmits */}
          {sub.status === "REJECTED" && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-red-700 font-semibold mb-1">
                <Clock className="w-5 h-5" />
                รอนิสิตแก้ไขและยื่นใหม่
              </div>
              <p className="text-red-600 text-sm mt-1">คำร้องถูกปฏิเสธ — นิสิตต้องแก้ไขแล้วกด &ldquo;ยื่นใหม่อีกครั้ง&rdquo; ก่อน ระบบจะส่งกลับให้ผู้พิจารณาตรวจสอบอีกครั้ง</p>
            </div>
          )}

          {/* Current status summary */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
            <h2 className="font-semibold text-gray-800">สถานะปัจจุบัน</h2>
            {currentOrd ? (
              <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                <Clock className="w-5 h-5 text-orange-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-orange-800">
                    ขั้นที่ {currentDisplayOrd}: {ROLE_LABELS[sub.workflowSteps.find((s) => s.stepOrder === currentOrd)?.role ?? "ADMIN"]}
                  </p>
                  <p className="text-xs text-orange-600">กำลังรอดำเนินการ</p>
                </div>
              </div>
            ) : sub.status === "COMPLETED" ? (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                <p className="text-sm font-semibold text-green-800">ผ่านทุกขั้นตอนแล้ว</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                <p className="text-sm font-semibold text-red-800">ถูกปฏิเสธ</p>
              </div>
            )}
          </div>

          {/* Delete */}
          <div className="bg-white rounded-2xl border border-red-200 p-5 space-y-3">
            <h2 className="font-semibold text-red-700">ลบคำร้อง</h2>
            {!confirmDel ? (
              <button
                onClick={() => setConfirmDel(true)}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-red-200 text-red-600 font-medium rounded-xl hover:bg-red-50 transition"
              >
                <Trash2 className="w-5 h-5" />
                ลบคำร้องนี้
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-red-600">
                  พิมพ์ <span className="font-bold font-mono">ลบ</span> เพื่อยืนยัน — การลบไม่สามารถกู้คืนได้
                </p>
                <input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="พิมพ์ว่า 'ลบ'"
                  className="w-full border border-red-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { if (deleteConfirm === "ลบ") handleDelete(); }}
                    disabled={deleteConfirm !== "ลบ"}
                    className="flex-1 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ยืนยันลบ
                  </button>
                  <button
                    onClick={() => { setConfirmDel(false); setDeleteConfirm(""); }}
                    className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Documents — last, below every action card; grouped by form type */}
          {sub.uploads.length > 0 && (
            <FileList uploads={sub.uploads} submissionTitle={sub.title} submissionType={sub.submissionType ?? "PROPOSAL"} />
          )}
        </div>
      </div>
    </div>
  );
}

function AdminInfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  );
}

function AdminInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <p className="text-xs text-gray-400 w-24 sm:w-32 shrink-0 pt-0.5">{label}</p>
      <p className="text-sm text-gray-800 flex-1 break-all">{value}</p>
    </div>
  );
}

