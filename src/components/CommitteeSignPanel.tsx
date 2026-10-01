"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { MockWorkflowStep } from "@/types";
import { CheckCircle2, XCircle, Clock, Loader2, Users } from "lucide-react";
import { toUserErrorMessage, formatUserName } from "@/lib/utils";
import {
  UploadSlot, SectionLabel, DownloadRow, NoDownloads, NotesField, ActionError, postUpload,
  ACTION_CARD, PRIMARY_BUTTON, REJECT_BUTTON, CONFIRM_REJECT_BUTTON, CANCEL_BUTTON,
} from "@/components/FileUploader";
import { B1Checklist, allChecked } from "@/components/B1Checklist";
import type { B1Check } from "@/lib/utils";

interface Props {
  submissionId: string;
  step: MockWorkflowStep;
  onSuccess?: () => void;
  formsToShow?: string[];
  title?: string;
  /** Required pre-approve checklist (PROPOSAL 5.x own-signature checks) — ส่งต่อ waits for all ticks */
  checklist?: { title: string; checks: B1Check[] };
}

/** Multi-member signing card (CO_ADVISOR / EXAM_COMMITTEE / INVITED_EXAM_COMMITTEE, sequential).
 *  The acting member's part is the same ① download → ② sign → ③ upload → checklist → notes →
 *  ส่งต่อ / ปฏิเสธ card as SignatureButton, with the member roster above it. */
export function CommitteeSignPanel({ submissionId, step, onSuccess, formsToShow, title, checklist }: Props) {
  const { user, users, submissions, committeeSign } = useApp();
  const { showToast } = useToast();
  const [notes,      setNotes]      = useState("");
  const [showReject, setReject]     = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [signedFile, setSignedFile] = useState<File | null>(null);
  // Set once the signed copy is stored, so a retry after a failed sign doesn't upload it again
  const [uploaded,   setUploaded]   = useState(false);
  const [checks,     setChecks]     = useState<Record<string, boolean>>({});
  const checklistDone = !checklist || allChecked(checklist.checks, checks);

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

  // Latest version of each form this step signs
  const downloads = (() => {
    const list = (sub?.uploads ?? []).filter((u) => !formsToShow?.length || formsToShow.includes(u.formType));
    const latestByType = new Map<string, (typeof list)[number]>();
    for (const u of [...list].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()))
      if (!latestByType.has(u.formType)) latestByType.set(u.formType, u);
    return [...latestByType.values()];
  })();

  async function act(decision: "APPROVED" | "REJECTED") {
    if (decision === "APPROVED" && !signedFile && !uploaded) {
      setError("กรุณาเลือกไฟล์ที่ลงนามแล้วก่อน");
      return;
    }
    if (decision === "APPROVED" && !checklistDone) {
      setError("กรุณาตรวจสอบและทำเครื่องหมายให้ครบทุกข้อก่อน");
      return;
    }
    if (decision === "REJECTED" && !notes.trim()) {
      setError("กรุณาระบุเหตุผลในการปฏิเสธ");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (decision === "APPROVED" && signedFile && !uploaded) {
        await postUpload(submissionId, uploadFormType, signedFile);
        setUploaded(true);
      }
      await committeeSign(submissionId, decision, notes || undefined);
      showToast(
        decision === "APPROVED" ? "อัปโหลดและส่งต่อเรียบร้อยแล้ว ✓" : "บันทึกการปฏิเสธเรียบร้อยแล้ว",
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
    <div className={ACTION_CARD}>
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
                  {a.decision === "APPROVED" ? "ลงนามแล้ว" : "ปฏิเสธ"}
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
          ท่านไม่ได้เป็นกรรมการในขั้นตอนนี้
        </p>
      ) : myAction ? (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${myAction.decision === "APPROVED" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {myAction.decision === "APPROVED"
            ? "✓ ท่านลงนามแล้ว — รอกรรมการลำดับถัดไป"
            : "ท่านปฏิเสธแล้ว"}
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
              รอ{waitingName ? ` ${waitingName}` : `กรรมการลำดับที่ ${myIndex}`} ลงนามก่อน จึงจะถึงคิวของท่าน
            </div>
          );
        })()
      ) : (
        <div className="space-y-5 pt-4 border-t border-gray-100">
          {!showReject && (
            <>
              <div>
                <SectionLabel n={1}>ดาวน์โหลดเอกสารเพื่อลงนาม</SectionLabel>
                {downloads.length > 0 ? (
                  <div className="space-y-2">
                    {downloads.map((u) => <DownloadRow key={u.id} upload={u} submissionTitle={sub?.title ?? ""} />)}
                  </div>
                ) : <NoDownloads />}
              </div>

              <div>
                <SectionLabel n={2}>ลงนามในเอกสาร</SectionLabel>
                <p className="text-sm text-gray-500 pl-6">ลงนามในไฟล์ที่ดาวน์โหลด แล้วบันทึกเป็นไฟล์ PDF</p>
              </div>

              <div>
                <SectionLabel n={3} required>อัปโหลดเอกสารที่ลงนามแล้ว</SectionLabel>
                <UploadSlot
                  formType={uploadFormType}
                  selectedFile={signedFile}
                  onFileSelect={(f) => { setSignedFile(f); setUploaded(false); setError(null); }}
                  done={uploaded && !signedFile}
                  disabled={loading}
                />
              </div>

              {checklist && (
                <B1Checklist title={checklist.title} checks={checklist.checks} value={checks} onChange={setChecks} />
              )}
            </>
          )}

          <NotesField value={notes} onChange={(v) => { setNotes(v); setError(null); }} reject={showReject} />

          <ActionError message={error} />

          <div className="flex gap-3">
            {!showReject ? (
              <>
                <button
                  onClick={() => act("APPROVED")}
                  disabled={loading || (!signedFile && !uploaded) || !checklistDone}
                  className={`${PRIMARY_BUTTON} flex-1`}
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  {loading ? "กำลังบันทึก..." : "ส่งต่อ"}
                </button>
                <button onClick={() => setReject(true)} disabled={loading} className={REJECT_BUTTON}>
                  <XCircle className="w-5 h-5" />
                  ปฏิเสธ
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => act("REJECTED")}
                  disabled={loading}
                  className={CONFIRM_REJECT_BUTTON}
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                  {loading ? "กำลังบันทึก..." : "ยืนยันการปฏิเสธ"}
                </button>
                <button
                  onClick={() => { setReject(false); setError(null); }}
                  disabled={loading}
                  className={CANCEL_BUTTON}
                >
                  ยกเลิก
                </button>
              </>
            )}
          </div>
          <p className="text-xs text-gray-400 text-center">
            กรรมการลงนามตามลำดับ — เมื่อท่านส่งต่อแล้ว ระบบจะแจ้งกรรมการลำดับถัดไป
          </p>
        </div>
      )}
    </div>
  );
}
