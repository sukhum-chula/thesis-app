"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { FileUploader } from "@/components/FileUploader";
import { SubmissionStatusBadge } from "@/components/StatusBadge";
import { ROLE_LABELS, FORM_LABELS, FORM_SHORT, getStepName, formatDate, toUserErrorMessage, downloadFile } from "@/lib/utils";
import { PROGRAM_LABELS } from "@/lib/utils";
import { FormType } from "@/types";
import Link from "next/link";
import {
  ArrowLeft, Send, Upload, Download,
  AlertCircle, Clock, CheckCircle2, RefreshCw, StickyNote, CalendarDays, Car, XCircle, Trash2, User, Users, TriangleAlert,
  ArrowRight,
} from "lucide-react";
import { FileList } from "@/components/FileList";
import { useToast } from "@/context/ToastContext";

type StepSuggestion = { forms: FormType[]; label: string; multiUpload?: boolean; adminForms?: FormType[] };

// Per-type step suggestions — keyed by submissionType → stepOrder
const SUGGESTED_BY_STEP: Record<string, Record<number, StepSuggestion>> = {
  PROPOSAL: {
    1: { forms: ["BW1A", "BW1B", "FINANCE_ATTACH"], label: "บ.วศ.1ก + บ.วศ.1ข + เอกสารการเงินแนบกรรมการสอบ" },
    4: { forms: ["B1C", "B1D"], adminForms: ["FINANCE_DOC"], label: "บ.วศ.1ค + บ.วศ.1ง (กรอกข้อมูลครบถ้วน)" },
  },
  THESIS_DEFENSE: {
    1:  { forms: ["B2", "B3", "FINANCE_ATTACH"], label: "บ.2 + บ.3 + เอกสารการเงินแนบกรรมการสอบ" },
    9:  { forms: ["SIGNED"],       label: "แบบรายงานการเสนอผลงานฯ (กรอกข้อมูลและลงนามโดยนิสิต)" },
    16: { forms: ["B4", "THESIS"], label: "บ.4 (กรอกครบถ้วน) + วิทยานิพนธ์ฉบับสมบูรณ์ (จาก e-thesis พร้อม barcode)" },
  },
};

// Per-type submit button labels
const SUBMIT_LABEL: Record<string, Record<number, string>> = {
  PROPOSAL: {
    1: "ส่งต่อ",
    4: "ส่งต่อ",
  },
  THESIS_DEFENSE: {
    1:  "ส่งต่อ",
    9:  "ส่งต่อ",
    16: "ส่งต่อ",
  },
};

// Non-SIGNED forms allowed for early upload per submission type
const ALL_STUDENT_FORMS: Record<string, FormType[]> = {
  PROPOSAL:       ["BW1A", "BW1B", "FINANCE_ATTACH", "B1C", "B1D"],
  THESIS_DEFENSE: ["B2", "B3", "FINANCE_ATTACH", "B4", "THESIS"],
};

// Warnings shown above the uploader — reminder of what must be done BEFORE uploading
const FINANCE_ATTACH_TEMPLATE: Record<string, string> = {
  PROPOSAL:       "/templates/finance-attach-proposal.docx",
  THESIS_DEFENSE: "/templates/finance-attach-thesis.docx",
};

const FORM_UPLOAD_WARNINGS: Partial<Record<FormType, string>> = {
  BW1A:           "กรอกข้อมูลให้ครบถ้วน และให้อาจารย์ที่ปรึกษาลงนามก่อนอัปโหลด",
  BW1B:           "กรอกข้อมูลให้ครบถ้วนก่อนอัปโหลด",
  FINANCE_ATTACH: "ดาวน์โหลดแบบฟอร์ม กรอกข้อมูลให้ครบถ้วน แล้วอัปโหลดไฟล์ที่กรอกเสร็จแล้ว",
  B1C:   "กรอกข้อมูลให้ครบถ้วน — กรรมการจะลงนามผ่านระบบหลังอัปโหลด",
  B1D:   "กรอกข้อมูลให้ครบถ้วนก่อนอัปโหลด",
  B2:    "กรอกข้อมูลให้ครบถ้วนและลงนามโดยนิสิตก่อนอัปโหลด",
  B3:    "กรอกข้อมูลการสอบให้ครบถ้วนก่อนอัปโหลด",
  B4:    "กรอกข้อมูลให้ครบถ้วนก่อนอัปโหลด",
  THESIS: "ต้องเป็นไฟล์ที่ผ่านระบบ e-thesis ของจุฬาฯ และมี barcode กำกับเรียบร้อยแล้ว",
  SIGNED: "ต้องลงนามโดยนิสิตในเอกสารก่อนอัปโหลด",
};

export default function StudentSubmissionDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, submissions, users, approveCurrentStep, studentResubmit, requestCancelSubmission, continueDraft, refresh } = useApp();
  const { showToast } = useToast();
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Partial<Record<FormType, File>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmSigns, setConfirmSigns] = useState(false);
  const [confirmProgram, setConfirmProgram] = useState(false);
  const [continuing, setContinuing] = useState(false);

  const sub = submissions.find((s) => s.id === id);

  if (!sub || sub.studentId !== user?.id) {
    return (
      <div className="text-center py-20 text-gray-400 space-y-2">
        <p className="text-lg">ไม่พบข้อมูลคำร้อง</p>
        <Link href="/student-dashboard" className="text-blue-500 hover:underline">กลับหน้าหลัก</Link>
      </div>
    );
  }

  const allUsers     = users;
  const advisor      = allUsers.find((u) => u.id === sub.advisorId);
  const currentStep  = sub.workflowSteps.find((s) => s.status === "PENDING");
  const isMyTurn     = currentStep?.role === "STUDENT";
  const doneCount    = sub.workflowSteps.filter((s) => s.status === "APPROVED").length;
  const visibleSteps = sub.workflowSteps.filter((s) => s.status !== "SKIPPED");
  const totalSteps   = visibleSteps.length;
  // Display number matching the timeline (SKIPPED steps are hidden and renumbered)
  const currentDisplayOrder = currentStep
    ? visibleSteps.findIndex((s) => s.id === currentStep.id) + 1
    : 0;
  const subStatus    = sub.status;
  const uploadedTypes = new Set(sub.uploads.map((u) => u.formType));
  const lastActedDate = sub.workflowSteps
    .filter((s) => s.actedAt)
    .sort((a, b) => new Date(b.actedAt!).getTime() - new Date(a.actedAt!).getTime())[0]?.actedAt ?? null;
  const stuckDays = subStatus === "IN_PROGRESS" && !isMyTurn && lastActedDate
    ? Math.floor((Date.now() - new Date(lastActedDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const subType = sub.submissionType ?? "PROPOSAL";
  const linkedProposal = sub.sourceProposalId ? submissions.find((s) => s.id === sub.sourceProposalId) ?? null : null;
  const linkedDefense = subType === "PROPOSAL" ? submissions.find((s) => s.sourceProposalId === sub.id) ?? null : null;

  // At THESIS step 9 (student uploads แบบรายงานฯ), admin already uploaded SIGNED at step 8.
  // Filter those out so the checklist and uploader don't count the admin's file as the student's own.
  const step8ActedAt = (subType === "THESIS_DEFENSE" && currentStep?.stepOrder === 9)
    ? (() => {
        const s8 = sub.workflowSteps.find((s) => s.stepOrder === 8);
        return s8?.actedAt ? new Date(s8.actedAt).getTime() : 0;
      })()
    : null;
  const effectiveUploads = step8ActedAt !== null
    ? sub.uploads.filter((u) => u.formType !== "SIGNED" || new Date(u.uploadedAt).getTime() > step8ActedAt)
    : sub.uploads;

  // Files admin uploaded at step 8 that the student needs to download, fill, and sign at step 9
  const adminStep8Files = (step8ActedAt !== null && step8ActedAt > 0)
    ? sub.uploads.filter((u) => u.formType === "SIGNED" && new Date(u.uploadedAt).getTime() <= step8ActedAt)
    : [];

  const suggested = currentStep
    ? (SUGGESTED_BY_STEP[subType]?.[currentStep.stepOrder] ?? null)
    : null;
  const effectiveUploadedTypes = new Set(effectiveUploads.map((u) => u.formType));
  const remaining = (ALL_STUDENT_FORMS[subType] ?? []).filter((f) => !uploadedTypes.has(f));
  const requiredForms = suggested?.forms ?? [];
  const adminRequiredForms = suggested?.adminForms ?? [];
  const studentUploaded   = requiredForms.length === 0 || requiredForms.every((f) => effectiveUploadedTypes.has(f) || !!selectedFiles[f]);
  const adminUploaded     = adminRequiredForms.length === 0 || adminRequiredForms.every((f) => uploadedTypes.has(f));
  // True when student's required files are already in the DB (submitted this round), not just selected
  const studentFilesInDb  = requiredForms.length > 0 && requiredForms.every((f) => effectiveUploadedTypes.has(f));
  // Parallel step: student submitted their part but admin hasn't uploaded FINANCE_DOC yet
  const waitingForAdminUpload = isMyTurn && adminRequiredForms.length > 0 && studentFilesInDb && !adminUploaded;

  const needsSignConfirm   = subType === "THESIS_DEFENSE" && isMyTurn &&
    (currentStep?.stepOrder === 9 || currentStep?.stepOrder === 16);
  const needsProgramConfirm = subType === "THESIS_DEFENSE" && isMyTurn && currentStep?.stepOrder === 16;
  const preSubmitAllChecked = (!needsSignConfirm || confirmSigns) && (!needsProgramConfirm || confirmProgram);

  // Student can submit as soon as their own files are ready — FINANCE_DOC is handled by admin in parallel
  const allRequiredUploaded = studentUploaded && preSubmitAllChecked;

  // Forms the student should re-upload to fix a rejection — based on their most recent approved upload step
  const rejectedFixForms: FormType[] = (() => {
    if (subStatus !== "REJECTED") return [];
    const rejectedStep = sub.workflowSteps.find((s) => s.status === "REJECTED");
    const lastStudentStep = [...sub.workflowSteps]
      .filter((s) => s.role === "STUDENT" && s.status === "APPROVED" && s.stepOrder <= (rejectedStep?.stepOrder ?? 999))
      .sort((a, b) => b.stepOrder - a.stepOrder)[0];
    return lastStudentStep
      ? (SUGGESTED_BY_STEP[subType]?.[lastStudentStep.stepOrder]?.forms ?? [])
      : (ALL_STUDENT_FORMS[subType] ?? []);
  })();

  // Who is responsible for the current step (with name if available)
  function resolvePendingName(): string {
    if (!currentStep || !sub) return "";
    switch (currentStep.role) {
      case "ADVISOR":             return allUsers.find((u) => u.id === sub.advisorId)?.name ?? ROLE_LABELS[currentStep.role];
      case "HEAD_EXAM_COMMITTEE": return allUsers.find((u) => u.id === sub.headCommitteeId)?.name ?? ROLE_LABELS[currentStep.role];
      case "PROGRAM_CHAIR":
        return allUsers.find((u) => u.id === (sub as any).programChairId)?.name
          ?? allUsers.find((u) => (u as any).isProgramChair === true)?.name
          ?? ROLE_LABELS[currentStep.role];
      case "EXAM_COMMITTEE": {
        const memberIds = (currentStep.committeeMembers?.length ? currentStep.committeeMembers : (sub.committeeIds ?? [])) as string[];
        const done = ((currentStep.committeeActions ?? []) as any[]).filter((a) => a.decision === "APPROVED").length;
        const names = memberIds.map((uid) => allUsers.find((u) => u.id === uid)?.name ?? uid);
        return `${names.join(", ")} (ลงนามแล้ว ${done}/${memberIds.length})`;
      }
      default: return ROLE_LABELS[currentStep.role];
    }
  }

  async function handleCancelConfirm() {
    try {
      await requestCancelSubmission(sub!.id);
      setShowCancelModal(false);
      showToast("ส่งคำขอยกเลิกแล้ว — รอเจ้าหน้าที่อนุมัติ", "info");
    } catch (err) {
      setShowCancelModal(false);
      showToast(toUserErrorMessage(err), "error");
    }
  }

  async function handleContinueDraft() {
    setContinuing(true);
    try {
      await continueDraft(sub!.id);
      showToast("ยืนยันคำร้องแล้ว — เริ่มดำเนินการ", "info");
    } catch (err) {
      showToast(toUserErrorMessage(err), "error");
    } finally {
      setContinuing(false);
    }
  }

  function renderStatusBanner() {
    if (!sub) return null;

    if (sub.cancelRequested) {
      return (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 flex items-start gap-4">
          <Clock className="w-7 h-7 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-800 font-bold text-lg">รอเจ้าหน้าที่อนุมัติการยกเลิก</p>
            <p className="text-amber-600 text-sm mt-1">
              ท่านได้ส่งคำขอยกเลิกคำร้องนี้แล้ว — คำร้องจะถูกระงับจนกว่าเจ้าหน้าที่จะอนุมัติหรือปฏิเสธคำขอ
            </p>
          </div>
        </div>
      );
    }

    if (subStatus === "DRAFT") {
      const pending = (sub.pendingPeople ?? []) as { name?: string; email?: string; role?: string }[];
      const resolved = pending.map((p) => ({
        ...p,
        hasAccount: !!p.email && users.some((u) => u.email.toLowerCase() === p.email!.trim().toLowerCase()),
      }));
      const allResolved = resolved.length > 0 && resolved.every((p) => p.hasAccount);
      return (
        <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5 space-y-4">
          <div className="flex items-start gap-4">
            <StickyNote className="w-7 h-7 text-gray-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-gray-800 font-bold text-lg">คำร้องนี้เป็นฉบับร่าง</p>
              <p className="text-gray-500 text-sm mt-1">
                มีกรรมการที่ยังไม่มีบัญชีในระบบ — รอเจ้าหน้าที่สร้างบัญชีให้ก่อนจึงจะเริ่มดำเนินการได้
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            {resolved.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm bg-white rounded-xl px-3 py-2 border border-gray-100">
                {p.hasAccount
                  ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  : <Clock className="w-4 h-4 text-amber-500 shrink-0" />}
                <span className="flex-1 min-w-0 truncate">
                  <span className="font-medium text-gray-800">{p.name}</span>
                  <span className="text-gray-400"> · {ROLE_LABELS[p.role ?? ""] ?? p.role} · {p.email}</span>
                </span>
                <span className={`text-xs font-semibold shrink-0 ${p.hasAccount ? "text-green-600" : "text-amber-600"}`}>
                  {p.hasAccount ? "มีบัญชีแล้ว" : "รอสร้างบัญชี"}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={handleContinueDraft}
            disabled={!allResolved || continuing}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition ${
              allResolved && !continuing ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {continuing ? "กำลังดำเนินการ..." : "ดำเนินการต่อ"}
          </button>
        </div>
      );
    }

    if (subStatus === "CANCELLED") {
      return (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 flex items-start gap-4">
          <XCircle className="w-7 h-7 text-gray-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-gray-700 font-bold text-lg">ยกเลิกคำร้องแล้ว</p>
            <p className="text-gray-500 text-sm mt-1">คำร้องนี้ถูกยกเลิก — ท่านสามารถยื่นคำร้องใหม่ได้จากหน้าหลัก</p>
          </div>
        </div>
      );
    }

    if (subStatus === "COMPLETED") {
      return (
        <div className="bg-green-50 border border-green-300 rounded-2xl p-5 flex items-start gap-4">
          <span className="text-3xl">🎉</span>
          <div>
            <p className="text-green-800 font-bold text-lg">วิทยานิพนธ์ผ่านการอนุมัติครบทุกขั้นตอน</p>
            <p className="text-green-600 text-sm mt-1">ขอแสดงความยินดี!</p>
          </div>
        </div>
      );
    }

    if (subStatus === "REJECTED") {
      const rejectedStep = sub.workflowSteps.find((s) => s.status === "REJECTED");
      const rejectedStepName = rejectedStep
        ? (getStepName(rejectedStep.stepOrder, sub.submissionType) || ROLE_LABELS[rejectedStep.role])
        : null;
      return (
        <div className="bg-red-50 border border-red-300 rounded-2xl p-5 space-y-3">
          <div className="flex items-start gap-4">
            <span className="text-3xl">⚠️</span>
            <div className="flex-1">
              <p className="text-red-800 font-bold text-lg">คำร้องถูกปฏิเสธ</p>
              <p className="text-red-600 text-sm mt-0.5">
                จาก: {rejectedStep ? ROLE_LABELS[rejectedStep.role] : "ผู้รับผิดชอบ"}
              </p>
              {rejectedStep?.notes && (
                <p className="text-red-700 text-sm mt-2 bg-red-100 rounded-xl px-3 py-2">
                  เหตุผล: &ldquo;{rejectedStep.notes}&rdquo;
                </p>
              )}
            </div>
          </div>
          {rejectedStepName && (
            <p className="text-xs text-red-500 bg-red-100 rounded-lg px-3 py-2">
              แก้ไขเอกสารด้านขวา แล้วกด <span className="font-semibold">ยืนยันและยื่นใหม่</span> — ระบบจะส่งกลับให้ <span className="font-semibold">{rejectedStepName}</span> พิจารณาใหม่
            </p>
          )}
        </div>
      );
    }

    if (waitingForAdminUpload) {
      return (
        <div className="bg-green-50 border border-green-300 rounded-2xl p-5 flex items-start gap-4">
          <CheckCircle2 className="w-7 h-7 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-green-800 font-bold text-lg">ส่งเอกสารของท่านแล้ว</p>
            <p className="text-green-600 text-sm mt-1">กำลังรอเจ้าหน้าที่อัปโหลดเอกสารการเงิน — ระบบจะดำเนินต่อโดยอัตโนมัติเมื่อครบทั้งสองฝ่าย</p>
          </div>
        </div>
      );
    }

    if (isMyTurn) {
      return (
        <div className="bg-blue-50 border border-blue-300 rounded-2xl p-5 flex items-start gap-4">
          <AlertCircle className="w-7 h-7 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-blue-800 font-bold text-lg">ถึงคิวของท่านแล้ว</p>
            <p className="text-blue-600 text-sm mt-1">
              {suggested
                ? `กรุณาอัปโหลด${suggested.label} แล้วกดส่ง`
                : "กรุณาอัปโหลดเอกสารที่จำเป็น แล้วกดส่ง"}
            </p>
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/student-dashboard" className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-800 font-medium py-2 -my-2">
        <ArrowLeft className="w-5 h-5" />
        ย้อนกลับรายการ
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1 flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-snug">{sub.title}</h1>
          {advisor && (
            <p className="text-gray-500 text-sm">
              อาจารย์ที่ปรึกษา: <span className="font-medium text-gray-700">{advisor.name}</span>
            </p>
          )}
          <p className="text-sm text-gray-400">{formatDate(sub.createdAt)}</p>
        </div>
        <SubmissionStatusBadge status={sub.status} />
      </div>

      {/* Linked proposal / defense */}
      {linkedProposal && (
        <Link href={`/dashboard/student/${linkedProposal.id}`} className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" />
          มาจากคำร้องโครงร่าง: {linkedProposal.title}
        </Link>
      )}
      {linkedDefense && (
        <Link href={`/dashboard/student/${linkedDefense.id}`} className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:underline">
          ดูคำร้องขอสอบวิทยานิพนธ์ที่เกี่ยวข้อง: {linkedDefense.title}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}

      {/* Status banner */}
      {renderStatusBanner()}

      {/* Admin note */}
      {sub.adminNote && (
        <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
          <StickyNote className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-yellow-600 uppercase mb-1">บันทึกจากผู้ดูแลระบบ</p>
            <p className="text-yellow-800 text-sm">{sub.adminNote}</p>
          </div>
        </div>
      )}

      {/* Exam / committee info */}
      {(sub.studentFullName || sub.examDate || sub.program || sub.headCommitteeId || sub.advisorId || (sub.committeeIds?.length ?? 0) > 0 || (sub.coAdvisorIds?.length ?? 0) > 0 || sub.invitedCommitteeId) && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-5">

          {/* ข้อมูลนิสิต */}
          {(sub.studentFullName || sub.studentCode || sub.program || sub.studentEmail || sub.studentPhone) && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-sm text-gray-400"><User className="w-3.5 h-3.5" />ข้อมูลนิสิต</div>
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
                {sub.studentFullName && <InfoField label="ชื่อ-นามสกุล" value={sub.studentFullName} />}
                {sub.studentCode && <InfoField label="รหัสนิสิต" value={sub.studentCode} />}
                {sub.program && <InfoField label="หลักสูตร" value={PROGRAM_LABELS[sub.program] ?? sub.program} wide />}
                {sub.studentEmail && <InfoField label="อีเมล" value={sub.studentEmail} />}
                {sub.studentPhone && <InfoField label="เบอร์โทร" value={sub.studentPhone} />}
              </div>
            </div>
          )}

          {/* คณะกรรมการ */}
          {(advisor || sub.headCommitteeId || (sub.coAdvisorIds?.length ?? 0) > 0 || (sub.committeeIds?.length ?? 0) > 0 || sub.invitedProfName || sub.invitedCommitteeId) && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-sm text-gray-400"><Users className="w-3.5 h-3.5" />คณะกรรมการ</div>
              <div className="space-y-2">
                {advisor && (
                  <InfoRow label="อาจารย์ที่ปรึกษา" value={advisor.name} />
                )}
                {sub.headCommitteeId && (
                  <InfoRow label="ประธานกรรมการสอบ" value={allUsers.find((u) => u.id === sub.headCommitteeId)?.name ?? sub.headCommitteeId!} />
                )}
                {(sub.coAdvisorIds?.length ?? 0) > 0 && (
                  <InfoRow
                    label="อาจารย์ที่ปรึกษาร่วม"
                    value={(sub.coAdvisorIds ?? []).map((uid) => allUsers.find((u) => u.id === uid)?.name ?? uid).join(", ")}
                  />
                )}
                {(sub.committeeIds?.length ?? 0) > 0 && (
                  <div className="flex gap-4">
                    <p className="text-xs text-gray-400 w-32 shrink-0 pt-0.5">กรรมการสอบ</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(sub.committeeIds ?? []).map((uid) => (
                        <span key={uid} className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-lg">
                          {allUsers.find((u) => u.id === uid)?.name ?? uid}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {(sub.invitedProfName || sub.invitedCommitteeId) && (
                  <div className="pt-1 space-y-2">
                    <InfoRow
                      label="กรรมการภายนอก"
                      value={sub.invitedProfName ?? allUsers.find((u) => u.id === sub.invitedCommitteeId)?.name ?? sub.invitedCommitteeId!}
                    />
                    {sub.invitedProfAffiliation && <InfoRow label="สังกัด" value={sub.invitedProfAffiliation} />}
                    {sub.invitedProfEmail && <InfoRow label="อีเมลกรรมการภายนอก" value={sub.invitedProfEmail} />}
                    {sub.invitedProfPhone && <InfoRow label="เบอร์โทรกรรมการภายนอก" value={sub.invitedProfPhone} />}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* กำหนดการสอบ */}
          {(sub.examDate || sub.roomNeeded || (sub.parkingNeeded && sub.carPlate)) && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-sm text-gray-400"><CalendarDays className="w-3.5 h-3.5" />กำหนดการสอบ</div>
              <div className="space-y-2">
                {sub.examDate && (
                  <InfoRow
                    label="วันที่สอบ"
                    value={`${sub.examDate}${sub.examTime ? ` เวลา ${sub.examTime} น.` : ""}`}
                  />
                )}
                {sub.roomNeeded && <InfoRow label="ห้องประชุม" value="ต้องการ" />}
                {sub.parkingNeeded && sub.carPlate && <InfoRow label="ทะเบียนรถ" value={sub.carPlate} />}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress bar — no workflow steps exist yet while DRAFT */}
      {subStatus !== "DRAFT" && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${totalSteps > 0 ? (doneCount / totalSteps) * 100 : 0}%` }}
            />
          </div>
          <span className="text-sm font-medium text-gray-600 shrink-0">{doneCount}/{totalSteps} ขั้น</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Timeline — second on mobile so upload/action is reachable first */}
        {subStatus !== "DRAFT" && (
          <div className="order-2 md:order-none md:col-span-2 bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-5">ขั้นตอนทั้งหมด</h2>
            <WorkflowTimeline steps={sub.workflowSteps} users={allUsers} submissionType={sub.submissionType} submission={sub} />
          </div>
        )}

        {/* Right: files + upload — first on mobile */}
        <div className="order-1 md:order-none space-y-4">
          {/* Uploaded files — show only latest per type, no history */}
          {sub.uploads.length > 0 && (
            <FileList
              uploads={sub.uploads}
              submissionTitle={sub.title}
              submissionType={subType}
              compact
              hideHistory
            />
          )}

          {/* Cancel — outside the IN_PROGRESS states (which already show their own cancel button
              below): lets a PROPOSAL be started over even after REJECTED or already COMPLETED
              (cancelling also cancels any defense created off it), and lets an abandoned DRAFT
              (of either type) be given up on entirely. Requesting cancellation now requires
              ADMIN accept/decline — see the pending banner above once requested. */}
          {!sub.cancelRequested && (subType === "PROPOSAL" || subStatus === "DRAFT") && subStatus !== "IN_PROGRESS" && subStatus !== "CANCELLED" && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-300 text-gray-500 text-sm font-medium rounded-xl hover:bg-gray-50 hover:border-gray-400 transition"
            >
              <XCircle className="w-4 h-4" />
              ขอยกเลิกคำร้องนี้
            </button>
          )}

          {/* REJECTED: upload corrected docs then resubmit */}
          {!sub.cancelRequested && subStatus === "REJECTED" && (
            <div className="bg-white rounded-2xl border border-orange-200 p-4 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                  <Upload className="w-4 h-4 text-orange-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-800 text-sm">แก้ไขเอกสาร</h2>
                  <p className="text-xs text-gray-400">อัปโหลดไฟล์ที่แก้ไขแล้ว แล้วกดยืนยัน</p>
                </div>
              </div>

              {rejectedFixForms.map((ft) => {
                const existing = sub.uploads
                  .filter((u) => u.formType === ft)
                  .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0] ?? null;
                return (
                  <div key={ft} className="space-y-1">
                    {FORM_UPLOAD_WARNINGS[ft] && (
                      <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {FORM_UPLOAD_WARNINGS[ft]}
                      </p>
                    )}
                    <FileUploader
                      submissionId={sub.id}
                      formType={ft}
                      existingUpload={existing}
                      selectedFile={selectedFiles[ft] ?? null}
                      onFileSelect={(file) =>
                        setSelectedFiles((prev) => {
                          if (!file) { const next = { ...prev }; delete next[ft]; return next; }
                          return { ...prev, [ft]: file };
                        })
                      }
                    />
                  </div>
                );
              })}

              <button
                onClick={async () => {
                  setSubmitting(true);
                  try {
                    for (const [ft, file] of Object.entries(selectedFiles) as [FormType, File][]) {
                      const formData = new FormData();
                      formData.append("file", file);
                      formData.append("submissionId", sub.id);
                      formData.append("formType", ft);
                      const res = await fetch("/api/upload", { method: "POST", body: formData });
                      if (!res.ok) throw new Error(`upload failed: ${ft}`);
                    }
                    setSelectedFiles({});
                    await studentResubmit(sub.id);
                    showToast("ยื่นคำร้องใหม่แล้ว — กรุณาแนบเอกสารที่แก้ไข", "info");
                  } catch (err) {
                    showToast(toUserErrorMessage(err), "error");
                  } finally {
                    setSubmitting(false);
                  }
                }}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 transition"
              >
                {submitting ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> : <RefreshCw className="w-5 h-5" />}
                {submitting ? "กำลังส่ง..." : "ยืนยันและยื่นใหม่อีกครั้ง"}
              </button>
            </div>
          )}

          {/* Waiting — not the student's turn */}
          {!sub.cancelRequested && subStatus === "IN_PROGRESS" && !isMyTurn && !waitingForAdminUpload && currentStep && (
            <div className={`rounded-2xl p-5 space-y-3 ${stuckDays > 7 ? "bg-amber-50 border border-amber-300" : "bg-orange-50 border border-orange-200"}`}>
              <div className="flex items-start gap-3">
                <Clock className={`w-6 h-6 shrink-0 mt-0.5 ${stuckDays > 7 ? "text-amber-500" : "text-orange-500"}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-bold ${stuckDays > 7 ? "text-amber-800" : "text-orange-800"}`}>รอการดำเนินการ</p>
                    {stuckDays > 7 && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full font-semibold">
                        <TriangleAlert className="w-3 h-3" />
                        ค้างมา {stuckDays} วัน
                      </span>
                    )}
                  </div>
                  <p className={`text-sm mt-1 ${stuckDays > 7 ? "text-amber-600" : "text-orange-600"}`}>
                    ขั้นที่ {currentDisplayOrder} จาก {totalSteps}: <span className="font-semibold">{ROLE_LABELS[currentStep.role]}</span>
                  </p>
                  <p className={`text-sm font-medium ${stuckDays > 7 ? "text-amber-700" : "text-orange-700"}`}>{resolvePendingName()}</p>
                  <p className={`text-xs mt-1 ${stuckDays > 7 ? "text-amber-500" : "text-orange-400"}`}>
                    {stuckDays > 7
                      ? "คำร้องอาจค้างอยู่ — ลองติดต่อผู้รับผิดชอบโดยตรง"
                      : "ท่านไม่ต้องดำเนินการใดในขณะนี้"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCancelModal(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-300 text-gray-500 text-sm font-medium rounded-xl hover:bg-gray-50 transition"
              >
                <XCircle className="w-4 h-4" />
                ขอยกเลิกคำร้องนี้
              </button>
            </div>
          )}

          {/* Upload section — hide when student has already submitted and is waiting for admin */}
          {!sub.cancelRequested && subStatus === "IN_PROGRESS" && isMyTurn && !waitingForAdminUpload && (
            <div className="bg-white rounded-2xl border border-blue-100 p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                  <Upload className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-800 text-sm">
                    {suggested?.label ?? getStepName(currentStep?.stepOrder ?? 0, subType) ?? "อัปโหลดเอกสาร"}
                  </h2>
                  <p className="text-xs text-gray-400">เลือกไฟล์ PDF แล้วกดปุ่มส่ง</p>
                </div>
              </div>

              {/* Download section for THESIS step 9 — files admin uploaded at step 8 */}
              {adminStep8Files.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    ดาวน์โหลดเอกสารจากเจ้าหน้าที่ (กรอกข้อมูลและลงนามก่อนอัปโหลด)
                  </p>
                  {adminStep8Files.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => downloadFile(u.id, u.fileName, FORM_SHORT["SIGNED"] ?? FORM_LABELS["SIGNED"], sub.title, u.fileUrl)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 border border-blue-200 rounded-xl hover:bg-blue-50 transition text-left"
                    >
                      <Download className="w-4 h-4 text-blue-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-700 truncate">{FORM_LABELS["SIGNED"]}</p>
                        <p className="text-xs text-gray-400 truncate">{u.fileName}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Required docs checklist — only when it's the student's turn and there are required forms */}
              {isMyTurn && suggested && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 space-y-2">
                  <p className="text-xs font-semibold text-orange-700 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    เอกสารที่ต้องอัปโหลดก่อนส่ง
                    {suggested.multiUpload && <span className="font-normal">(อัปโหลดได้หลายไฟล์)</span>}
                  </p>
                  {suggested.forms.map((ft) => {
                    const alreadyUploaded = effectiveUploadedTypes.has(ft);
                    const fileSelected = !!selectedFiles[ft];
                    const done = alreadyUploaded || fileSelected;
                    return (
                      <div key={ft} className="flex items-center gap-2">
                        {done
                          ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                          : <XCircle className="w-4 h-4 text-orange-400 shrink-0" />}
                        <span className={`text-xs flex-1 ${done ? "text-green-700" : "text-gray-800 font-medium"}`}>
                          {FORM_LABELS[ft]}
                        </span>
                        <span className={`text-xs font-semibold shrink-0 ${done ? "text-green-500" : "text-orange-500"}`}>
                          {alreadyUploaded ? "✓ อัปโหลดแล้ว" : fileSelected ? "✓ เลือกแล้ว" : "รอ"}
                        </span>
                      </div>
                    );
                  })}
                  {adminRequiredForms.map((ft) => {
                    const done = uploadedTypes.has(ft);
                    return (
                      <div key={ft} className="flex items-center gap-2">
                        {done
                          ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                          : <Clock className="w-4 h-4 text-gray-400 shrink-0" />}
                        <span className={`text-xs flex-1 ${done ? "text-green-700" : "text-gray-500"}`}>
                          {FORM_LABELS[ft]} <span className="text-gray-400">(อัปโหลดโดยเจ้าหน้าที่)</span>
                        </span>
                        <span className={`text-xs font-semibold shrink-0 ${done ? "text-green-500" : "text-gray-400"}`}>
                          {done ? "✓ อัปโหลดแล้ว" : "รอ"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Uploaders for required forms — always show when it's the student's turn
                  so they can re-upload after a rejection without being blocked */}
              {suggested?.forms.map((ft, idx) => {
                  const existing = effectiveUploads
                    .filter((u) => u.formType === ft)
                    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0] ?? null;
                  const templateUrl = ft === "FINANCE_ATTACH" ? FINANCE_ATTACH_TEMPLATE[subType] : null;
                  return (
                    <div key={`${ft}-${idx}`} className="space-y-1">
                      {templateUrl && (
                        <a
                          href={templateUrl}
                          download
                          className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-2 hover:bg-blue-100 transition w-full"
                        >
                          <Upload className="w-3.5 h-3.5 shrink-0" />
                          ดาวน์โหลดแบบฟอร์มเอกสารการเงินแนบกรรมการสอบ (.docx)
                        </a>
                      )}
                      {FORM_UPLOAD_WARNINGS[ft] && (
                        <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          {FORM_UPLOAD_WARNINGS[ft]}
                        </p>
                      )}
                      <FileUploader
                        submissionId={sub.id}
                        formType={ft}
                        existingUpload={existing}
                        selectedFile={selectedFiles[ft] ?? null}
                        onFileSelect={(file) =>
                          setSelectedFiles((prev) => {
                            if (!file) {
                              const next = { ...prev };
                              delete next[ft];
                              return next;
                            }
                            return { ...prev, [ft]: file };
                          })
                        }
                      />
                    </div>
                  );
                })}

              {/* Optional remaining forms (not required for this step) */}
              {remaining.filter((f) => !suggested?.forms.includes(f)).map((ft) => {
                const existing = sub.uploads
                  .filter((u) => u.formType === ft)
                  .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0] ?? null;
                return (
                  <div key={ft} className="space-y-1">
                    {FORM_UPLOAD_WARNINGS[ft] && (
                      <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {FORM_UPLOAD_WARNINGS[ft]}
                      </p>
                    )}
                    <FileUploader
                      submissionId={sub.id}
                      formType={ft}
                      existingUpload={existing}
                      selectedFile={selectedFiles[ft] ?? null}
                      onFileSelect={(file) =>
                        setSelectedFiles((prev) => {
                          if (!file) { const next = { ...prev }; delete next[ft]; return next; }
                          return { ...prev, [ft]: file };
                        })
                      }
                    />
                  </div>
                );
              })}

              {/* Pre-submit confirmation checkboxes for THESIS_DEFENSE signing steps */}
              {needsSignConfirm && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    กรุณาตรวจสอบก่อนส่ง
                  </p>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmSigns}
                      onChange={(e) => setConfirmSigns(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-amber-600 shrink-0"
                    />
                    <span className="text-xs text-amber-800">
                      ลงนามในเอกสารครบ <strong>3 จุด</strong> เรียบร้อยแล้ว
                    </span>
                  </label>
                  {needsProgramConfirm && (
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmProgram}
                        onChange={(e) => setConfirmProgram(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-amber-600 shrink-0"
                      />
                      <span className="text-xs text-amber-800">
                        ตรวจสอบ<strong>ชื่อหลักสูตร</strong>ในเอกสารถูกต้องแล้ว
                      </span>
                    </label>
                  )}
                </div>
              )}

              {/* Submit button */}
              {isMyTurn && currentStep && (
                <>
                  <div className="space-y-1.5">
                    <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${studentUploaded ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                      {studentUploaded ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                      {studentUploaded ? "เลือกไฟล์ครบแล้ว พร้อมส่ง" : "ยังเลือกไฟล์ไม่ครบ"}
                    </div>
                    {adminRequiredForms.length > 0 && (
                      <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${adminUploaded ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                        {adminUploaded ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Clock className="w-4 h-4 shrink-0" />}
                        {adminUploaded ? "เจ้าหน้าที่อัปโหลดเอกสารการเงินแล้ว" : "รอเจ้าหน้าที่อัปโหลดเอกสารการเงิน"}
                      </div>
                    )}
                  </div>
                  <button
                    disabled={!allRequiredUploaded || submitting}
                    onClick={async () => {
                      setSubmitting(true);
                      try {
                        const toUpload = Object.entries(selectedFiles) as [FormType, File][];
                        for (const [ft, file] of toUpload) {
                          const formData = new FormData();
                          formData.append("file", file);
                          formData.append("submissionId", sub.id);
                          formData.append("formType", ft);
                          const res = await fetch("/api/upload", { method: "POST", body: formData });
                          if (!res.ok) throw new Error(`upload failed: ${ft}`);
                        }
                        setSelectedFiles({});
                        const res = await fetch(`/api/submissions/${sub.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "approve" }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error ?? "เกิดข้อผิดพลาด");
                        await refresh();
                        if (data.waitingForFinance) {
                          showToast("ส่งเอกสารแล้ว รอเจ้าหน้าที่อัปโหลดเอกสารการเงิน", "info");
                        } else {
                          const lbl = SUBMIT_LABEL[subType]?.[currentStep.stepOrder] ?? "ส่งเอกสารแล้ว";
                          showToast(`${lbl} ✓`);
                        }
                      } catch (err: any) {
                        showToast(err.message ?? "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง", "error");
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    className={`w-full flex items-center justify-center gap-2 py-3.5 text-white rounded-xl font-semibold transition ${
                      allRequiredUploaded && !submitting
                        ? "bg-blue-600 hover:bg-blue-700"
                        : "bg-gray-300 cursor-not-allowed"
                    }`}
                  >
                    {submitting ? <><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /></> : <Send className="w-5 h-5" />}
                    {submitting ? "กำลังส่ง..." : (SUBMIT_LABEL[subType]?.[currentStep.stepOrder] ?? "ยืนยันการส่งเอกสาร")}
                  </button>
                </>
              )}

              {/* Cancel — only shown here when it's the student's turn; other states show it in the status banner */}
              {isMyTurn && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-300 text-gray-500 text-sm font-medium rounded-xl hover:bg-gray-50 transition"
                >
                  <XCircle className="w-4 h-4" />
                  ขอยกเลิกคำร้องนี้
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cancel confirmation modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900">ยืนยันการขอยกเลิกคำร้อง</p>
                <p className="text-sm text-gray-500">
                  คำขอจะถูกส่งให้เจ้าหน้าที่พิจารณา — คำร้องนี้จะถูกระงับจนกว่าเจ้าหน้าที่จะอนุมัติหรือปฏิเสธคำขอ
                  {linkedDefense && linkedDefense.status !== "CANCELLED" && " หากอนุมัติ คำร้องขอสอบวิทยานิพนธ์ที่เกี่ยวข้องจะถูกยกเลิกไปด้วย"}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCancelConfirm}
                className="flex-1 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition"
              >
                ส่งคำขอยกเลิก
              </button>
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition"
              >
                ไม่ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function InfoField({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <p className="text-xs text-gray-400 w-24 sm:w-32 shrink-0 pt-0.5">{label}</p>
      <p className="text-sm text-gray-800 flex-1 break-all">{value}</p>
    </div>
  );
}
