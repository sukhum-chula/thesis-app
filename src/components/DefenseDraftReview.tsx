"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { toUserErrorMessage } from "@/lib/utils";
import { GraduationCap, Info, User, Users, Save, Send, Sparkles, XCircle, Trash2 } from "lucide-react";
import {
  FormHeader, Section, Field, ReadOnlyField, ExamLogisticsSection, ConfirmCheckbox,
  CommitteePeopleEditor, buildPeopleFromSubmission, validatePeopleClient, INPUT,
  resolveProgramChair, withProgramChair, ProgramChairAutoField,
  type Person,
} from "@/components/SubmissionForms";
import { PROGRAM_LABELS } from "@/lib/utils";

/** Review/edit screen for a THESIS_DEFENSE that was auto-created as a DRAFT (see
 *  POST /api/submissions/auto-draft-defense) the moment the student's proposal completed and
 *  they opened the "สอบวิทยานิพนธ์" tab — every field is already imported from that proposal, so
 *  this is purely "check, fix if needed, then confirm" rather than filling a blank form. Saving
 *  keeps it DRAFT (safe to leave and come back to); confirming starts the real workflow. */
export function DefenseDraftReview({ submissionId }: { submissionId: string }) {
  const { submissions, users, saveDefenseDraft, requestCancelSubmission } = useApp();
  const { showToast } = useToast();
  const sub = submissions.find((s) => s.id === submissionId);

  const [title,         setTitle]         = useState(sub?.title ?? "");
  const [people,        setPeople]        = useState<Person[]>(sub ? buildPeopleFromSubmission(sub, users) : []);
  const [examDate,      setExamDate]      = useState(sub?.examDate ?? "");
  const [examTime,      setExamTime]      = useState(sub?.examTime ?? "");
  const [roomNeeded,    setRoomNeeded]    = useState(sub?.roomNeeded ?? false);
  const [parkingNeeded, setParkingNeeded] = useState(sub?.parkingNeeded ?? false);
  const [carPlate,      setCarPlate]      = useState(sub?.carPlate ?? "");
  const [error,         setError]         = useState<string | null>(null);
  const [confirmed,     setConfirmed]     = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [confirming,    setConfirming]    = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  if (!sub) return null;

  const chair = resolveProgramChair(users, sub?.program ?? "");

  function validate(): string | null {
    if (!title.trim()) return "กรุณาระบุชื่อหัวข้อ";
    if (!chair) return "ยังไม่ได้กำหนดประธานหลักสูตรสำหรับหลักสูตรนี้ กรุณาติดต่อเจ้าหน้าที่ภาควิชา";
    const ownEmails = [sub!.studentEmail?.toLowerCase()].filter((e): e is string => !!e);
    const peopleError = validatePeopleClient(withProgramChair(people, chair), ownEmails);
    if (peopleError) return peopleError;
    if (!examDate.trim()) return "กรุณาระบุวันที่สอบ";
    if (examDate < new Date().toISOString().split("T")[0]) return "วันที่สอบต้องเป็นวันนี้หรือวันในอนาคต";
    if (!examTime.trim()) return "กรุณาระบุเวลาสอบ";
    if (parkingNeeded && !carPlate.trim()) return "กรุณาระบุเลขทะเบียนรถ";
    return null;
  }

  // A plain save is allowed to be incomplete — only checks that a filled-in exam date isn't
  // outright wrong (in the past). Full completeness is only required to confirm (see validate()).
  function validateForSave(): string | null {
    if (examDate.trim() && examDate < new Date().toISOString().split("T")[0]) return "วันที่สอบต้องเป็นวันนี้หรือวันในอนาคต";
    return null;
  }

  function draftData() {
    return {
      title: title.trim(),
      people: withProgramChair(people, chair).map((p) => ({ name: p.name.trim(), email: p.email.trim(), role: p.role, phone: p.phone.trim() || undefined })),
      examDate,
      examTime,
      roomNeeded,
      parkingNeeded,
      carPlate: parkingNeeded ? carPlate.trim() : undefined,
    };
  }

  async function handleSave() {
    const v = validateForSave();
    if (v) { setError(v); return; }
    setError(null);
    setSaving(true);
    try {
      await saveDefenseDraft(sub!.id, draftData(), false);
      showToast("บันทึกฉบับร่างแล้ว", "info");
    } catch (err) {
      showToast(toUserErrorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirm() {
    const v = validate();
    if (v) { setError(v); return; }
    setError(null);
    setConfirming(true);
    try {
      await saveDefenseDraft(sub!.id, draftData(), true);
      showToast("ยืนยันคำร้องขอสอบวิทยานิพนธ์แล้ว — เริ่มดำเนินการ", "info");
    } catch (err) {
      showToast(toUserErrorMessage(err), "error");
    } finally {
      setConfirming(false);
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

  return (
    <div className="space-y-6">
      <FormHeader
        isProposal={false}
        icon={<GraduationCap className="w-5 h-5 text-white" />}
        title="ตรวจสอบคำร้องขอสอบวิทยานิพนธ์ (ฉบับร่าง)"
        desc="คำร้องขอสอบวิทยานิพนธ์ (บ.2 / บ.3 / บ.4)"
      />

      <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
        <Sparkles className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-indigo-900">นำเข้าข้อมูลจากคำร้องโครงร่างที่เสร็จสมบูรณ์แล้วโดยอัตโนมัติ</p>
          <p className="text-xs text-indigo-600 mt-0.5">
            ตรวจสอบและแก้ไขข้อมูลด้านล่างได้ตามต้องการ — ยังไม่มีผลใดๆ จนกว่าท่านจะกด &ldquo;ยืนยัน&rdquo;
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <Section icon={<Info className="w-4 h-4" />} title="ข้อมูลวิทยานิพนธ์">
          <Field label="ชื่อหัวข้อวิทยานิพนธ์" required>
            <input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(null); }}
              className={INPUT}
              placeholder="เช่น การพัฒนาระบบ..."
            />
          </Field>
        </Section>

        <Section icon={<User className="w-4 h-4" />} title="ข้อมูลนิสิต (นำเข้าจากคำร้องโครงร่าง)">
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
            <ReadOnlyField label="ชื่อ-นามสกุล" value={sub.studentFullName} />
            <ReadOnlyField label="รหัสนิสิต"     value={sub.studentCode} />
            <ReadOnlyField label="หลักสูตร"      value={sub.program ? PROGRAM_LABELS[sub.program] : undefined} />
            <ReadOnlyField label="อีเมล"          value={sub.studentEmail} />
          </div>
          <ProgramChairAutoField program={sub.program ?? ""} users={users} />
        </Section>

        <Section icon={<Users className="w-4 h-4" />} title="ผู้รับผิดชอบวิทยานิพนธ์">
          <p className="text-xs text-gray-500 -mt-1">
            นำเข้าจากคำร้องโครงร่าง — เลือกจากรายชื่อในระบบเท่านั้น แก้ไขได้หากต้องการเปลี่ยนแปลง
            (ไม่มีผลย้อนกลับไปยังคำร้องโครงร่างเดิม) ประธานหลักสูตรกำหนดให้อัตโนมัติแล้วด้านบน
          </p>
          <CommitteePeopleEditor people={people} setPeople={setPeople} clearError={() => setError(null)} />
        </Section>

        <ExamLogisticsSection
          examDate={examDate} setExamDate={setExamDate}
          examTime={examTime} setExamTime={setExamTime}
          roomNeeded={roomNeeded} setRoomNeeded={setRoomNeeded}
          parkingNeeded={parkingNeeded} setParkingNeeded={setParkingNeeded}
          carPlate={carPlate} setCarPlate={setCarPlate}
          clearError={() => setError(null)}
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
        )}

        <ConfirmCheckbox confirmed={confirmed} setConfirmed={setConfirmed} />

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || confirming}
            className="flex items-center justify-center gap-2 px-5 py-3.5 border border-gray-300 text-gray-600 font-medium rounded-xl hover:bg-gray-50 disabled:opacity-50 transition"
          >
            <Save className="w-4 h-4" />
            {saving ? "กำลังบันทึก..." : "บันทึกฉบับร่าง"}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!confirmed || saving || confirming}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 text-white font-semibold rounded-xl transition shadow-sm text-base disabled:opacity-50 bg-indigo-600 hover:bg-indigo-700"
          >
            <Send className="w-4 h-4" />
            {confirming ? "กำลังยืนยัน..." : "ยืนยัน — ขอสอบวิทยานิพนธ์"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowCancelModal(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-200 text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-50 hover:text-gray-600 transition"
        >
          <XCircle className="w-4 h-4" />
          ไม่ต้องการยื่นขอสอบวิทยานิพนธ์ตอนนี้
        </button>
      </div>

      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900">ยืนยันการขอยกเลิกฉบับร่างนี้</p>
                <p className="text-sm text-gray-500">คำขอจะถูกส่งให้เจ้าหน้าที่พิจารณา</p>
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
