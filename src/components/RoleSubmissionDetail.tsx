"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useRouter } from "next/navigation";
import { WorkflowTimeline } from "./WorkflowTimeline";
import { SignatureButton } from "./SignatureButton";
import { CommitteeSignPanel } from "./CommitteeSignPanel";
import { SubmissionStatusBadge } from "./StatusBadge";
import { FileList } from "./FileList";
import { ROLE_LABELS, formatDate, PROGRAM_LABELS, formatUserName } from "@/lib/utils";
import { ArrowLeft, Clock, AlertCircle, StickyNote, CalendarDays } from "lucide-react";
import Link from "next/link";

interface Props {
  submissionId: string;
  backPath: string;
}

export function RoleSubmissionDetail({ submissionId, backPath }: Props) {
  const { user, submissions, users } = useApp();
  const router = useRouter();
  const sub = submissions.find((s) => s.id === submissionId);

  const [thesisResult, setThesisResult] = useState("ผ่าน");

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
    || ((sub as any).programChairId === user.id);

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

  // Involvement-based "is it my turn" — checks whether user is assigned to play this step's role
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
      default:                      return user.roles.includes(currentStep.role as any);
    }
  })();

  const isThesisAdvisorResultStep =
    sub.submissionType === "THESIS_DEFENSE" &&
    currentStep?.stepOrder === 10 &&
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
      3:  ["BW1A"],
      5:  ["B1C"],
      6:  ["B1C"],
      7:  ["B1C"],           // CO_ADVISOR signs B1C
      8:  ["B1C"],           // INVITED_EXAM_COMMITTEE signs B1C
      9:  ["B1C"],           // EXAM_COMMITTEE signs B1C
      11: ["B1C", "B1D"],   // PROGRAM_CHAIR signs both
    },
    THESIS_DEFENSE: {
      2:  ["B3"],            // EXAM_COMMITTEE signs B3
      3:  ["B2"],            // ADVISOR signs B2
      4:  ["B2"],            // CO_ADVISOR signs B2
      5:  ["B2"],            // HEAD_EXAM_COMMITTEE signs B2
      6:  ["B2"],            // PROGRAM_CHAIR signs B2
      // Step 7 (ADMIN relay) omitted — admin physically delivers, no signing, uses own page
      // Step 8 (ADMIN upload) omitted — admin uploads new docs from Faculty, handled via admin page
      10: ["SIGNED", "EXAM_RESULT"], // ADVISOR signs แบบรายงาน + ใบรายงานผล
      11: ["EXAM_RESULT"],           // CO_ADVISOR signs ใบรายงานผล
      12: ["EXAM_RESULT"],           // HEAD_EXAM_COMMITTEE signs ใบรายงานผล
      13: ["EXAM_RESULT"],           // EXAM_COMMITTEE signs ใบรายงานผล
      14: ["EXAM_RESULT"],           // INVITED_EXAM_COMMITTEE signs ใบรายงานผล
      15: ["EXAM_RESULT"],           // PROGRAM_CHAIR signs ใบรายงานผล
      17: ["B4"],            // PROGRAM_CHAIR signs B4
      18: ["THESIS"],        // ADVISOR signs thesis cover
      19: ["THESIS"],        // CO_ADVISOR signs thesis cover
      20: ["THESIS"],        // HEAD_EXAM_COMMITTEE signs thesis cover
      21: ["THESIS"],        // EXAM_COMMITTEE signs thesis cover
      22: ["THESIS"],        // INVITED_EXAM_COMMITTEE signs thesis cover
    },
  };
  const formsToShow = currentStep
    ? (STEP_SIGN_FORMS[sub.submissionType ?? "PROPOSAL"]?.[currentStep.stepOrder] ?? [])
    : [];
  const doneCount   = sub.workflowSteps.filter((s) => s.status === "APPROVED").length;
  const visibleSteps = sub.workflowSteps.filter((s) => s.status !== "SKIPPED");
  const totalSteps  = visibleSteps.length;
  // Display number matching the timeline (SKIPPED steps are hidden and renumbered)
  const currentDisplayOrder = currentStep
    ? visibleSteps.findIndex((s) => s.id === currentStep.id) + 1
    : 0;

  return (
    <div className="max-w-4xl space-y-6">
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
      {!sub.cancelRequested && isMyTurn && sub.status === "IN_PROGRESS" && (
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline — second on mobile so the action panel is reachable first */}
        <div className="order-2 lg:order-none lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-5">ขั้นตอนทั้งหมด</h2>
          <WorkflowTimeline steps={sub.workflowSteps} users={allUsers} submissionType={sub.submissionType} submission={sub} />
        </div>

        {/* Sidebar — first on mobile */}
        <div className="order-1 lg:order-none space-y-4">
          {/* Documents — all versions per form type (FileList handles dedup + history) */}
          {(() => {
            const PROPOSAL_FORMS = ["BW1A", "BW1B", "B1C", "B1D"];
            const relevantUploads = (sub.submissionType ?? "PROPOSAL") === "PROPOSAL"
              ? sub.uploads.filter((u) => PROPOSAL_FORMS.includes(u.formType))
              : sub.uploads;
            return relevantUploads.length > 0 ? (
              <FileList uploads={relevantUploads} submissionTitle={sub.title} submissionType={sub.submissionType ?? "PROPOSAL"} />
            ) : null;
          })()}

          {/* Thesis result selector — ADVISOR at THESIS_DEFENSE step 10 */}
          {isThesisAdvisorResultStep && (
            <div className="bg-white border border-purple-200 rounded-2xl p-5 space-y-3">
              <p className="font-semibold text-gray-800">ผลการสอบวิทยานิพนธ์ <span className="text-red-500">*</span></p>
              <p className="text-xs text-gray-500">กรุณาเลือกผลการสอบก่อนลงนาม</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "ดีมาก",  label: "ดีมาก",  color: "purple" },
                  { value: "ดี",     label: "ดี",     color: "blue"   },
                  { value: "ผ่าน",   label: "ผ่าน",   color: "green"  },
                  { value: "ไม่ผ่าน",label: "ไม่ผ่าน",color: "red"    },
                ].map((opt) => {
                  const selected = thesisResult === opt.value;
                  const colorMap: Record<string, string> = {
                    purple: selected ? "border-purple-500 bg-purple-50 text-purple-800" : "border-gray-200 text-gray-600 hover:border-purple-300",
                    blue:   selected ? "border-blue-500 bg-blue-50 text-blue-800"       : "border-gray-200 text-gray-600 hover:border-blue-300",
                    green:  selected ? "border-green-500 bg-green-50 text-green-800"    : "border-gray-200 text-gray-600 hover:border-green-300",
                    red:    selected ? "border-red-500 bg-red-50 text-red-800"          : "border-gray-200 text-gray-600 hover:border-red-300",
                  };
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setThesisResult(opt.value)}
                      className={`py-2.5 rounded-xl border-2 font-semibold text-sm transition ${colorMap[opt.color]}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {thesisResult === "ดีมาก" && (
                <div className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2.5">
                  <p className="text-xs font-semibold text-purple-700">📋 ผล ดีมาก — ต้องอัปโหลดเพิ่มเติม</p>
                  <p className="text-xs text-purple-600 mt-0.5">กรุณาอัปโหลดแบบประเมินวิทยานิพนธ์ดีมากด้วย (ในขั้นตอนอัปโหลดด้านล่าง)</p>
                </div>
              )}
            </div>
          )}

          {/* Pass/fail selector — HEAD_EXAM_COMMITTEE at PROPOSAL step 5 */}
          {isProposalHeadResultStep && (
            <div className="bg-white border border-blue-200 rounded-2xl p-5 space-y-3">
              <p className="font-semibold text-gray-800">ผลการสอบวิทยานิพนธ์ <span className="text-red-500">*</span></p>
              <p className="text-xs text-gray-500">กรุณาเลือกผลการสอบก่อนลงนาม</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "ผ่าน",    label: "ผ่าน",    color: "green" },
                  { value: "ไม่ผ่าน", label: "ไม่ผ่าน", color: "red"   },
                ].map((opt) => {
                  const selected = thesisResult === opt.value;
                  const colorMap: Record<string, string> = {
                    green: selected ? "border-green-500 bg-green-50 text-green-800" : "border-gray-200 text-gray-600 hover:border-green-300",
                    red:   selected ? "border-red-500 bg-red-50 text-red-800"       : "border-gray-200 text-gray-600 hover:border-red-300",
                  };
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setThesisResult(opt.value)}
                      className={`py-3 rounded-xl border-2 font-semibold text-sm transition ${colorMap[opt.color]}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action — committee steps (EXAM_COMMITTEE, CO_ADVISOR, INVITED_EXAM_COMMITTEE) use sequential multi-member panel */}
          {!sub.cancelRequested && isMyTurn && sub.status === "IN_PROGRESS" && (currentStep?.role === "EXAM_COMMITTEE" || currentStep?.role === "CO_ADVISOR" || currentStep?.role === "INVITED_EXAM_COMMITTEE") && (
            <CommitteeSignPanel
              submissionId={sub.id}
              step={currentStep}
              formsToShow={formsToShow}
              title={currentStep.role === "CO_ADVISOR" ? "อาจารย์ที่ปรึกษาร่วม" : currentStep.role === "INVITED_EXAM_COMMITTEE" ? "กรรมการภายนอก" : undefined}
              onSuccess={() => router.push(backPath)}
            />
          )}

          {!sub.cancelRequested && isMyTurn && sub.status === "IN_PROGRESS" && currentStep?.role !== "EXAM_COMMITTEE" && currentStep?.role !== "CO_ADVISOR" && currentStep?.role !== "INVITED_EXAM_COMMITTEE" && (
            <SignatureButton
              submissionId={sub.id}
              formsToShow={formsToShow}
              onSuccess={() => router.push(backPath)}
              notePrefix={(isThesisAdvisorResultStep || isProposalHeadResultStep) && thesisResult ? `ผลการสอบ: ${thesisResult}` : undefined}
              requireNotePrefix={isThesisAdvisorResultStep || isProposalHeadResultStep}
              extraSlots={
                isThesisAdvisorResultStep && thesisResult === "ดีมาก"
                  ? [{ slotKey: "VERY_GOOD_EVAL", label: "แบบประเมินวิทยานิพนธ์ดีมาก", formType: "VERY_GOOD_EVAL" }]
                  : undefined
              }
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
              <p className="text-red-600 text-sm mt-1">คำร้องถูกปฏิเสธ — นิสิตต้องกด "แก้ไขและยื่นใหม่" ก่อน ระบบจะส่งกลับมาให้พิจารณาอีกครั้ง</p>
            </div>
          )}
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
