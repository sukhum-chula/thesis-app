"use client";

import { useState, ReactNode } from "react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { SubmissionStatusBadge, StepStatusBadge } from "@/components/StatusBadge";
import { FORM_LABELS, ROLE_LABELS, getStepName, PROGRAM_LABELS, formatBytes, formatDate, previewFile, toUserErrorMessage, formatUserName } from "@/lib/utils";
import { MockWorkflowStep, MockUpload } from "@/types";
import {
  ArrowLeft, Download, FileText, Pencil, Check, X,
  Trash2, ShieldCheck, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Clock, User, Users, CalendarDays, Upload, Loader2,
} from "lucide-react";
import { FileList } from "@/components/FileList";
import { UploadSlot } from "@/components/FileUploader";

// ─── Step control card ────────────────────────────────────────────────────────

function StepCard({
  step,
  isCurrentStep,
  onOverride,
  onReject,
  stepUploads,
  assignedName,
  committeeStatus,
  submissionType,
  displayOrder,
  financeAdminName,
}: {
  step: MockWorkflowStep;
  isCurrentStep: boolean;
  onOverride: (stepOrder: number, action: "APPROVED" | "REJECTED", notes?: string) => Promise<void>;
  onReject?: (notes?: string) => Promise<void>;
  stepUploads: MockUpload[];
  assignedName?: string | null;
  committeeStatus?: { name: string; signed: boolean; approved: boolean }[];
  submissionType?: string | null;
  displayOrder: number;
  financeAdminName?: string | null;
}) {
  const [open,    setOpen]    = useState(false);
  const [action,  setAction]  = useState<"APPROVED" | "REJECTED">("APPROVED");
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
          {financeAdminName && (
            <p className="text-sm text-yellow-700 flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              {financeAdminName} <span className="text-gray-400 text-xs">(อัปโหลดเอกสารการเงิน)</span>
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
          {/* APPROVED step: only ส่งกลับ (reset back to this step) */}
          {step.status === "APPROVED" && (
            <>
              <p className="text-sm font-medium text-gray-600">ส่งกลับมาขั้นนี้เพื่อดำเนินการใหม่:</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="เหตุผลการส่งกลับ (ไม่บังคับ)..."
                className="w-full border border-orange-300 rounded-xl p-3 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </>
          )}

          {/* PENDING / REJECTED step: อนุมัติ + ปฏิเสธ (ปฏิเสธ only on current step) */}
          {step.status !== "APPROVED" && (
            <>
              <p className="text-sm font-medium text-gray-600">บังคับเปลี่ยนสถานะขั้นนี้:</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setAction("APPROVED")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-medium text-sm transition ${
                    action === "APPROVED"
                      ? "bg-green-600 text-white"
                      : "bg-white border border-gray-200 text-gray-600 hover:border-green-400"
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  อนุมัติ
                </button>
                {isCurrentStep && onReject && (
                  <button
                    onClick={() => setAction("REJECTED")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-medium text-sm transition ${
                      action === "REJECTED"
                        ? "bg-red-600 text-white"
                        : "bg-white border border-gray-200 text-gray-600 hover:border-red-400"
                    }`}
                  >
                    <XCircle className="w-4 h-4" />
                    ปฏิเสธ
                  </button>
                )}
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={action === "REJECTED" ? "เหตุผลการปฏิเสธ (จำเป็น)..." : "หมายเหตุ (ไม่บังคับ)..."}
                className={`w-full border rounded-xl p-3 text-sm resize-none h-16 focus:outline-none focus:ring-2 ${
                  action === "REJECTED" ? "border-red-300 focus:ring-red-400" : "border-gray-200 focus:ring-orange-400"
                }`}
              />
            </>
          )}

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
                    // ส่งกลับ: reset from this step onward
                    await onOverride(step.stepOrder, "REJECTED", notes || undefined);
                  } else if (action === "REJECTED" && onReject) {
                    if (!notes.trim()) { setErrMsg("กรุณาระบุเหตุผลในการปฏิเสธ"); setSaving(false); return; }
                    // ปฏิเสธ: real rejection → student fixes and resubmits
                    await onReject(notes || undefined);
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
                step.status === "APPROVED" ? "bg-orange-500 hover:bg-orange-600"
                : action === "REJECTED" ? "bg-red-600 hover:bg-red-700"
                : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {saving ? "กำลังบันทึก..."
                : step.status === "APPROVED" ? "ยืนยันส่งกลับ"
                : action === "REJECTED" ? "ยืนยันปฏิเสธ"
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

// ─── Thesis step 8: faculty-return upload panel ───────────────────────────────

const FACULTY_SLOTS = [
  { key: "SIGNED",        formType: "SIGNED",        label: "แบบรายงานการเสนอผลงานทางวิชาการของนิสิต" },
  { key: "EXAM_RESULT",   formType: "EXAM_RESULT",   label: "ใบรายงานผลการสอบวิทยานิพนธ์" },
  { key: "INVITE_LETTER", formType: "INVITE_LETTER", label: "หนังสือเชิญกรรมการสอบ" },
  { key: "FINANCE_DOC",   formType: "FINANCE_DOC",   label: "เอกสารการเงิน" },
] as const;

function ThesisFacultyUploadPanel({ submissionId }: { submissionId: string }) {
  const { approveCurrentStep } = useApp();
  const { showToast }          = useToast();

  const [fileBySlot,    setFileBySlot]    = useState<Record<string, File | null>>({});
  const [uploadedSlots, setUploadedSlots] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const activeSlots = FACULTY_SLOTS;

  const allReady = activeSlots.every((s) => uploadedSlots.has(s.key) || !!fileBySlot[s.key]);

  async function handleSubmit() {
    if (!allReady) { setError("กรุณาเลือกไฟล์ให้ครบทุกช่องก่อน"); return; }
    setLoading(true);
    setError(null);
    try {
      for (const slot of activeSlots) {
        if (!uploadedSlots.has(slot.key) && fileBySlot[slot.key]) {
          const fd = new FormData();
          fd.append("file", fileBySlot[slot.key]!);
          fd.append("submissionId", submissionId);
          fd.append("formType", slot.formType);
          const res = await fetch("/api/upload", { method: "POST", body: fd });
          if (!res.ok) throw new Error("upload failed");
          setUploadedSlots((prev) => new Set([...prev, slot.key]));
        }
      }
      await approveCurrentStep(submissionId, undefined);
      showToast("อัปโหลดเอกสารและส่งต่อนิสิตเรียบร้อยแล้ว ✓");
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-5">
      <h3 className="text-lg font-semibold text-gray-800">ดำเนินการ — อัปโหลดเอกสารจากคณะ</h3>

      {/* Required 4 slots — same UploadSlot design as every other role */}
      <div className="space-y-3">
        {FACULTY_SLOTS.map((slot) => (
          <UploadSlot
            key={slot.key}
            formType={slot.formType}
            slotLabel={slot.label}
            selectedFile={fileBySlot[slot.key] ?? null}
            onFileSelect={(f) => { setFileBySlot((prev) => ({ ...prev, [slot.key]: f })); setError(null); }}
            done={uploadedSlots.has(slot.key)}
            doneLabel="อัปโหลดสำเร็จ"
            disabled={loading}
          />
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || !allReady}
        className="w-full flex items-center justify-center gap-2 py-3.5 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-60 transition"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
        {loading ? "กำลังบันทึก..." : "ส่งต่อนิสิต"}
      </button>
    </div>
  );
}

// ─── Proposal step-4 finance doc upload panel ────────────────────────────────

function ProposalFinanceUploadPanel({ submissionId }: { submissionId: string }) {
  const { refresh }  = useApp();
  const { showToast } = useToast();
  const [file,      setFile]      = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function handleSubmit() {
    if (!file) { setError("กรุณาเลือกไฟล์ก่อน"); return; }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("submissionId", submissionId);
      fd.append("formType", "FINANCE_DOC");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("upload failed");
      await refresh();
      showToast("อัปโหลดเอกสารการเงินเรียบร้อยแล้ว ✓");
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <UploadSlot
        formType="FINANCE_DOC"
        slotLabel="เอกสารการเงิน"
        selectedFile={file}
        onFileSelect={(f) => { setFile(f); setError(null); }}
        disabled={uploading}
      />
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      <button
        onClick={handleSubmit}
        disabled={uploading || !file}
        className="w-full flex items-center justify-center gap-2 py-3 bg-yellow-500 text-white font-semibold rounded-xl hover:bg-yellow-600 disabled:opacity-60 transition"
      >
        {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
        {uploading ? "กำลังอัปโหลด..." : "อัปโหลดเอกสาร"}
      </button>
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
  const { submissions, users, adminUpdateSubmission, adminDeleteSubmission, adminOverrideStep, approveCurrentStep, rejectCurrentStep, returnToPrevStep, adminAcceptCancel, adminDeclineCancel } = useApp();
  const { showToast } = useToast();
  const [cancelActionBusy, setCancelActionBusy] = useState(false);
  const [confirmAcceptCancel, setConfirmAcceptCancel] = useState(false);

  const sub = submissions.find((s) => s.id === submissionId);

  const pendingStep$ = sub?.workflowSteps.find((s) => s.status === "PENDING");
  const isMyTurn = pendingStep$?.role === "ADMIN";
  const isThesisRelayStep  = sub?.submissionType === "THESIS_DEFENSE" && pendingStep$?.stepOrder === 7;
  const isThesisUploadStep = sub?.submissionType === "THESIS_DEFENSE" && pendingStep$?.stepOrder === 8;
  const isProposalFinanceStep = sub?.submissionType === "PROPOSAL" && pendingStep$?.stepOrder === 4;
  const [approveNotes, setApproveNotes] = useState("");
  const [actionMode,   setActionMode]   = useState<"reject" | "return" | null>(null);
  const [actionNotes,  setActionNotes]  = useState("");
  const [actionBusy,   setActionBusy]   = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState({
    title: "", advisorId: "", studentFullName: "", studentCode: "", program: "",
    studentEmail: "", studentPhone: "",
    coAdvisorIds: ["", "", ""] as string[],
    headCommitteeId: "",
    committeeIds: ["", "", ""] as string[],
    invitedCommitteeIds: ["", "", ""] as string[],
    examDate: "", examTime: "", roomNeeded: false, parkingNeeded: false, carPlate: "",
  });
  const upd = (key: string, val: unknown) => setEditDraft((p) => ({ ...p, [key]: val }));
  const updArr = (key: "coAdvisorIds" | "committeeIds" | "invitedCommitteeIds", i: number, val: string) =>
    setEditDraft((p) => { const a = [...p[key]]; a[i] = val; return { ...p, [key]: a }; });
  const [confirmDel,  setConfirmDel]  = useState(false);
  const [activeTab,   setActiveTab]   = useState<"steps" | "timeline">("steps");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  if (!sub) {
    return <p className="text-center py-10 text-gray-400">ไม่พบข้อมูลคำร้อง</p>;
  }

  const allUsers   = users;
  const student    = allUsers.find((u) => u.id === sub.studentId);
  const advisor    = allUsers.find((u) => u.id === sub.advisorId);
  const advisors   = allUsers.filter((u) => u.roles.includes("PROFESSOR"));
  // CO_ADVISOR and EXAM_COMMITTEE can be filled by either an internal PROFESSOR or an external
  // examiner (see "Committee people" in AGENTS.md); INVITED_EXAM_COMMITTEE is external-only.
  const externals       = allUsers.filter((u) => u.roles.includes("EXTERNAL"));
  const mixedCommittee  = [...advisors, ...externals];
  // When REJECTED, no step is treated as "current" — future pending steps aren't highlighted
  const currentOrd        = sub.status === "REJECTED"
    ? null
    : sub.workflowSteps.find((s) => s.status === "PENDING")?.stepOrder ?? null;
  const visibleSteps      = sub.workflowSteps.filter((s) => s.status !== "SKIPPED");
  const currentDisplayOrd = currentOrd !== null
    ? (visibleSteps.findIndex((s) => s.stepOrder === currentOrd) + 1) || null
    : null;
  const doneCount  = visibleSteps.filter((s) => s.status === "APPROVED").length;
  const totalSteps = visibleSteps.length;
  // ประธานหลักสูตร is admin-designated per program (see "จัดการประธานหลักสูตร"), not freely
  // selectable per submission — it always follows whichever หลักสูตร is picked in the edit form.
  const resolvedProgramChair = editDraft.program
    ? advisors.find((a) => a.programChairFor?.includes(editDraft.program as never)) ?? null
    : null;

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
      advisorId:           sub.advisorId           ?? "",
      studentFullName:     sub.studentFullName      ?? "",
      studentCode:         sub.studentCode          ?? "",
      program:             sub.program              ?? "",
      studentEmail:        sub.studentEmail         ?? "",
      studentPhone:        sub.studentPhone         ?? "",
      coAdvisorIds:        [...(sub.coAdvisorIds    ?? []), "", "", ""].slice(0, 3),
      headCommitteeId:     sub.headCommitteeId      ?? "",
      committeeIds:        [...(sub.committeeIds    ?? []), "", "", ""].slice(0, 3),
      invitedCommitteeIds: [...(sub.invitedCommitteeIds ?? []), "", "", ""].slice(0, 3),
      examDate:            sub.examDate             ?? "",
      examTime:            sub.examTime             ?? "",
      roomNeeded:          sub.roomNeeded           ?? false,
      parkingNeeded:       sub.parkingNeeded        ?? false,
      carPlate:            sub.carPlate             ?? "",
    });
    setEditMode(true);
  }

  function saveEdit() {
    if (!sub || !editDraft.title.trim()) return;
    adminUpdateSubmission(sub.id, {
      title:               editDraft.title.trim(),
      advisorId:           editDraft.advisorId           || null,
      studentFullName:     editDraft.studentFullName      || null,
      studentCode:         editDraft.studentCode          || null,
      program:             editDraft.program              || null,
      studentEmail:        editDraft.studentEmail         || null,
      studentPhone:        editDraft.studentPhone         || null,
      coAdvisorIds:        editDraft.coAdvisorIds.filter(Boolean),
      programChairId:      resolvedProgramChair?.id        || null,
      headCommitteeId:     editDraft.headCommitteeId      || null,
      committeeIds:        editDraft.committeeIds.filter(Boolean),
      invitedCommitteeIds: editDraft.invitedCommitteeIds.filter(Boolean),
      examDate:            editDraft.examDate             || null,
      examTime:            editDraft.examTime             || null,
      roomNeeded:          editDraft.roomNeeded,
      parkingNeeded:       editDraft.parkingNeeded,
      carPlate:            editDraft.carPlate             || null,
    });
    setEditMode(false);
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

  async function handleApproveStep() {
    if (!sub || actionBusy) return;
    setActionBusy(true);
    try {
      await approveCurrentStep(sub.id, approveNotes || undefined);
      setApproveNotes("");
    } catch (err) {
      showToast(toUserErrorMessage(err, "อนุมัติไม่สำเร็จ กรุณาลองอีกครั้ง"), "error");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRejectStep() {
    if (!sub || actionBusy || !actionNotes.trim()) return;
    setActionBusy(true);
    try {
      await rejectCurrentStep(sub.id, actionNotes.trim());
      setActionMode(null);
      setActionNotes("");
    } catch (err) {
      showToast(toUserErrorMessage(err, "ปฏิเสธไม่สำเร็จ กรุณาลองอีกครั้ง"), "error");
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
    } catch (err) {
      showToast(toUserErrorMessage(err, "ส่งกลับไม่สำเร็จ กรุณาลองอีกครั้ง"), "error");
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
            {!editMode ? (
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-snug">{sub.title}</h1>
            ) : (
              <input
                value={editDraft.title}
                onChange={(e) => upd("title", e.target.value)}
                className="w-full text-xl font-bold border-2 border-blue-400 rounded-xl px-3 py-2 focus:outline-none"
                autoFocus
              />
            )}
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

            {/* Student info */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-sm text-gray-500 font-medium"><User className="w-3.5 h-3.5" />ข้อมูลนิสิต</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <EField label="ชื่อ-นามสกุล"><input value={editDraft.studentFullName} onChange={(e) => upd("studentFullName", e.target.value)} className={EDIT_INPUT_CLS} /></EField>
                <EField label="รหัสนิสิต"><input value={editDraft.studentCode} onChange={(e) => upd("studentCode", e.target.value)} className={EDIT_INPUT_CLS} /></EField>
                <EField label="หลักสูตร">
                  <select value={editDraft.program} onChange={(e) => upd("program", e.target.value)} className={EDIT_INPUT_CLS}>
                    <option value="">— ไม่ระบุ —</option>
                    {Object.entries(PROGRAM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </EField>
                <EField label="อีเมล"><input type="email" value={editDraft.studentEmail} onChange={(e) => upd("studentEmail", e.target.value)} className={EDIT_INPUT_CLS} /></EField>
                <EField label="เบอร์โทร"><input value={editDraft.studentPhone} onChange={(e) => upd("studentPhone", e.target.value)} className={EDIT_INPUT_CLS} /></EField>
              </div>
            </div>

            {/* Committee */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-sm text-gray-500 font-medium"><Users className="w-3.5 h-3.5" />คณะกรรมการและผู้เกี่ยวข้อง</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <EField label="อาจารย์ที่ปรึกษา">
                  <select value={editDraft.advisorId} onChange={(e) => upd("advisorId", e.target.value)} className={EDIT_INPUT_CLS}>
                    <option value="">— ไม่ระบุ —</option>
                    {advisors.map((a) => <option key={a.id} value={a.id}>{formatUserName(a)}</option>)}
                  </select>
                </EField>
                {[0, 1, 2].map((i) => (
                  <EField key={i} label={`อาจารย์ที่ปรึกษาร่วม ${i + 1}`}>
                    <select value={editDraft.coAdvisorIds[i] ?? ""} onChange={(e) => updArr("coAdvisorIds", i, e.target.value)} className={EDIT_INPUT_CLS}>
                      <option value="">— ไม่ระบุ —</option>
                      {mixedCommittee.map((a) => <option key={a.id} value={a.id}>{formatUserName(a)}</option>)}
                    </select>
                  </EField>
                ))}
                <EField label="ประธานหลักสูตร">
                  <div className={`${EDIT_INPUT_CLS} bg-gray-50 text-gray-700`}>
                    {resolvedProgramChair
                      ? formatUserName(resolvedProgramChair)
                      : editDraft.program
                        ? "— ยังไม่ได้กำหนดประธานหลักสูตรสำหรับหลักสูตรนี้ —"
                        : "— กรุณาเลือกหลักสูตรก่อน —"}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    กำหนดตามหลักสูตรโดยอัตโนมัติ — แก้ไขได้ที่การ์ด &ldquo;จัดการประธานหลักสูตร&rdquo; ในแท็บจัดการผู้ใช้งาน
                  </p>
                </EField>
                <EField label="ประธานกรรมการสอบ">
                  <select value={editDraft.headCommitteeId} onChange={(e) => upd("headCommitteeId", e.target.value)} className={EDIT_INPUT_CLS}>
                    <option value="">— ไม่ระบุ —</option>
                    {advisors.map((a) => <option key={a.id} value={a.id}>{formatUserName(a)}</option>)}
                  </select>
                </EField>
                {[0, 1, 2].map((i) => (
                  <EField key={i} label={`กรรมการสอบ ${i + 1}`}>
                    <select value={editDraft.committeeIds[i] ?? ""} onChange={(e) => updArr("committeeIds", i, e.target.value)} className={EDIT_INPUT_CLS}>
                      <option value="">— ไม่ระบุ —</option>
                      {mixedCommittee.map((a) => <option key={a.id} value={a.id}>{formatUserName(a)}</option>)}
                    </select>
                  </EField>
                ))}
              </div>

              {/* Invited external committee — up to 3, sign sequentially in list order */}
              <div className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
                <p className="text-xs font-medium text-gray-500">กรรมการภายนอก</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[0, 1, 2].map((i) => (
                    <EField key={i} label={`กรรมการภายนอก ${i + 1}`}>
                      <select value={editDraft.invitedCommitteeIds[i] ?? ""} onChange={(e) => updArr("invitedCommitteeIds", i, e.target.value)} className={EDIT_INPUT_CLS}>
                        <option value="">— ไม่ระบุ —</option>
                        {externals.map((a) => <option key={a.id} value={a.id}>{formatUserName(a)}</option>)}
                      </select>
                    </EField>
                  ))}
                </div>
              </div>
            </div>

            {/* Exam schedule */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-sm text-gray-500 font-medium"><CalendarDays className="w-3.5 h-3.5" />กำหนดการสอบ</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <EField label="วันที่สอบ"><input type="date" value={editDraft.examDate} onChange={(e) => upd("examDate", e.target.value)} className={EDIT_INPUT_CLS} /></EField>
                <EField label="เวลา"><input type="time" value={editDraft.examTime} onChange={(e) => upd("examTime", e.target.value)} className={EDIT_INPUT_CLS} /></EField>
                <label className="flex items-center gap-2 cursor-pointer pt-4">
                  <input type="checkbox" checked={editDraft.roomNeeded} onChange={(e) => upd("roomNeeded", e.target.checked)} className="w-4 h-4 rounded" />
                  <span className="text-sm text-gray-700">ต้องการห้องประชุม</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editDraft.parkingNeeded} onChange={(e) => upd("parkingNeeded", e.target.checked)} className="w-4 h-4 rounded" />
                  <span className="text-sm text-gray-700">ต้องการที่จอดรถ</span>
                </label>
                {editDraft.parkingNeeded && (
                  <EField label="ทะเบียนรถ"><input value={editDraft.carPlate} onChange={(e) => upd("carPlate", e.target.value)} className={EDIT_INPUT_CLS} /></EField>
                )}
              </div>
            </div>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left: Steps control */}
        <div className="lg:col-span-2 space-y-4">
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
              {sub.workflowSteps.filter((s) => s.status !== "SKIPPED").map((step, i, visible) => {
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
                // Deduplicate: one entry per formType (most recent wins)
                const _byType = new Map<string, MockUpload>();
                for (const u of allStepUploads) {
                  const ex = _byType.get(u.formType);
                  if (!ex || new Date(u.uploadedAt) > new Date(ex.uploadedAt)) _byType.set(u.formType, u);
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

                const financeAdminName =
                  sub.submissionType === "PROPOSAL" && step.stepOrder === 4
                    ? (() => { const u = allUsers.find((u) => u.roles.includes("ADMIN")); return u ? formatUserName(u) : null; })()
                    : null;

                return (
                  <StepCard
                    key={step.id}
                    step={step}
                    stepUploads={isFutureStep ? [] : stepUploads}
                    isCurrentStep={step.stepOrder === currentOrd}
                    assignedName={assignedName}
                    committeeStatus={committeeStatus}
                    submissionType={sub.submissionType}
                    displayOrder={i + 1}
                    financeAdminName={financeAdminName}
                    onOverride={(stepOrder, action, notes) =>
                      adminOverrideStep(sub.id, stepOrder, action, notes)
                    }
                    onReject={(notes) => rejectCurrentStep(sub.id, notes ?? "")}
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
          {!sub.cancelRequested && isMyTurn && sub.status !== "REJECTED" && (isThesisRelayStep || isThesisUploadStep) && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-500" />
                <h2 className="font-semibold text-blue-800">
                  {isThesisRelayStep ? "สิ่งที่ต้องดำเนินการ" : "สิ่งที่ต้องดำเนินการ"}
                </h2>
              </div>
              {isThesisRelayStep ? (
                <ol className="list-decimal list-inside space-y-1.5 pl-1 text-sm text-gray-700">
                  <li>พิมพ์ / รวบรวม บ.2 + บ.3 จากระบบ</li>
                  <li>นำส่งไปยังคณะวิศวกรรมศาสตร์</li>
                  <li>กดอนุมัติเพื่อยืนยันว่านำส่งแล้ว</li>
                </ol>
              ) : (
                <ol className="list-decimal list-inside space-y-1.5 pl-1 text-sm text-gray-700">
                  <li>รับเอกสารจากคณะวิศวกรรมศาสตร์</li>
                  <li>อัปโหลดเอกสารด้านล่าง</li>
                  <li>กดส่งต่อ — ระบบจะแจ้งนิสิตโดยอัตโนมัติ</li>
                </ol>
              )}
            </div>
          )}

          {/* Admin's action panel — SignatureButton for upload steps, simple approve for others */}
          {!sub.cancelRequested && isMyTurn && sub.status !== "REJECTED" && (
            isThesisUploadStep ? (
              <ThesisFacultyUploadPanel submissionId={sub.id} />
            ) : (
              <div className="bg-white border-2 border-blue-400 rounded-2xl p-5 space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">ดำเนินการ</h3>
                {!isThesisRelayStep && (
                  <p className="text-sm text-gray-500">ตรวจสอบเอกสาร แล้วเลือกการดำเนินการ</p>
                )}

                {/* Approve — always visible at top */}
                {actionMode !== "reject" && actionMode !== "return" && (
                  <div className="space-y-3">
                    <textarea
                      value={approveNotes}
                      onChange={(e) => setApproveNotes(e.target.value)}
                      placeholder="หมายเหตุ (ไม่บังคับ)..."
                      className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <button
                      onClick={handleApproveStep}
                      disabled={actionBusy}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {actionBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                      {actionBusy ? "กำลังดำเนินการ..." : "อนุมัติ"}
                    </button>
                  </div>
                )}

                {/* Reject form */}
                {actionMode === "reject" && (
                  <div className="space-y-3 border border-red-200 rounded-xl p-3 bg-red-50">
                    <p className="text-sm font-semibold text-red-700">ปฏิเสธ — นิสิตต้องแก้ไขและยื่นใหม่</p>
                    <textarea
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      placeholder="เหตุผลการปฏิเสธ..."
                      autoFocus
                      className="w-full border border-red-300 rounded-xl p-3 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                    <div className="flex gap-2">
                      <button
                        disabled={!actionNotes.trim() || actionBusy}
                        onClick={handleRejectStep}
                        className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                      >
                        {actionBusy ? "กำลังดำเนินการ..." : "ยืนยันปฏิเสธ"}
                      </button>
                      <button
                        disabled={actionBusy}
                        onClick={() => { setActionMode(null); setActionNotes(""); }}
                        className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                )}

                {/* Return-to-prev form */}
                {actionMode === "return" && (
                  <div className="space-y-3 border border-orange-200 rounded-xl p-3 bg-orange-50">
                    <p className="text-sm font-semibold text-orange-700">ส่งกลับ — ขั้นตอนก่อนหน้าต้องดำเนินการใหม่</p>
                    <textarea
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      placeholder="เหตุผล (ไม่บังคับ)..."
                      autoFocus
                      className="w-full border border-orange-300 rounded-xl p-3 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                    <div className="flex gap-2">
                      <button
                        disabled={actionBusy}
                        onClick={handleReturnToPrev}
                        className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {actionBusy ? "กำลังดำเนินการ..." : "ยืนยันส่งกลับ"}
                      </button>
                      <button
                        disabled={actionBusy}
                        onClick={() => { setActionMode(null); setActionNotes(""); }}
                        className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                )}

                {/* Reject / Return buttons */}
                {!actionMode && (
                  <div className="flex gap-2 pt-1 border-t border-gray-100">
                    <button
                      onClick={() => setActionMode("reject")}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border-2 border-red-200 text-red-600 font-semibold rounded-xl hover:bg-red-50 transition text-sm"
                    >
                      <XCircle className="w-4 h-4" />
                      ปฏิเสธ
                    </button>
                    <button
                      onClick={() => setActionMode("return")}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border-2 border-orange-200 text-orange-600 font-semibold rounded-xl hover:bg-orange-50 transition text-sm"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      ส่งกลับ
                    </button>
                  </div>
                )}
              </div>
            )
          )}

          {/* PROPOSAL step 4: upload FINANCE_DOC in parallel while student uploads B1C+B1D */}
          {isProposalFinanceStep && (
            sub.uploads.some((u) => u.formType === "FINANCE_DOC") ? (
              <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <h2 className="font-semibold text-green-800">อัปโหลดเอกสารการเงินแล้ว</h2>
                </div>
                <p className="text-sm text-gray-600">กำลังรอนิสิตส่ง บ.วศ.1ค + บ.วศ.1ง — ระบบจะดำเนินต่อโดยอัตโนมัติ</p>
              </div>
            ) : (
              <div className="bg-yellow-50 border-2 border-yellow-400 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-yellow-600" />
                  <h2 className="font-semibold text-yellow-800">อัปโหลดเอกสารการเงิน</h2>
                </div>
                <p className="text-sm text-gray-600">
                  ขณะที่นิสิตกำลังอัปโหลด บ.วศ.1ค + บ.วศ.1ง — ท่านต้องอัปโหลดเอกสารการเงินด้วย
                </p>
                <ProposalFinanceUploadPanel submissionId={sub.id} />
              </div>
            )
          )}

          {/* Waiting-for-resubmit — blocked until student fixes and resubmits */}
          {sub.status === "REJECTED" && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-red-700 font-semibold mb-1">
                <Clock className="w-5 h-5" />
                รอนิสิตแก้ไขและยื่นใหม่
              </div>
              <p className="text-red-600 text-sm mt-1">คำร้องถูกปฏิเสธ — นิสิตต้องกด "แก้ไขและยื่นใหม่" ก่อน ระบบจะส่งกลับให้ผู้พิจารณาตรวจสอบอีกครั้ง</p>
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

          {/* Documents — grouped by form type */}
          {sub.uploads.length > 0 && (
            <FileList uploads={sub.uploads} submissionTitle={sub.title} submissionType={sub.submissionType ?? "PROPOSAL"} />
          )}

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

const EDIT_INPUT_CLS = "w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white";

function EField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-gray-400">{label}</p>
      {children}
    </div>
  );
}
