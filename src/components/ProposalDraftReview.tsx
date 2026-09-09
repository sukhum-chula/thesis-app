"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { toUserErrorMessage, isValidThaiPhone, PROGRAM_LABELS } from "@/lib/utils";
import { ProgramType } from "@/types";
import { BookOpen, Info, User, Users, Save, Send, Sparkles, XCircle, Trash2 } from "lucide-react";
import {
  FormHeader, Section, Field, ReadOnlyField, ExamLogisticsSection, ConfirmCheckbox,
  CommitteePeopleEditor, buildPeopleFromSubmission, initialPeople, validatePeopleClient, INPUT,
  resolveProgramChair, withProgramChair, ProgramChairAutoField,
  type Person,
} from "@/components/SubmissionForms";

/** Fill-in screen for a PROPOSAL created as a blank DRAFT (see POST
 *  /api/submissions/auto-draft-proposal) the moment the student clicked "สร้าง" on the disabled
 *  template shown before any proposal exists. Nothing is filled in yet — this is the actual
 *  editable form, as opposed to the template preview. Saving keeps it DRAFT (safe to leave and
 *  come back to); confirming starts the real workflow. */
export function ProposalDraftReview({ submissionId }: { submissionId: string }) {
  const { submissions, users, saveProposalDraft, requestCancelSubmission } = useApp();
  const { showToast } = useToast();
  const sub = submissions.find((s) => s.id === submissionId);

  const hasCommittee = !!(
    sub?.advisorId || sub?.headCommitteeId || sub?.committeeIds?.length || sub?.invitedCommitteeIds?.length
  );

  const [title,         setTitle]         = useState(sub?.title ?? "");
  const [program,       setProgram]       = useState<ProgramType | "">((sub?.program as ProgramType) ?? "");
  const [studentPhone,  setStudentPhone]  = useState(sub?.studentPhone ?? "");
  const [people,        setPeople]        = useState<Person[]>(() =>
    hasCommittee && sub ? buildPeopleFromSubmission(sub, users) : initialPeople()
  );
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

  const chair = resolveProgramChair(users, program);

  function validate(): string | null {
    if (!title.trim()) return "กรุณาระบุชื่อหัวข้อ";
    if (!program) return "กรุณาเลือกหลักสูตร";
    if (studentPhone.trim() && !isValidThaiPhone(studentPhone)) return "เบอร์โทรศัพท์ไม่ถูกต้อง (ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0)";
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

  // A plain save is allowed to be incomplete (blank title/program, no committee picked yet, no
  // exam date/time) — only checks a value that was actually typed in and is outright wrong, since
  // that's a mistake rather than something left for later. Full completeness is only required to
  // confirm (see validate() above).
  function validateForSave(): string | null {
    if (studentPhone.trim() && !isValidThaiPhone(studentPhone)) return "เบอร์โทรศัพท์ไม่ถูกต้อง (ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0)";
    if (examDate.trim() && examDate < new Date().toISOString().split("T")[0]) return "วันที่สอบต้องเป็นวันนี้หรือวันในอนาคต";
    return null;
  }

  function draftData() {
    return {
      title: title.trim(),
      program: program as string,
      studentPhone: studentPhone.trim() || undefined,
      people: withProgramChair(people, chair).map((p) => ({
        name: p.name.trim(), email: p.email.trim(), role: p.role, phone: p.phone.trim() || undefined,
      })),
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
      await saveProposalDraft(sub!.id, draftData(), false);
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
      await saveProposalDraft(sub!.id, draftData(), true);
      showToast("ยืนยันคำร้องขอสอบโครงร่างวิทยานิพนธ์แล้ว — เริ่มดำเนินการ", "info");
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
        isProposal
        icon={<BookOpen className="w-5 h-5 text-white" />}
        title="กรอกข้อมูลคำร้องขอสอบโครงร่างวิทยานิพนธ์ (ฉบับร่าง)"
        desc="คำร้องขอสอบโครงร่างวิทยานิพนธ์ (บ.วศ.1ก / บ.วศ.1ข / บ.วศ.1ค / บ.วศ.1ง)"
      />

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-2xl p-4">
        <Sparkles className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-900">สร้างฉบับร่างแล้ว — กรอกข้อมูลด้านล่างได้ตามต้องการ</p>
          <p className="text-xs text-blue-600 mt-0.5">
            บันทึกไว้เป็นฉบับร่างได้ ยังไม่มีผลใดๆ จนกว่าท่านจะกด &ldquo;ยืนยัน&rdquo;
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

        <Section icon={<User className="w-4 h-4" />} title="ข้อมูลนิสิต">
          <div className="grid sm:grid-cols-2 gap-4">
            <ReadOnlyField label="ชื่อ-นามสกุล" value={sub.studentFullName} />
            <ReadOnlyField label="รหัสนิสิต"     value={sub.studentCode} />
            <Field label="หลักสูตร" required>
              <select
                value={program}
                onChange={(e) => { setProgram(e.target.value as ProgramType | ""); setError(null); }}
                className={INPUT + " bg-white"}
              >
                <option value="">— เลือกหลักสูตร —</option>
                {(Object.entries(PROGRAM_LABELS) as [string, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
            <ProgramChairAutoField program={program} users={users} />
            <ReadOnlyField label="อีเมล" value={sub.studentEmail} />
            <Field label="เบอร์โทรศัพท์">
              <input value={studentPhone} onChange={(e) => setStudentPhone(e.target.value)} className={INPUT} placeholder="0812345678" />
            </Field>
          </div>
        </Section>

        <Section icon={<Users className="w-4 h-4" />} title="ผู้รับผิดชอบวิทยานิพนธ์">
          <div className="text-xs text-gray-500 -mt-1 space-y-1">
            <p>
              เลือกอาจารย์และกรรมการที่รับผิดชอบวิทยานิพนธ์ของท่านจากรายชื่อในระบบเท่านั้น — ประธานหลักสูตรกำหนดให้อัตโนมัติแล้วด้านบน
            </p>
            <p>
              หากไม่พบชื่อกรรมการภายนอก นิสิตสามารถยื่นคำขอสร้างบัญชีใหม่ได้ที่แท็บ &ldquo;กรรมการภายนอก&rdquo; แล้วรอเจ้าหน้าที่อนุมัติก่อนจึงจะเลือกได้ที่นี่
            </p>
          </div>
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
            className="flex-1 flex items-center justify-center gap-2 py-3.5 text-white font-semibold rounded-xl transition shadow-sm text-base disabled:opacity-50 bg-blue-600 hover:bg-blue-700"
          >
            <Send className="w-4 h-4" />
            {confirming ? "กำลังยืนยัน..." : "ยืนยัน — ขอสอบโครงร่างวิทยานิพนธ์"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowCancelModal(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-200 text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-50 hover:text-gray-600 transition"
        >
          <XCircle className="w-4 h-4" />
          ไม่ต้องการยื่นขอสอบโครงร่างวิทยานิพนธ์ตอนนี้
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
