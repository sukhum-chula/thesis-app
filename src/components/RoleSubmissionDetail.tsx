"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useRouter } from "next/navigation";
import { WorkflowTimeline } from "./WorkflowTimeline";
import { SignatureButton } from "./SignatureButton";
import { CommitteeSignPanel } from "./CommitteeSignPanel";
import { SubmissionStatusBadge } from "./StatusBadge";
import { FileList } from "./FileList";
import { ROLE_LABELS, formatDate, PROGRAM_LABELS, formatUserName, SIGN_CHECKS, examResultNote, VERY_GOOD_RESULT, DEFAULT_DEFENSE_EXAM_RESULT } from "@/lib/utils";
import { ExamResultPicker } from "./ExamResultPicker";
import { THESIS_STEP } from "@/lib/workflowSteps";
import { stepNumbering } from "@/lib/stepNumbering";
import { ArrowLeft, Clock, AlertCircle, StickyNote, CalendarDays } from "lucide-react";
import Link from "next/link";


interface Props {
  submissionId: string;
  backPath: string;
}

export function RoleSubmissionDetail({ submissionId, backPath }: Props) {
  const { user, submissions, users, needsMyAction } = useApp();
  const router = useRouter();
  const sub = submissions.find((s) => s.id === submissionId);

  const [thesisResult, setThesisResult] = useState("ผ่าน"); // PROPOSAL head-of-committee pass/fail
  const [defenseResult, setDefenseResult] = useState<string>(DEFAULT_DEFENSE_EXAM_RESULT); // THESIS advisor's pick

  if (!sub) {
    return (
      <div className="text-center py-20 text-gray-400 space-y-3">
        <p className="text-lg">ไม่พบข้อมูลคำร้อง</p>
        <Link href={backPath} className="text-blue-500 hover:underline">กลับหน้าหลัก</Link>
      </div>
    );
  }

  // Ownership guard — involvement-based: any role the user plays in this submission.
  // Submission workflow is ADMIN's exclusive responsibility, so only ADMIN gets a blanket bypass here.
  const authorized = !user ? false
    : user.roles.includes("ADMIN") || (!!sub.program && (user.programChairFor ?? []).includes(sub.program)) ? true
    : sub.studentId === user.id
    || (sub as any).advisorId === user.id
    || ((sub.coAdvisorIds ?? []) as string[]).includes(user.id)
    || ((sub as any).headCommitteeId === user.id)
    || ((sub.committeeIds ?? []) as string[]).includes(user.id)
    || ((sub.invitedCommitteeIds ?? []) as string[]).includes(user.id)
    || ((sub as any).programChairId === user.id)
    // The department chair signs every defense's ใบรายงานผลการสอบ, so is involved in all of them
    || (sub.submissionType === "THESIS_DEFENSE" && users.some((u) => u.id === user.id && u.isDepartmentChair));

  if (!authorized) {
    return (
      <div className="text-center py-20 text-gray-400 space-y-3">
        <p className="text-lg">ไม่มีสิทธิ์เข้าถึงคำร้องนี้</p>
        <Link href={backPath} className="text-blue-500 hover:underline">กลับหน้าหลัก</Link>
      </div>
    );
  }

  const allUsers    = users;
  const student     = allUsers.find((u) => u.id === sub.studentId);
  const advisor     = allUsers.find((u) => u.id === sub.advisorId);
  const currentStep = sub.workflowSteps.find((s) => s.status === "PENDING");

  // Involvement-based: the user plays the current step's role. For a multi-member step that includes
  // members still waiting on an earlier one (their card shows the roster + "wait" message) — whether
  // they can act right now is `canActNow`, which also follows the sign order
  const isMyTurn = (() => {
    if (!user || !currentStep) return false;
    switch (currentStep.role) {
      case "STUDENT":               return sub.studentId === user.id;
      case "ADVISOR":               return (sub as any).advisorId === user.id;
      case "HEAD_EXAM_COMMITTEE":   return (sub as any).headCommitteeId === user.id;
      case "CO_ADVISOR":            return ((sub.coAdvisorIds ?? []) as string[]).includes(user.id);
      case "EXAM_COMMITTEE":        return ((sub.committeeIds ?? []) as string[]).includes(user.id);
      case "INVITED_EXAM_COMMITTEE":return ((sub.invitedCommitteeIds ?? []) as string[]).includes(user.id);
      case "PROGRAM_CHAIR":
        return (sub as any).programChairId ? (sub as any).programChairId === user.id : (!!sub.program && (user.programChairFor ?? []).includes(sub.program));
      case "DEPARTMENT_CHAIR":      return allUsers.some((u) => u.id === user.id && u.isDepartmentChair);
      default:                      return user.roles.includes(currentStep.role as any);
    }
  })();

  const canActNow = needsMyAction(sub);

  const isThesisAdvisorResultStep =
    sub.submissionType === "THESIS_DEFENSE" &&
    currentStep?.stepOrder === THESIS_STEP.ADVISOR_RESULT &&
    (sub as any).advisorId === user?.id &&
    isMyTurn;

  const isProposalHeadResultStep =
    sub.submissionType === "PROPOSAL" &&
    currentStep?.stepOrder === 5 &&
    (sub as any).headCommitteeId === user?.id &&
    isMyTurn;

  // Which form types the current role needs to download and physically sign
  const STEP_SIGN_FORMS: Record<string, Record<number, string[]>> = {
    PROPOSAL: {
      // Step 2 (ADMIN approve) and step 10 (ADMIN verify) omitted — admin only clicks approve, no signing
      3:  ["B1"],            // PROGRAM_CHAIR signs บ.วศ.1ก inside the combined บ.วศ.1 file
      // Steps 5–9 (shown as 5.1–5.x): every committee member signs one place on บ.วศ.1ค, inside the
      // same combined B1 the student re-uploaded at step 4; step 11 (shown as 7) is the chair
      5:  ["B1"],            // HEAD_EXAM_COMMITTEE signs บ.วศ.1ค
      6:  ["B1"],            // ADVISOR signs บ.วศ.1ค
      7:  ["B1"],            // CO_ADVISOR signs บ.วศ.1ค
      8:  ["B1"],            // INVITED_EXAM_COMMITTEE signs บ.วศ.1ค
      9:  ["B1"],            // EXAM_COMMITTEE — each member signs บ.วศ.1ค
      11: ["B1"],            // PROGRAM_CHAIR signs บ.วศ.1ค + 1ง
    },
    THESIS_DEFENSE: {
      // บ.2 (student + advisor + head signed) and บ.3 are collected outside the system and
      // uploaded by the student at step 1. Steps 2 (ADMIN check), 4 (ADMIN relay) and 5 (ADMIN
      // upload of the Faculty docs) are omitted — no signing, handled via the admin page
      3:  ["B2"],            // PROGRAM_CHAIR signs B2 (after the admin check at step 2)
      7:  ["SIGNED", "EXAM_RESULT"], // ADVISOR signs แบบรายงานฯ (student + advisor only) fills in + signs the blank ใบรายงานผล the student uploaded
      8:  ["EXAM_RESULT"],           // CO_ADVISOR signs ใบรายงานผล
      9:  ["EXAM_RESULT"],           // HEAD_EXAM_COMMITTEE signs ใบรายงานผล
      10: ["EXAM_RESULT"],           // EXAM_COMMITTEE signs ใบรายงานผล
      11: ["EXAM_RESULT"],           // INVITED_EXAM_COMMITTEE signs ใบรายงานผล
      // Steps 12 (ADMIN check) and 14 (ADMIN cover page + email to the Faculty) — admin page
      13: ["EXAM_RESULT"],           // DEPARTMENT_CHAIR signs ใบรายงานผล
      // Step 16 (ADMIN check + cover page), 18 and 19 (ADMIN confirmations) — admin page
      17: ["B4"],            // DEPARTMENT_CHAIR signs B4 only (the thesis arrives committee-signed at step 15)
    },
  };
  const formsToShow = currentStep
    ? (STEP_SIGN_FORMS[sub.submissionType ?? "PROPOSAL"]?.[currentStep.stepOrder] ?? [])
    : [];
  // Display numbering matching the timeline (sub-steps 5.1–5.x, SKIPPED hidden) — lib/stepNumbering
  const numbering   = stepNumbering(sub.workflowSteps, sub.submissionType);
  const doneCount   = numbering.done;
  const totalSteps  = numbering.total;
  const currentDisplayOrder = currentStep ? numbering.label(currentStep.stepOrder) : "";
  // Signing steps with an own-signature checklist (PROPOSAL 3, 5.x, 7; THESIS 3, 8.x, 10, 14) — lib/utils SIGN_CHECKS
  const signChecks = currentStep && isMyTurn
    ? (SIGN_CHECKS[sub.submissionType ?? "PROPOSAL"]?.[currentStep.stepOrder] ?? null)
    : null;
  const signChecksTitle = sub.submissionType === "THESIS_DEFENSE" ? "กรุณาตรวจสอบก่อนส่งต่อ" : "กรุณาตรวจสอบ บ.วศ.1 ก่อนส่งต่อ";
  // THESIS advisor-result step: the advisor picks the result; ดีมาก — the student's evaluation form must be filled in
  const advisorResultChecks = isThesisAdvisorResultStep
    ? [
        { key: "resultOk",     group: "confirm" as const, label: `ผลการสอบ "${defenseResult}" ตรงกับใบรายงานผลการสอบแล้ว` },
        ...(defenseResult === VERY_GOOD_RESULT
          ? [{ key: "evalFilled", group: "confirm" as const, label: "นิสิตกรอกแบบประเมินวิทยานิพนธ์ดีมากครบถ้วนแล้ว" }]
          : []),
        { key: "signedReport", group: "mySign" as const, label: "ท่านลงนามในแบบรายงานการเสนอผลงานฯ แล้ว (1 ตำแหน่ง)" },
        { key: "filledResult", group: "mySign" as const, label: "ท่านกรอกข้อมูลในใบรายงานผลการสอบครบถ้วนแล้ว" },
        { key: "signedResult", group: "mySign" as const, label: "ท่านลงนามในใบรายงานผลการสอบแล้ว (1 ตำแหน่ง)" },
      ]
    : null;

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href={backPath} className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-800 font-medium">
        <ArrowLeft className="w-5 h-5" />
        ย้อนกลับรายการ
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900 leading-snug">{sub.title}</h1>
          <p className="text-gray-500">
            นิสิต: <span className="font-medium text-gray-700">{sub.studentFullName ?? (student ? formatUserName(student) : undefined)}</span>
            {(sub.studentCode ?? student?.studentId) && (
              <span className="text-gray-400"> ({sub.studentCode ?? student?.studentId})</span>
            )}
          </p>
          {advisor && (
            <p className="text-gray-500 text-sm">
              อาจารย์ที่ปรึกษา: <span className="text-gray-700">{formatUserName(advisor)}</span>
            </p>
          )}
          <p className="text-sm text-gray-400">{formatDate(sub.createdAt)}</p>
        </div>
        <SubmissionStatusBadge status={sub.status} />
      </div>

      {/* Exam / committee info */}
      {(sub.examDate || sub.program || sub.studentPhone) && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-3">
          <h2 className="font-semibold text-gray-700 text-sm">ข้อมูลการสอบ</h2>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            {sub.program && <InfoRow label="หลักสูตร" value={PROGRAM_LABELS[sub.program] ?? sub.program} />}
            {sub.studentPhone && <InfoRow label="เบอร์โทร" value={sub.studentPhone} />}
            {sub.studentEmail && <InfoRow label="อีเมลนิสิต" value={sub.studentEmail} />}
            {sub.examDate && (
              <InfoRow label="วันที่สอบ" value={`${sub.examDate}${sub.examTime ? ` เวลา ${sub.examTime} น.` : ""}`} icon={<CalendarDays className="w-4 h-4 text-blue-400" />} />
            )}
            {sub.roomNeeded && <InfoRow label="ห้องประชุม" value="ต้องการ" />}
            {sub.parkingNeeded && sub.carPlate && <InfoRow label="ที่จอดรถ (ทะเบียน)" value={sub.carPlate} />}
            {sub.headCommitteeId && <InfoRow label="ประธานกรรมการสอบ" value={(() => { const u = allUsers.find((u) => u.id === sub.headCommitteeId); return u ? formatUserName(u) : sub.headCommitteeId; })()} />}
            {sub.committeeIds && sub.committeeIds.length > 0 && (
              <InfoRow
                label="กรรมการสอบ"
                value={sub.committeeIds
                  .map((uid: string) => { const u = allUsers.find((u) => u.id === uid); return u ? formatUserName(u) : uid; })
                  .join(", ")}
              />
            )}
            {sub.invitedCommitteeIds && sub.invitedCommitteeIds.length > 0 && (
              <InfoRow
                label="กรรมการภายนอก"
                value={sub.invitedCommitteeIds
                  .map((uid: string) => { const u = allUsers.find((u) => u.id === uid); return u ? formatUserName(u) : uid; })
                  .join(", ")}
              />
            )}
          </div>
        </div>
      )}

      {/* Admin note */}
      {sub.adminNote && (
        <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-2xl px-5 py-4">
          <StickyNote className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-yellow-600 uppercase mb-1">บันทึกจากผู้ดูแลระบบ</p>
            <p className="text-yellow-800 text-sm">{sub.adminNote}</p>
          </div>
        </div>
      )}

      {/* Cancellation requested by the student — frozen until ADMIN accepts/declines */}
      {sub.cancelRequested && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-2xl px-5 py-4">
          <Clock className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">นิสิตขอยกเลิกคำร้องนี้ — รอเจ้าหน้าที่อนุมัติ</p>
            <p className="text-sm text-amber-600 mt-0.5">ไม่สามารถดำเนินการใด ๆ กับคำร้องนี้ได้ในขณะนี้</p>
          </div>
        </div>
      )}

      {/* "Your turn" banner */}
      {!sub.cancelRequested && canActNow && sub.status === "IN_PROGRESS" && (
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-300 rounded-2xl px-5 py-4">
          <AlertCircle className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-blue-800">ถึงคิวของท่านแล้ว</p>
            {formsToShow.length > 0 ? (
              <p className="text-sm text-blue-600">
                ดาวน์โหลดเอกสาร → ลงนาม → อัปโหลด → ส่งต่อ
              </p>
            ) : (
              <p className="text-sm text-blue-600">
                กรุณาตรวจสอบเอกสาร แล้วลงนามหรือปฏิเสธด้านล่าง
              </p>
            )}
          </div>
        </div>
      )}

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${totalSteps > 0 ? (doneCount / totalSteps) * 100 : 0}%` }}
          />
        </div>
        <span className="text-sm font-medium text-gray-600 shrink-0">
          {doneCount}/{totalSteps} ขั้นตอน
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Timeline — second on mobile so the action panel is reachable first */}
        <div className="order-2 md:order-none bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-5">ขั้นตอนทั้งหมด</h2>
          <WorkflowTimeline steps={sub.workflowSteps} users={allUsers} submissionType={sub.submissionType} submission={sub} />
        </div>

        {/* Sidebar — first on mobile */}
        <div className="order-1 md:order-none space-y-4">
          {/* Action — committee steps (EXAM_COMMITTEE, CO_ADVISOR, INVITED_EXAM_COMMITTEE) use sequential multi-member panel */}
          {!sub.cancelRequested && isMyTurn && sub.status === "IN_PROGRESS" && (currentStep?.role === "EXAM_COMMITTEE" || currentStep?.role === "CO_ADVISOR" || currentStep?.role === "INVITED_EXAM_COMMITTEE") && (
            <CommitteeSignPanel
              submissionId={sub.id}
              step={currentStep}
              formsToShow={formsToShow}
              title={currentStep.role === "CO_ADVISOR" ? "อาจารย์ที่ปรึกษาร่วม" : currentStep.role === "INVITED_EXAM_COMMITTEE" ? "กรรมการภายนอก" : undefined}
              checklist={signChecks ? { title: signChecksTitle, checks: signChecks } : undefined}
              onSuccess={() => router.push(backPath)}
            />
          )}

          {!sub.cancelRequested && isMyTurn && sub.status === "IN_PROGRESS" && currentStep?.role !== "EXAM_COMMITTEE" && currentStep?.role !== "CO_ADVISOR" && currentStep?.role !== "INVITED_EXAM_COMMITTEE" && (
            <SignatureButton
              submissionId={sub.id}
              formsToShow={formsToShow}
              onSuccess={() => router.push(backPath)}
              downloadOnly={isThesisAdvisorResultStep ? ["VERY_GOOD_EVAL"] : undefined}
              signSection={isThesisAdvisorResultStep ? {
                title: "กรอกข้อมูลและลงนามในเอกสาร",
                hint: "กรอกข้อมูลในใบรายงานผลการสอบวิทยานิพนธ์ให้ครบถ้วน (ผลการสอบตรงกับที่เลือกด้านบน) แล้วลงนาม และลงนามในแบบรายงานการเสนอผลงานฯ จากนั้นบันทึกเป็นไฟล์ PDF",
              } : undefined}
              notePrefix={isThesisAdvisorResultStep && defenseResult ? examResultNote(defenseResult)
                : isProposalHeadResultStep && thesisResult ? examResultNote(thesisResult) : undefined}
              requireNotePrefix={isThesisAdvisorResultStep || isProposalHeadResultStep}
              checklist={advisorResultChecks ? { title: signChecksTitle, checks: advisorResultChecks }
                : signChecks ? { title: signChecksTitle, checks: signChecks } : undefined}
              intro={isThesisAdvisorResultStep ? (
                <p className="text-sm text-gray-600 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  ใบรายงานผลการสอบที่นิสิตอัปโหลดเป็นฉบับว่าง — ท่านเป็นผู้กรอกข้อมูลทั้งหมดในใบรายงานผลการสอบและลงนาม แล้วอัปโหลดในขั้นตอนนี้ คณะกรรมการสอบและหัวหน้าภาควิชาจะลงนามต่อจากไฟล์นี้
                  แบบประเมินวิทยานิพนธ์ดีมากที่นิสิตอัปโหลดจะมีข้อมูลเฉพาะเมื่อผลการสอบเป็น ดีมาก
                </p>
              ) : undefined}
              leadSection={isThesisAdvisorResultStep ? (n) => (
                // Exam result — picked by the advisor (ผ่าน preselected); stored as this step's approval note
                <ExamResultPicker n={n} value={defenseResult} onChange={setDefenseResult} />
              ) : isProposalHeadResultStep ? (n) => (
                // Pass/fail — HEAD_EXAM_COMMITTEE at PROPOSAL step 5.1
                <ExamResultPicker n={n} value={thesisResult} onChange={setThesisResult}
                  options={["ผ่าน", "ไม่ผ่าน"]} hint="กรุณาเลือกผลการสอบก่อนลงนาม" />
              ) : undefined}
            />
          )}

          {!isMyTurn && currentStep && !["COMPLETED", "CANCELLED"].includes(sub.status) && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-orange-700 font-semibold mb-1">
                <Clock className="w-5 h-5" />
                รอดำเนินการจาก
              </div>
              <p className="text-orange-600 font-medium">{ROLE_LABELS[currentStep.role]}</p>
              <p className="text-sm text-orange-500 mt-1">ขั้นที่ {currentDisplayOrder} จาก {totalSteps}</p>
            </div>
          )}

          {sub.status === "COMPLETED" && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center space-y-1">
              <p className="text-2xl">✅</p>
              <p className="text-green-800 font-semibold text-lg">อนุมัติครบทุกขั้นตอน</p>
              <p className="text-green-600 text-sm">วิทยานิพนธ์ผ่านการพิจารณาแล้ว</p>
            </div>
          )}

          {sub.status === "REJECTED" && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 space-y-1">
              <div className="flex items-center gap-2 text-red-700 font-semibold">
                <Clock className="w-5 h-5" />
                รอนิสิตแก้ไขและยื่นใหม่
              </div>
              <p className="text-red-600 text-sm mt-1">คำร้องถูกปฏิเสธ — นิสิตต้องแก้ไขแล้วกด &ldquo;ยื่นใหม่อีกครั้ง&rdquo; ก่อน ระบบจะส่งกลับมาให้พิจารณาอีกครั้ง</p>
            </div>
          )}
          {/* Documents — last, below every action card; all versions per form type (FileList handles dedup + history) */}
          {(() => {
            const PROPOSAL_FORMS = ["B1", "B1A", "B1B", "B1C", "B1D"];
            const relevantUploads = (sub.submissionType ?? "PROPOSAL") === "PROPOSAL"
              ? sub.uploads.filter((u) => PROPOSAL_FORMS.includes(u.formType))
              : sub.uploads;
            return relevantUploads.length > 0 ? (
              <FileList uploads={relevantUploads} submissionTitle={sub.title} submissionType={sub.submissionType ?? "PROPOSAL"} />
            ) : null;
          })()}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      {icon ?? <span className="w-4 h-4 shrink-0" />}
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="font-medium text-gray-800">{value}</p>
      </div>
    </div>
  );
}
