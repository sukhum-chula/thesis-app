"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import {
  FileUploader, SectionLabel, DownloadRow, ActionError, postUpload, ACTION_CARD, PRIMARY_BUTTON,
} from "@/components/FileUploader";
import { SubmissionStatusBadge } from "@/components/StatusBadge";
import { ROLE_LABELS, FORM_SHORT, getStepName, formatDate, toUserErrorMessage, formatUserName, B1_CHECKS, B1_STEP4_CHECKS, DEFENSE_STEP1_CHECKS, DEFENSE_STEP6_CHECKS, DEFENSE_STEP15_CHECKS, DEFENSE_ITHESIS_CHECKS, freshUploadCutoff,
 } from "@/lib/utils";
import { THESIS_STEP, committeeRoster, isPerMemberForm } from "@/lib/workflowSteps";
import { B1Checklist, allChecked } from "@/components/B1Checklist";
import { stepNumbering } from "@/lib/stepNumbering";
import { FormType } from "@/types";
import Link from "next/link";
import {
  Loader2,
  AlertCircle, Clock, CheckCircle2, RefreshCw, StickyNote, XCircle, Trash2, TriangleAlert,
  ArrowLeft, ArrowRight, ExternalLink,
} from "lucide-react";
import { FileList } from "@/components/FileList";
import { SubmissionInfoPanel } from "@/components/SubmissionInfoPanel";
import { useToast } from "@/context/ToastContext";

type StepSuggestion = {
  forms: FormType[]; label: string; multiUpload?: boolean;
  /** Step-specific warning text, overriding FORM_UPLOAD_WARNINGS for that form */
  warnings?: Partial<Record<FormType, string>>;
  /** Forms the student continues from the system's latest copy (download it here) rather than
   *  a blank form from the department site */
  continueFromLatest?: FormType[];
};

// Per-type step suggestions — keyed by submissionType → stepOrder
const SUGGESTED_BY_STEP: Record<string, Record<number, StepSuggestion>> = {
  PROPOSAL: {
    1: { forms: ["B1"], label: "บ.วศ.1 (กรอก บ.วศ.1ก + บ.วศ.1ข)" },
    4: {
      forms: ["B1"], label: "บ.วศ.1 (กรอก บ.วศ.1ค + บ.วศ.1ง)",
      warnings: { B1: "ไฟล์ PDF ไฟล์เดียวที่รวม บ.วศ.1ก–ง — ขั้นตอนนี้กรอก บ.วศ.1ค และ บ.วศ.1ง ต่อจากไฟล์ล่าสุด" },
      continueFromLatest: ["B1"],
    },
  },
  THESIS_DEFENSE: {
    [THESIS_STEP.STUDENT_B2_B3]:  { forms: ["B2", "B3"], label: "บ.2 + บ.3 ของกรรมการทุกท่าน" },
    [THESIS_STEP.STUDENT_REPORT]: {
      forms: ["SIGNED", "EXAM_RESULT", "VERY_GOOD_EVAL"], label: "แบบรายงานการเสนอผลงานฯ + ใบรายงานผลการสอบฉบับว่าง (จากอีเมลของคณะที่เจ้าหน้าที่ส่งต่อให้) + แบบประเมินวิทยานิพนธ์ดีมาก",
      warnings: {
        SIGNED:      "แบบรายงานการเสนอผลงานทางวิชาการของนิสิต (ไฟล์ PDF) — ใช้แบบฟอร์มจากอีเมลของคณะที่เจ้าหน้าที่ส่งต่อให้ กรอกข้อมูลให้ครบถ้วนและลงนามโดยนิสิตก่อนอัปโหลด เว้นช่องลงนามของอาจารย์ที่ปรึกษาว่างไว้ (อาจารย์ที่ปรึกษาจะลงนามในขั้นตอนถัดไป)",
        EXAM_RESULT: "ใบรายงานผลการสอบวิทยานิพนธ์ (ไฟล์ PDF) — ไฟล์จากอีเมลของคณะที่เจ้าหน้าที่ส่งต่อให้ อัปโหลดฉบับว่าง ไม่ต้องกรอกข้อมูลใดๆ และไม่ต้องลงนาม อาจารย์ที่ปรึกษาจะกรอกและลงนามในขั้นตอนถัดไป",
        VERY_GOOD_EVAL: "แบบประเมินวิทยานิพนธ์ดีมาก (ไฟล์ PDF) — อัปโหลดทุกกรณี: หากผลการสอบเป็น ดีมาก ให้กรอกข้อมูลให้ครบถ้วน หากไม่ใช่ ให้อัปโหลดฉบับว่าง อาจารย์ที่ปรึกษาจะเลือกผลการสอบในขั้นตอนถัดไป",
      },
    },
    [THESIS_STEP.STUDENT_THESIS]: { forms: ["B4", "THESIS"], label: "บ.4 (กรอกครบถ้วน) + วิทยานิพนธ์ 5 หน้าแรกจากระบบ iThesis (มีบาร์โค้ดและลายมือชื่อคณะกรรมการครบ)" },
  },
};

// Per-type submit button labels
const SUBMIT_LABEL: Record<string, Record<number, string>> = {
  PROPOSAL: {
    1: "ส่งต่อ",
    4: "ส่งต่อ",
  },
  THESIS_DEFENSE: {
    [THESIS_STEP.STUDENT_B2_B3]:  "ส่งต่อ",
    [THESIS_STEP.STUDENT_REPORT]: "ส่งต่อ",
    [THESIS_STEP.STUDENT_THESIS]: "ส่งต่อ",
    [THESIS_STEP.STUDENT_ITHESIS]: "ยืนยัน",
  },
};

// Student steps that end with a document checklist, and which items each one asks for
const B1_STEP_CHECKS: Record<string, Record<number, typeof B1_CHECKS>> = {
  PROPOSAL:       { 1: B1_CHECKS, 4: B1_STEP4_CHECKS },
  THESIS_DEFENSE: {
    [THESIS_STEP.STUDENT_B2_B3]:  DEFENSE_STEP1_CHECKS,
    [THESIS_STEP.STUDENT_REPORT]: DEFENSE_STEP6_CHECKS,
    [THESIS_STEP.STUDENT_THESIS]: DEFENSE_STEP15_CHECKS,
    [THESIS_STEP.STUDENT_ITHESIS]: DEFENSE_ITHESIS_CHECKS, // confirm only — no upload
  },
};
// Checklist heading per student step (default: "กรุณาตรวจสอบก่อนส่ง")
const CHECKLIST_TITLE: Record<string, Record<number, string>> = {
  PROPOSAL:       { 1: "กรุณาตรวจสอบ บ.วศ.1 ก่อนส่ง", 4: "กรุณาตรวจสอบ บ.วศ.1 ก่อนส่ง" },
  THESIS_DEFENSE: {
    [THESIS_STEP.STUDENT_B2_B3]:   "กรุณาตรวจสอบ บ.2 และ บ.3 ก่อนส่ง",
    [THESIS_STEP.STUDENT_REPORT]:  "กรุณาตรวจสอบแบบรายงานการเสนอผลงานฯ ก่อนส่ง",
    [THESIS_STEP.STUDENT_THESIS]:  "กรุณาตรวจสอบ บ.4 และวิทยานิพนธ์ก่อนส่ง",
    [THESIS_STEP.STUDENT_ITHESIS]: "กรุณาตรวจสอบก่อนยืนยัน",
  },
};

// Every form the student uploads over a submission's life — fallback re-upload list after a rejection
const ALL_STUDENT_FORMS: Record<string, FormType[]> = {
  PROPOSAL:       ["B1"],
  THESIS_DEFENSE: ["B2", "B3", "B4", "THESIS"],
};

// Blank forms are published on the department site, not served by this app — the uploader
// for each of these form types points the student there, naming which form to download.
const FORM_DOWNLOAD_URL = "https://me.eng.chula.ac.th/download/";
const FORM_DOWNLOAD_NAME: Partial<Record<FormType, string>> = {
  B1:             "แบบฟอร์ม บ.วศ.1ก–ง",
  B2:             "แบบฟอร์ม บ.2",
  B3:             "แบบฟอร์ม บ.3",
  FINANCE_ATTACH: "แบบฟอร์มเอกสารการเงินแนบกรรมการสอบ",
};

// Warnings shown above the uploader — reminder of what must be done BEFORE uploading

const FORM_UPLOAD_WARNINGS: Partial<Record<FormType, string>> = {
  B1:            "ไฟล์ PDF ไฟล์เดียวที่รวม บ.วศ.1ก–ง — ขั้นตอนนี้กรอกเฉพาะ บ.วศ.1ก และ บ.วศ.1ข",
  FINANCE_ATTACH: "กรอกข้อมูลให้ครบถ้วน แล้วอัปโหลดเป็นไฟล์ Word (.docx)",
  B1C:   "กรอกข้อมูลให้ครบถ้วน — กรรมการจะลงนามผ่านระบบหลังอัปโหลด",
  B1D:   "กรอกข้อมูลให้ครบถ้วนก่อนอัปโหลด",
  B2:    "ไฟล์ PDF — กรอกข้อมูลให้ครบถ้วนและลงนามโดยนิสิต เว้นช่องลงนามอื่นว่างไว้",
  B3:    "ไฟล์ PDF หนึ่งไฟล์ต่อกรรมการหนึ่งท่าน — บ.3 ที่กรรมการท่านนั้นประเมินและลงนามแล้ว (ติดต่อกรรมการนอกระบบร่วมกับอาจารย์ที่ปรึกษา)",
  B4:    "กรอกข้อมูลให้ครบถ้วนก่อนอัปโหลด",
  THESIS: "ไฟล์ PDF เฉพาะ 5 หน้าแรกของวิทยานิพนธ์ที่ดาวน์โหลดจากระบบ iThesis: ปกภาษาไทย ปกภาษาอังกฤษ หน้าลายมือชื่อคณะกรรมการสอบ บทคัดย่อภาษาไทย บทคัดย่อภาษาอังกฤษ — ต้องมีบาร์โค้ดแล้ว และคณะกรรมการสอบลงนามครบทุกท่านแล้ว (ลงนามนอกระบบ) หลังดาวน์โหลดแล้ว ห้ามแก้ไขวิทยานิพนธ์ในระบบ iThesis อีก",
  SIGNED: "ต้องลงนามโดยนิสิตในเอกสารก่อนอัปโหลด",
  VERY_GOOD_EVAL: "แบบประเมินวิทยานิพนธ์ดีมาก (ไฟล์ PDF) — กรอกข้อมูลหากผลการสอบเป็น ดีมาก หากไม่ใช่ ให้อัปโหลดฉบับว่าง",
};

/** The student's full action surface for one submission — status banner, committee/exam info,
 *  progress + timeline, file uploads, and cancel — everything needed to actually act on a
 *  proposal/defense (upload docs, continue a DRAFT, resubmit after rejection). Shared by the
 *  standalone detail page (`/dashboard/student/[id]`) and inlined directly in the current
 *  proposal/defense tab on `/student-dashboard`, so the student never has to leave the tab to
 *  take action on their active submission. */
export function StudentSubmissionActions({ submissionId }: { submissionId: string }) {
  const { user, submissions, users, approveCurrentStep, studentResubmit, requestCancelSubmission, refresh } = useApp();
  const { showToast } = useToast();
  const [showCancelModal, setShowCancelModal] = useState(false);
  // Keyed by upload slot: the form type, or "<formType>:<memberId>" for per-member forms (บ.3)
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File>>({});
  const [submitting, setSubmitting] = useState(false);
  const [b1Checks, setB1Checks] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const sub = submissions.find((s) => s.id === submissionId);

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
  // Display numbering matching the timeline (sub-steps 5.1–5.x, SKIPPED hidden) — lib/stepNumbering
  const numbering    = stepNumbering(sub.workflowSteps, sub.submissionType);
  const doneCount    = numbering.done;
  const totalSteps   = numbering.total;
  const currentDisplayOrder = currentStep ? numbering.label(currentStep.stepOrder) : "";
  const subStatus    = sub.status;
  const lastActedDate = sub.workflowSteps
    .filter((s) => s.actedAt)
    .sort((a, b) => new Date(b.actedAt!).getTime() - new Date(a.actedAt!).getTime())[0]?.actedAt ?? null;
  const stuckDays = subStatus === "IN_PROGRESS" && !isMyTurn && lastActedDate
    ? Math.floor((Date.now() - new Date(lastActedDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const subType = sub.submissionType ?? "PROPOSAL";
  const linkedProposal = sub.sourceProposalId ? submissions.find((s) => s.id === sub.sourceProposalId) ?? null : null;
  const linkedDefense = subType === "PROPOSAL" ? submissions.find((s) => s.sourceProposalId === sub.id) ?? null : null;

  const suggested = currentStep
    ? (SUGGESTED_BY_STEP[subType]?.[currentStep.stepOrder] ?? null)
    : null;
  // A required form that already exists from an earlier step only counts once re-uploaded
  // (PROPOSAL step 4's B1 — freshUploadCutoff); the older copies are what the student downloads
  const freshCutoff = currentStep ? freshUploadCutoff(sub.workflowSteps, subType, currentStep.stepOrder) : null;
  const effectiveUploads = sub.uploads.filter((u) => {
    const t = new Date(u.uploadedAt).getTime();
    if (freshCutoff !== null && suggested?.forms.includes(u.formType) && t <= freshCutoff) return false;
    return true;
  });
  // Latest pre-step copy of each continue-from-latest form (e.g. the chair-signed B1 at step 4)
  const latestBeforeStep = (ft: FormType) =>
    sub.uploads
      .filter((u) => u.formType === ft && (freshCutoff === null || new Date(u.uploadedAt).getTime() <= freshCutoff))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0] ?? null;

  const stepDownloads = [
    ...(suggested?.continueFromLatest ?? []).flatMap((ft) => {
      const u = latestBeforeStep(ft);
      return u ? [{ upload: u, title: `${FORM_SHORT[ft]} ฉบับล่าสุดในระบบ` }] : [];
    }),
  ];

  const stepForms: FormType[] = suggested?.forms ?? [];
  const requiredForms = stepForms;
  // Upload slots: one per form, except per-member forms (the defense's บ.3, collected outside the
  // system from each committee member) get one slot per member on the submission's committee
  const roster = committeeRoster(sub);
  type Slot = { key: string; formType: FormType; memberId?: string; label?: string };
  const slotsFor = (forms: FormType[]): Slot[] => forms.flatMap((ft): Slot[] =>
    isPerMemberForm(subType, ft)
      ? roster.map((m) => {
          const person = allUsers.find((x) => x.id === m.id);
          return { key: `${ft}:${m.id}`, formType: ft, memberId: m.id,
                   label: `${person ? formatUserName(person) : "กรรมการ"} (${ROLE_LABELS[m.role] ?? m.role})` };
        })
      : [{ key: ft, formType: ft }]);
  const latestFor = (list: typeof sub.uploads, slot: Slot) =>
    list
      .filter((u) => u.formType === slot.formType && (!slot.memberId || u.memberId === slot.memberId))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0] ?? null;
  const requiredSlots = slotsFor(requiredForms);
  const studentUploaded   = requiredSlots.length === 0 || requiredSlots.every((sl) => !!latestFor(effectiveUploads, sl) || !!selectedFiles[sl.key]);
  // Uploads every picked file, each to its own slot (form type + member for per-member forms)
  async function uploadSelected() {
    for (const [key, file] of Object.entries(selectedFiles)) {
      const [ft, mid] = key.split(":");
      await postUpload(sub!.id, ft, file, mid);
    }
  }

  const b1StepChecks = isMyTurn && currentStep
    ? (B1_STEP_CHECKS[subType]?.[currentStep.stepOrder] ?? null)
    : null;
  const needsB1Confirm = b1StepChecks !== null;
  const b1AllChecked = !b1StepChecks || allChecked(b1StepChecks, b1Checks);
  const preSubmitAllChecked = !needsB1Confirm || b1AllChecked;

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
      case "ADVISOR":             { const u = allUsers.find((u) => u.id === sub.advisorId); return u ? formatUserName(u) : ROLE_LABELS[currentStep.role]; }
      case "HEAD_EXAM_COMMITTEE": { const u = allUsers.find((u) => u.id === sub.headCommitteeId); return u ? formatUserName(u) : ROLE_LABELS[currentStep.role]; }
      case "PROGRAM_CHAIR": {
        const u = allUsers.find((u) => u.id === (sub as any).programChairId)
          ?? (sub.program ? allUsers.find((u) => (u as any).programChairFor?.includes(sub.program)) : undefined);
        return u ? formatUserName(u) : ROLE_LABELS[currentStep.role];
      }
      case "DEPARTMENT_CHAIR": {
        const u = allUsers.find((u) => u.isDepartmentChair);
        return u ? formatUserName(u) : ROLE_LABELS[currentStep.role];
      }
      case "EXAM_COMMITTEE": {
        const memberIds = (currentStep.committeeMembers?.length ? currentStep.committeeMembers : (sub.committeeIds ?? [])) as string[];
        const done = ((currentStep.committeeActions ?? []) as any[]).filter((a) => a.decision === "APPROVED").length;
        const names = memberIds.map((uid) => { const u = allUsers.find((u) => u.id === uid); return u ? formatUserName(u) : uid; });
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
      return (
        <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5 flex items-start gap-4">
          <StickyNote className="w-7 h-7 text-gray-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-gray-800 font-bold text-lg">คำร้องนี้เป็นฉบับร่าง</p>
            <p className="text-gray-500 text-sm mt-1">
              ยังไม่ได้ยืนยัน — กรุณากลับไปที่หน้าหลักเพื่อกรอกข้อมูลให้ครบและกดยืนยัน
            </p>
          </div>
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
              แก้ไขเอกสารในกล่อง &ldquo;แก้ไขเอกสาร&rdquo; แล้วกด <span className="font-semibold">ยื่นใหม่อีกครั้ง</span> — ระบบจะส่งกลับให้ <span className="font-semibold">{rejectedStepName}</span> พิจารณาใหม่
            </p>
          )}
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
              {subType === "THESIS_DEFENSE" && currentStep?.stepOrder === THESIS_STEP.STUDENT_ITHESIS
                ? "กรุณาส่งเอกสารที่จำเป็นทั้งหมดเข้าระบบ iThesis แล้วทำเครื่องหมายยืนยันด้านล่าง และกด ยืนยัน"
                : suggested
                ? `กรุณาอัปโหลด${suggested.label} แล้วกด ส่งต่อ`
                : "กรุณาอัปโหลดเอกสารที่จำเป็น แล้วกด ส่งต่อ"}
            </p>
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1 flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-snug">{sub.title}</h1>
          {advisor && (
            <p className="text-gray-500 text-sm">
              อาจารย์ที่ปรึกษา: <span className="font-medium text-gray-700">{formatUserName(advisor)}</span>
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
      <SubmissionInfoPanel submission={sub} users={allUsers} />

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Timeline — second on mobile so upload/action is reachable first */}
        {subStatus !== "DRAFT" && (
          <div className="order-2 md:order-none bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-5">ขั้นตอนทั้งหมด</h2>
            <WorkflowTimeline steps={sub.workflowSteps} users={allUsers} submissionType={sub.submissionType} submission={sub} />
          </div>
        )}

        {/* Right: files + upload — first on mobile */}
        <div className="order-1 md:order-none space-y-4">
          {/* Cancel — outside the IN_PROGRESS states (which already show their own cancel button
              below): lets a REJECTED PROPOSAL be started over (cancelling also cancels any defense
              created off it), and lets an abandoned DRAFT (of either type) be given up on entirely.
              Never offered once COMPLETED — a finished submission can't be cancelled. Requesting
              cancellation requires ADMIN accept/decline — see the pending banner above once
              requested. */}
          {!sub.cancelRequested && (subType === "PROPOSAL" || subStatus === "DRAFT") && subStatus !== "IN_PROGRESS" && subStatus !== "CANCELLED" && subStatus !== "COMPLETED" && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-300 text-gray-500 text-sm font-medium rounded-xl hover:bg-gray-50 hover:border-gray-400 transition"
            >
              <XCircle className="w-4 h-4" />
              ขอยกเลิกคำร้องนี้
            </button>
          )}

          {/* REJECTED: upload corrected docs then resubmit — the boxes start empty (the rejected copy
              is not shown as "uploaded"), and ยื่นใหม่ needs at least one corrected file */}
          {!sub.cancelRequested && subStatus === "REJECTED" && (
            <div className={ACTION_CARD}>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">แก้ไขเอกสาร</h3>
                <p className="text-sm text-gray-500">เลือกไฟล์ที่แก้ไขแล้ว แล้วกด ยื่นใหม่อีกครั้ง</p>
              </div>

              <div>
                <SectionLabel n={1} required>อัปโหลดเอกสารที่แก้ไขแล้ว</SectionLabel>
                <div className="space-y-4">
                  {rejectedFixForms.map((ft) => (
                    <div key={ft} className="space-y-2">
                      {FORM_UPLOAD_WARNINGS[ft] && (
                        <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          {FORM_UPLOAD_WARNINGS[ft]}
                        </p>
                      )}
                      {slotsFor([ft]).map((sl) => (
                        <FileUploader
                          key={sl.key}
                          submissionId={sub.id}
                          formType={ft}
                          slotLabel={sl.label}
                          selectedFile={selectedFiles[sl.key] ?? null}
                          onFileSelect={(file) => {
                            setActionError(null);
                            setSelectedFiles((prev) => {
                              if (!file) { const next = { ...prev }; delete next[sl.key]; return next; }
                              return { ...prev, [sl.key]: file };
                            });
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <ActionError message={actionError} />

              <button
                onClick={async () => {
                  setSubmitting(true);
                  setActionError(null);
                  try {
                    await uploadSelected();
                    setSelectedFiles({});
                    await studentResubmit(sub.id);
                    showToast("ยื่นใหม่แล้ว — ส่งกลับให้ผู้พิจารณาตรวจสอบอีกครั้ง ✓");
                  } catch (err) {
                    setActionError(toUserErrorMessage(err));
                  } finally {
                    setSubmitting(false);
                  }
                }}
                disabled={submitting || Object.keys(selectedFiles).length === 0}
                className={PRIMARY_BUTTON}
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                {submitting ? "กำลังส่ง..." : "ยื่นใหม่อีกครั้ง"}
              </button>
            </div>
          )}

          {/* Waiting — not the student's turn */}
          {!sub.cancelRequested && subStatus === "IN_PROGRESS" && !isMyTurn && currentStep && (
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

          {/* Upload section — the student's action card: ① download (when the step continues from a
              file already in the system) → ② upload → checklist → ส่งต่อ */}
          {!sub.cancelRequested && subStatus === "IN_PROGRESS" && isMyTurn && (
            <div className={ACTION_CARD}>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">ดำเนินการ</h3>
                <p className="text-sm text-gray-500">
                  {suggested?.label ?? getStepName(currentStep?.stepOrder ?? 0, subType) ?? "อัปโหลดเอกสาร"}
                </p>
              </div>

              {stepDownloads.length > 0 && (
                <div>
                  <SectionLabel n={1}>ดาวน์โหลดเอกสารเพื่อกรอกข้อมูลต่อ</SectionLabel>
                  <div className="space-y-2">
                    {stepDownloads.map((d) => (
                      <DownloadRow key={d.upload.id} upload={d.upload} submissionTitle={sub.title} title={d.title} />
                    ))}
                  </div>
                </div>
              )}

              {suggested && (
                <div>
                  <SectionLabel n={1 + (stepDownloads.length > 0 ? 1 : 0)} required>อัปโหลดเอกสาร</SectionLabel>
                  <div className="space-y-4">
                    {stepForms.map((ft, idx) => {
                      const existing = effectiveUploads
                        .filter((u) => u.formType === ft)
                        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0] ?? null;
                      const warning = suggested.warnings?.[ft] ?? FORM_UPLOAD_WARNINGS[ft];
                      return (
                        <div key={`${ft}-${idx}`} className="space-y-2">
                          {/* Where to get the blank form (not shown when the step continues from the system's copy) */}
                          {FORM_DOWNLOAD_NAME[ft] && !suggested.continueFromLatest?.includes(ft) && (
                            <p className="flex items-start gap-1.5 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-2">
                              <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>
                                ดาวน์โหลด{FORM_DOWNLOAD_NAME[ft]}ได้ที่{" "}
                                <a
                                  href={FORM_DOWNLOAD_URL}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-semibold underline break-all hover:text-blue-600"
                                >
                                  {FORM_DOWNLOAD_URL}
                                </a>
                              </span>
                            </p>
                          )}
                          {warning && (
                            <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              {warning}
                            </p>
                          )}
                          {slotsFor([ft]).map((sl) => (
                            <FileUploader
                              key={sl.key}
                              submissionId={sub.id}
                              formType={ft}
                              slotLabel={sl.label}
                              existingUpload={sl.memberId ? latestFor(effectiveUploads, sl) : existing}
                              selectedFile={selectedFiles[sl.key] ?? null}
                              onFileSelect={(file) => {
                                setActionError(null);
                                setSelectedFiles((prev) => {
                                  if (!file) {
                                    const next = { ...prev };
                                    delete next[sl.key];
                                    return next;
                                  }
                                  return { ...prev, [sl.key]: file };
                                });
                              }}
                            />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pre-submit checklist — the system can't inspect the PDF, so the student confirms what
                  they filled and who signed */}
              {b1StepChecks && (
                <B1Checklist
                  title={CHECKLIST_TITLE[subType]?.[currentStep?.stepOrder ?? 0] ?? "กรุณาตรวจสอบก่อนส่ง"}
                  checks={b1StepChecks}
                  value={b1Checks}
                  onChange={setB1Checks}
                />
              )}

              <ActionError message={actionError} />

              {/* Submit button */}
              {isMyTurn && currentStep && (
                <button
                  disabled={!allRequiredUploaded || submitting}
                  onClick={async () => {
                    setSubmitting(true);
                    setActionError(null);
                    try {
                      await uploadSelected();
                      setSelectedFiles({});
                      setB1Checks({});
                      const res = await fetch(`/api/submissions/${sub.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "approve" }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error ?? "เกิดข้อผิดพลาด");
                      await refresh();
                      const lbl = SUBMIT_LABEL[subType]?.[currentStep.stepOrder] ?? "ส่งเอกสารแล้ว";
                      showToast(`${lbl} ✓`);
                    } catch (err) {
                      setActionError(toUserErrorMessage(err, "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง"));
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className={PRIMARY_BUTTON}
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  {submitting ? "กำลังส่ง..." : (SUBMIT_LABEL[subType]?.[currentStep.stepOrder] ?? "ส่งต่อ")}
                </button>
              )}

            </div>
          )}

          {/* Cancel on the student's turn — below the action card, not inside it (the card ends with
              its one primary button, same as every other role's card) */}
          {!sub.cancelRequested && subStatus === "IN_PROGRESS" && isMyTurn && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-300 text-gray-500 text-sm font-medium rounded-xl hover:bg-gray-50 transition"
            >
              <XCircle className="w-4 h-4" />
              ขอยกเลิกคำร้องนี้
            </button>
          )}

          {/* Uploaded files — last, below every action card */}
          {sub.uploads.length > 0 && (
            <FileList
              uploads={sub.uploads}
              submissionTitle={sub.title}
              submissionType={subType}
              compact
              hideHistory
            />
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
