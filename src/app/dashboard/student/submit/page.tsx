"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp, SubmissionFormData } from "@/context/AppContext";
import { PROGRAM_LABELS, ROLE_LABELS, isValidEmail, isValidStudentId, isValidThaiPhone, formatDate } from "@/lib/utils";
import { ProgramType, SubmissionType } from "@/types";
import { ArrowLeft, User, Users, CalendarDays, Info, X, Plus, BookOpen, GraduationCap, AlertCircle, Lock } from "lucide-react";
import Link from "next/link";

// ─── Committee person entry (PROPOSAL only) ────────────────────────────────────

const PERSON_ROLES = [
  "ADVISOR",
  "CO_ADVISOR",
  "HEAD_EXAM_COMMITTEE",
  "EXAM_COMMITTEE",
  "INVITED_EXAM_COMMITTEE",
  "PROGRAM_CHAIR",
] as const;

interface Person {
  name: string;
  email: string;
  role: string;
  phone: string;
}

// ประธานหลักสูตรประจำแต่ละหลักสูตร — กรอกให้อัตโนมัติเมื่อนิสิตเลือกหลักสูตร (แก้ไขได้)
const PROGRAM_CHAIR_BY_PROGRAM: Record<string, { name: string; email: string }> = {
  PHD:     { name: "รศ.ดร.จิตติน แตงเที่ยง",       email: "qed690@yahoo.com" },
  ME_MECH: { name: "รศ.ดร.จิตติน แตงเที่ยง",       email: "qed690@yahoo.com" },
  ME_CPS:  { name: "ผศ.ดร.ณัฐพล ดำรงค์พลาสิทธิ์", email: "nattapol.d@chula.ac.th" },
};

const emptyPerson = (role = ""): Person => ({ name: "", email: "", role, phone: "" });

const initialPeople = (): Person[] => [emptyPerson()];

const ROLE_REQUIREMENTS: { role: string; label: string; min: number; max: number | null }[] = [
  { role: "ADVISOR",                label: "อาจารย์ที่ปรึกษา",   min: 1, max: 1 },
  { role: "PROGRAM_CHAIR",          label: "ประธานหลักสูตร",     min: 1, max: 1 },
  { role: "HEAD_EXAM_COMMITTEE",    label: "ประธานกรรมการสอบ",  min: 1, max: 1 },
  { role: "EXAM_COMMITTEE",         label: "กรรมการสอบ",         min: 1, max: null },
  { role: "INVITED_EXAM_COMMITTEE", label: "กรรมการภายนอก",      min: 1, max: 1 },
];

// Shared shape/format/role-count validation used by both ProposalForm and DefenseForm — mirrors
// (but is a separate copy of) the server-side check in src/lib/committee.ts's validatePeople().
function validatePeopleClient(people: Person[], ownEmails: string[]): string | null {
  const seenRoleEmail = new Set<string>();
  for (const [i, p] of people.entries()) {
    if (!p.name.trim())  return `กรุณาระบุชื่อ-นามสกุลของบุคคลที่ ${i + 1}`;
    if (!p.email.trim()) return `กรุณาระบุอีเมลของบุคคลที่ ${i + 1}`;
    if (!isValidEmail(p.email)) return `บุคคลที่ ${i + 1}: รูปแบบอีเมลไม่ถูกต้อง (${p.email.trim()})`;
    if (!p.role) return `กรุณาเลือกบทบาทของบุคคลที่ ${i + 1}`;
    if (p.phone.trim() && !isValidThaiPhone(p.phone)) return `บุคคลที่ ${i + 1}: เบอร์โทรศัพท์ไม่ถูกต้อง (ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0)`;
    const email = p.email.trim().toLowerCase();
    if (ownEmails.includes(email)) return `บุคคลที่ ${i + 1}: ไม่สามารถใช้อีเมลของท่านเองเป็นกรรมการได้`;
    const key = `${p.role}:${email}`;
    if (seenRoleEmail.has(key)) return `บุคคลที่ ${i + 1}: อีเมลนี้ถูกเพิ่มในบทบาทเดียวกันแล้ว`;
    seenRoleEmail.add(key);
  }
  const count = (r: string) => people.filter((p) => p.role === r).length;
  if (count("PROGRAM_CHAIR") !== 1)          return "ต้องระบุประธานหลักสูตร 1 คน (เพิ่มได้เพียง 1 คนเท่านั้น)";
  if (count("ADVISOR") !== 1)                return "ต้องระบุอาจารย์ที่ปรึกษา 1 คน";
  if (count("HEAD_EXAM_COMMITTEE") !== 1)    return "ต้องระบุประธานกรรมการสอบ 1 คน";
  if (count("EXAM_COMMITTEE") < 1)           return "ต้องระบุกรรมการสอบอย่างน้อย 1 คน";
  if (count("INVITED_EXAM_COMMITTEE") !== 1) return "ต้องระบุกรรมการภายนอก 1 คน";
  return null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewSubmissionPage() {
  const searchParams = useSearchParams();
  const rawType = searchParams.get("type");
  const submissionType: SubmissionType =
    rawType === "defense" ? "THESIS_DEFENSE" : "PROPOSAL";

  const { submissions, user } = useApp();
  const mine = submissions.filter((s) => s.studentId === user?.id);

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/student-dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-2 -my-2">
        <ArrowLeft className="w-4 h-4" />
        ย้อนกลับ
      </Link>

      {submissionType === "PROPOSAL"
        ? <ProposalForm mine={mine} />
        : <DefenseForm mine={mine} />}
    </div>
  );
}

// ─── PROPOSAL — unchanged manual committee-entry form ──────────────────────────

function ProposalForm({ mine }: { mine: ReturnType<typeof useApp>["submissions"] }) {
  const router = useRouter();
  const { createSubmission, user } = useApp();

  const activeProposal = mine.find((s) => s.submissionType === "PROPOSAL" && s.status !== "CANCELLED");

  const [title,           setTitle]           = useState("");
  const [studentFullName, setStudentFullName] = useState("");
  const [studentCode,     setStudentCode]     = useState("");
  const [program,         setProgram]         = useState<ProgramType | "">("");
  const [studentEmail,    setStudentEmail]    = useState("");
  const [studentPhone,    setStudentPhone]    = useState("");
  const [people,          setPeople]          = useState<Person[]>(initialPeople);
  const [examDate,        setExamDate]        = useState("");
  const [examTime,        setExamTime]        = useState("");
  const [roomNeeded,      setRoomNeeded]      = useState(false);
  const [parkingNeeded,   setParkingNeeded]   = useState(false);
  const [carPlate,        setCarPlate]        = useState("");
  const [error,           setError]           = useState<string | null>(null);
  const [confirmed,       setConfirmed]       = useState(false);
  const [submitting,      setSubmitting]      = useState(false);

  // Prefill student info from the logged-in account (still editable)
  useEffect(() => {
    if (!user) return;
    setStudentFullName((v) => v || user.name || "");
    setStudentCode((v) => v || user.studentId || "");
    setStudentEmail((v) => v || user.email || "");
  }, [user]);

  function handleProgramChange(p: ProgramType | "") {
    setProgram(p);
    setError(null);
    const chair = p ? PROGRAM_CHAIR_BY_PROGRAM[p] : undefined;
    if (!chair) return;
    setPeople((prev) => {
      const row: Person = { name: chair.name, email: chair.email, role: "PROGRAM_CHAIR", phone: "" };
      const chairIdx = prev.findIndex((x) => x.role === "PROGRAM_CHAIR");
      if (chairIdx >= 0) {
        return prev.map((x, i) => (i === chairIdx ? { ...row, phone: x.phone } : x));
      }
      const emptyIdx = prev.findIndex((x) => !x.name.trim() && !x.email.trim() && !x.role);
      if (emptyIdx >= 0) return prev.map((x, i) => (i === emptyIdx ? row : x));
      return [...prev, row];
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim())           { setError("กรุณาระบุชื่อหัวข้อ");     return; }
    if (!studentFullName.trim()) { setError("กรุณาระบุชื่อ-นามสกุล");   return; }
    if (!studentCode.trim())     { setError("กรุณาระบุรหัสนิสิต");      return; }
    if (!isValidStudentId(studentCode)) { setError("รหัสนิสิตต้องเป็นตัวเลข 10 หลัก"); return; }
    if (!program)                { setError("กรุณาเลือกหลักสูตร");       return; }
    if (!studentEmail.trim())    { setError("กรุณาระบุอีเมล");          return; }
    if (!isValidEmail(studentEmail)) { setError("รูปแบบอีเมลของท่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง"); return; }
    if (studentPhone.trim() && !isValidThaiPhone(studentPhone)) { setError("เบอร์โทรศัพท์ไม่ถูกต้อง (ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0)"); return; }

    const ownEmails = [user?.email?.toLowerCase(), studentEmail.trim().toLowerCase()].filter(Boolean) as string[];
    const peopleError = validatePeopleClient(people, ownEmails);
    if (peopleError) { setError(peopleError); return; }

    if (!examDate.trim()) { setError("กรุณาระบุวันที่สอบ"); return; }
    if (examDate < new Date().toISOString().split("T")[0]) { setError("วันที่สอบต้องเป็นวันนี้หรือวันในอนาคต"); return; }
    if (!examTime.trim()) { setError("กรุณาระบุเวลาสอบ");   return; }
    if (parkingNeeded && !carPlate.trim()) { setError("กรุณาระบุเลขทะเบียนรถ"); return; }

    setError(null);
    setSubmitting(true);
    try {
      const data: SubmissionFormData = {
        title: title.trim(),
        submissionType: "PROPOSAL",
        studentFullName: studentFullName.trim(),
        studentCode: studentCode.trim(),
        program: program as ProgramType,
        studentEmail: studentEmail.trim(),
        studentPhone: studentPhone.trim(),
        people: people.map((p) => ({
          name: p.name.trim(),
          email: p.email.trim(),
          role: p.role,
          phone: p.phone.trim() || undefined,
        })),
        examDate: examDate || undefined,
        examTime: examTime || undefined,
        roomNeeded,
        parkingNeeded,
        carPlate: parkingNeeded ? carPlate.trim() : undefined,
      };
      const sub = await createSubmission(data);
      router.push(`/dashboard/student/${sub.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
      setSubmitting(false);
    }
  }

  if (activeProposal) {
    return (
      <BlockingNotice
        icon={<Lock className="w-5 h-5 text-white" />}
        title="มีคำร้องขอสอบโครงร่างที่ใช้งานอยู่แล้ว"
        desc="นิสิตสามารถมีคำร้องขอสอบโครงร่างที่ใช้งานอยู่ได้ครั้งละ 1 คำร้องเท่านั้น หากต้องการยื่นใหม่ กรุณายกเลิกคำร้องเดิมก่อน"
        linkHref={`/dashboard/student/${activeProposal.id}`}
        linkLabel={`ดูคำร้อง: ${activeProposal.title}`}
      />
    );
  }

  return (
    <>
      <FormHeader isProposal icon={<BookOpen className="w-5 h-5 text-white" />}
        title="ขอสอบโครงร่างวิทยานิพนธ์"
        desc="คำร้องขอสอบโครงร่างวิทยานิพนธ์ (บ.วศ.1ก / บ.วศ.1ข / บ.วศ.1ค / บ.วศ.1ง)" />

      <form onSubmit={handleSubmit} className="space-y-6">
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
            <Field label="ชื่อ-นามสกุล" required>
              <input value={studentFullName} onChange={(e) => setStudentFullName(e.target.value)} className={INPUT} placeholder="ชื่อ นามสกุล" />
            </Field>
            <Field label="รหัสนิสิต" required>
              <input value={studentCode} onChange={(e) => setStudentCode(e.target.value)} className={INPUT} placeholder="เช่น 6733100421" inputMode="numeric" maxLength={10} />
            </Field>
            <Field label="หลักสูตร" required>
              <select value={program} onChange={(e) => handleProgramChange(e.target.value as ProgramType | "")} className={INPUT + " bg-white"}>
                <option value="">— เลือกหลักสูตร —</option>
                {(Object.entries(PROGRAM_LABELS) as [string, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">ระบบจะกรอกประธานหลักสูตรให้อัตโนมัติตามหลักสูตรที่เลือก</p>
            </Field>
            <Field label="อีเมล" required>
              <input type="email" value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)} className={INPUT} placeholder="email@chula.ac.th" />
            </Field>
            <Field label="เบอร์โทรศัพท์">
              <input value={studentPhone} onChange={(e) => setStudentPhone(e.target.value)} className={INPUT} placeholder="0812345678" />
            </Field>
          </div>
        </Section>

        <Section icon={<Users className="w-4 h-4" />} title="ผู้รับผิดชอบวิทยานิพนธ์">
          <div className="text-xs text-gray-500 -mt-1">
            <p>
              กรอกข้อมูลอาจารย์และกรรมการที่รับผิดชอบวิทยานิพนธ์ของท่านด้วยตนเอง — ทุกคนต้องมีบัญชีในระบบอยู่แล้ว
              หากมีผู้ที่ยังไม่มีบัญชี คำร้องจะถูกบันทึกเป็นฉบับร่างจนกว่าเจ้าหน้าที่จะสร้างบัญชีให้
              (อาจารย์ที่ปรึกษาร่วมเพิ่มได้ตามต้องการ)
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

        <button
          type="submit"
          disabled={!confirmed || submitting}
          className="w-full py-3.5 text-white font-semibold rounded-xl transition shadow-sm text-base disabled:opacity-50 bg-blue-600 hover:bg-blue-700"
        >
          {submitting ? "กำลังยื่น..." : "ยืนยัน — ขอสอบโครงร่างวิทยานิพนธ์"}
        </button>
      </form>
    </>
  );
}

// ─── THESIS_DEFENSE — imports committee/student info from a completed proposal ─

// Seeds a Person[] editor state from a proposal's already-resolved committee, so the student
// edits a prefilled list instead of starting from scratch. Never mutates the proposal itself.
function buildPeopleFromProposal(
  p: ReturnType<typeof useApp>["submissions"][number],
  users: ReturnType<typeof useApp>["users"]
): Person[] {
  const nameOf  = (id?: string | null) => users.find((u) => u.id === id)?.name ?? "";
  const emailOf = (id?: string | null) => users.find((u) => u.id === id)?.email ?? "";
  const result: Person[] = [];
  if (p.advisorId) result.push({ name: nameOf(p.advisorId), email: emailOf(p.advisorId), role: "ADVISOR", phone: "" });
  for (const id of p.coAdvisorIds ?? []) result.push({ name: nameOf(id), email: emailOf(id), role: "CO_ADVISOR", phone: "" });
  if (p.headCommitteeId) result.push({ name: nameOf(p.headCommitteeId), email: emailOf(p.headCommitteeId), role: "HEAD_EXAM_COMMITTEE", phone: "" });
  for (const id of p.committeeIds ?? []) result.push({ name: nameOf(id), email: emailOf(id), role: "EXAM_COMMITTEE", phone: "" });
  if (p.invitedCommitteeId || p.invitedProfName) {
    result.push({
      name: p.invitedProfName || nameOf(p.invitedCommitteeId),
      email: p.invitedProfEmail || emailOf(p.invitedCommitteeId),
      role: "INVITED_EXAM_COMMITTEE",
      phone: p.invitedProfPhone || "",
    });
  }
  if (p.programChairId) result.push({ name: nameOf(p.programChairId), email: emailOf(p.programChairId), role: "PROGRAM_CHAIR", phone: "" });
  return result.length ? result : [emptyPerson()];
}

function DefenseForm({ mine }: { mine: ReturnType<typeof useApp>["submissions"] }) {
  const router = useRouter();
  const { createSubmission, users, user } = useApp();

  // Eligible: COMPLETED, and no existing non-cancelled defense already sourced from it
  const eligibleProposals = mine.filter(
    (s) =>
      s.submissionType === "PROPOSAL" &&
      s.status === "COMPLETED" &&
      !mine.some((d) => d.sourceProposalId === s.id && d.status !== "CANCELLED")
  );

  const [selectedId,    setSelectedId]    = useState<string>(eligibleProposals[0]?.id ?? "");
  const selected = eligibleProposals.find((p) => p.id === selectedId) ?? null;

  const [title,         setTitle]         = useState("");
  const [people,        setPeople]        = useState<Person[]>([]);
  const [examDate,      setExamDate]      = useState("");
  const [examTime,      setExamTime]      = useState("");
  const [roomNeeded,    setRoomNeeded]    = useState(false);
  const [parkingNeeded, setParkingNeeded] = useState(false);
  const [carPlate,      setCarPlate]      = useState("");
  const [error,         setError]         = useState<string | null>(null);
  const [confirmed,     setConfirmed]     = useState(false);
  const [submitting,    setSubmitting]    = useState(false);

  // Prefill the title and committee from the selected proposal (both still editable) whenever
  // the selection changes — the thesis title can evolve, and the committee too.
  useEffect(() => {
    if (!selected) { setPeople([]); return; }
    setTitle((v) => v || selected.title);
    setPeople(buildPeopleFromProposal(selected, users));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  if (eligibleProposals.length === 0) {
    return (
      <BlockingNotice
        icon={<Lock className="w-5 h-5 text-white" />}
        title="ยังไม่มีคำร้องโครงร่างที่พร้อมใช้งาน"
        desc="ต้องมีคำร้องขอสอบโครงร่างวิทยานิพนธ์ที่เสร็จสมบูรณ์แล้ว และยังไม่ถูกใช้สร้างคำร้องขอสอบวิทยานิพนธ์ ก่อนจึงจะยื่นขอสอบวิทยานิพนธ์ได้"
        linkHref="/student-dashboard"
        linkLabel="กลับหน้าหลัก"
      />
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) { setError("กรุณาเลือกคำร้องขอสอบโครงร่างที่จะนำเข้าข้อมูล"); return; }
    if (!title.trim()) { setError("กรุณาระบุชื่อหัวข้อ"); return; }

    const ownEmails = [user?.email?.toLowerCase(), selected.studentEmail?.toLowerCase()].filter(Boolean) as string[];
    const peopleError = validatePeopleClient(people, ownEmails);
    if (peopleError) { setError(peopleError); return; }

    if (!examDate.trim()) { setError("กรุณาระบุวันที่สอบ"); return; }
    if (examDate < new Date().toISOString().split("T")[0]) { setError("วันที่สอบต้องเป็นวันนี้หรือวันในอนาคต"); return; }
    if (!examTime.trim()) { setError("กรุณาระบุเวลาสอบ"); return; }
    if (parkingNeeded && !carPlate.trim()) { setError("กรุณาระบุเลขทะเบียนรถ"); return; }

    setError(null);
    setSubmitting(true);
    try {
      const data: SubmissionFormData = {
        title: title.trim(),
        submissionType: "THESIS_DEFENSE",
        sourceProposalId: selected.id,
        people: people.map((p) => ({
          name: p.name.trim(),
          email: p.email.trim(),
          role: p.role,
          phone: p.phone.trim() || undefined,
        })),
        examDate: examDate || undefined,
        examTime: examTime || undefined,
        roomNeeded,
        parkingNeeded,
        carPlate: parkingNeeded ? carPlate.trim() : undefined,
      };
      const sub = await createSubmission(data);
      router.push(`/dashboard/student/${sub.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
      setSubmitting(false);
    }
  }

  return (
    <>
      <FormHeader isProposal={false} icon={<GraduationCap className="w-5 h-5 text-white" />}
        title="ขอสอบวิทยานิพนธ์"
        desc="คำร้องขอสอบวิทยานิพนธ์ (บ.2 / บ.3 / บ.4) — นำเข้าข้อมูลจากคำร้องโครงร่างที่เสร็จสมบูรณ์" />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Section icon={<BookOpen className="w-4 h-4" />} title="เลือกคำร้องโครงร่างที่จะนำเข้าข้อมูล">
          <div className="space-y-2">
            {eligibleProposals.map((p) => (
              <label
                key={p.id}
                className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition ${
                  selectedId === p.id ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-indigo-200"
                }`}
              >
                <input
                  type="radio"
                  name="sourceProposal"
                  checked={selectedId === p.id}
                  onChange={() => { setSelectedId(p.id); setTitle(p.title); }}
                  className="mt-1 w-4 h-4 accent-indigo-600 shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{p.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">ยื่นเมื่อ {formatDate(p.createdAt)}</p>
                </div>
              </label>
            ))}
          </div>
        </Section>

        {selected && (
          <>
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
                <ReadOnlyField label="ชื่อ-นามสกุล" value={selected.studentFullName} />
                <ReadOnlyField label="รหัสนิสิต"     value={selected.studentCode} />
                <ReadOnlyField label="หลักสูตร"      value={selected.program ? PROGRAM_LABELS[selected.program] : undefined} />
                <ReadOnlyField label="อีเมล"          value={selected.studentEmail} />
              </div>
            </Section>

            <Section icon={<Users className="w-4 h-4" />} title="ผู้รับผิดชอบวิทยานิพนธ์">
              <p className="text-xs text-gray-500 -mt-1">
                นำเข้าจากคำร้องโครงร่างที่เลือก — แก้ไขได้หากต้องการเปลี่ยนแปลง (ไม่มีผลย้อนกลับไปยังคำร้องโครงร่างเดิม)
                ทุกคนต้องมีบัญชีในระบบอยู่แล้ว มิฉะนั้นคำร้องนี้จะถูกบันทึกเป็นฉบับร่างจนกว่าเจ้าหน้าที่จะสร้างบัญชีให้
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

            <button
              type="submit"
              disabled={!confirmed || submitting}
              className="w-full py-3.5 text-white font-semibold rounded-xl transition shadow-sm text-base disabled:opacity-50 bg-indigo-600 hover:bg-indigo-700"
            >
              {submitting ? "กำลังยื่น..." : "ยืนยัน — ขอสอบวิทยานิพนธ์"}
            </button>
          </>
        )}
      </form>
    </>
  );
}

// ─── Shared building blocks ─────────────────────────────────────────────────────

function BlockingNotice({ icon, title, desc, linkHref, linkLabel }: {
  icon: React.ReactNode; title: string; desc: string; linkHref: string; linkLabel: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 text-center">
      <div className="mx-auto w-12 h-12 rounded-xl bg-gray-400 flex items-center justify-center">{icon}</div>
      <div>
        <p className="font-bold text-gray-800 text-lg">{title}</p>
        <p className="text-sm text-gray-500 mt-1.5">{desc}</p>
      </div>
      <Link
        href={linkHref}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-gray-800 text-white rounded-xl font-medium hover:bg-gray-900 transition text-sm"
      >
        {linkLabel}
      </Link>
    </div>
  );
}

function FormHeader({ isProposal, icon, title, desc }: {
  isProposal: boolean; icon: React.ReactNode; title: string; desc: string;
}) {
  return (
    <div className={`rounded-2xl p-4 sm:p-5 flex items-start gap-3 sm:gap-4 ${isProposal ? "bg-blue-50 border border-blue-200" : "bg-indigo-50 border border-indigo-200"}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isProposal ? "bg-blue-600" : "bg-indigo-600"}`}>
        {icon}
      </div>
      <div>
        <h1 className={`text-xl font-bold ${isProposal ? "text-blue-900" : "text-indigo-900"}`}>{title}</h1>
        <p className={`text-sm mt-0.5 ${isProposal ? "text-blue-600" : "text-indigo-600"}`}>{desc}</p>
      </div>
    </div>
  );
}

function ExamLogisticsSection({
  examDate, setExamDate, examTime, setExamTime,
  roomNeeded, setRoomNeeded, parkingNeeded, setParkingNeeded, carPlate, setCarPlate, clearError,
}: {
  examDate: string; setExamDate: (v: string) => void;
  examTime: string; setExamTime: (v: string) => void;
  roomNeeded: boolean; setRoomNeeded: (v: boolean) => void;
  parkingNeeded: boolean; setParkingNeeded: (v: boolean) => void;
  carPlate: string; setCarPlate: (v: string) => void;
  clearError: () => void;
}) {
  return (
    <Section icon={<CalendarDays className="w-4 h-4" />} title="ข้อมูลการสอบ">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="วันที่สอบ" required>
          <input type="date" value={examDate} min={new Date().toISOString().split("T")[0]} onChange={(e) => { setExamDate(e.target.value); clearError(); }} className={INPUT} />
        </Field>
        <Field label="เวลาสอบ" required>
          <input type="time" value={examTime} onChange={(e) => { setExamTime(e.target.value); clearError(); }} className={INPUT} />
        </Field>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 cursor-pointer hover:border-blue-300">
          <input type="checkbox" checked={roomNeeded} onChange={(e) => setRoomNeeded(e.target.checked)} className="w-4 h-4 accent-blue-600" />
          <span className="text-sm text-gray-800">ต้องการใช้ห้องประชุม</span>
        </label>
        <label className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 cursor-pointer hover:border-blue-300">
          <input type="checkbox" checked={parkingNeeded} onChange={(e) => setParkingNeeded(e.target.checked)} className="w-4 h-4 accent-blue-600" />
          <span className="text-sm text-gray-800">ต้องการที่จอดรถสำหรับกรรมการภายนอก</span>
        </label>
        {parkingNeeded && (
          <Field label="เลขทะเบียนรถ" required>
            <input value={carPlate} onChange={(e) => setCarPlate(e.target.value)} className={INPUT} placeholder="เช่น กข 1234 กรุงเทพมหานคร" />
          </Field>
        )}
      </div>
    </Section>
  );
}

function ConfirmCheckbox({ confirmed, setConfirmed }: { confirmed: boolean; setConfirmed: (v: boolean) => void }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
      <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        กรุณาตรวจสอบก่อนส่ง
      </p>
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-amber-600 shrink-0"
        />
        <span className="text-xs text-amber-800">
          ตรวจสอบข้อมูลทั้งหมดถูกต้องและครบถ้วนแล้ว
        </span>
      </label>
    </div>
  );
}

const INPUT = "w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-2 text-gray-700 font-semibold">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value || "—"}</p>
    </div>
  );
}

// Shared committee people editor — used by both ProposalForm (starts empty) and DefenseForm
// (starts prefilled from the source proposal, still fully editable).
function CommitteePeopleEditor({ people, setPeople, clearError }: {
  people: Person[];
  setPeople: React.Dispatch<React.SetStateAction<Person[]>>;
  clearError: () => void;
}) {
  const chairCount = people.filter((p) => p.role === "PROGRAM_CHAIR").length;

  function updatePerson(index: number, patch: Partial<Person>) {
    setPeople((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
    clearError();
  }
  function addPerson() {
    setPeople((prev) => [...prev, emptyPerson()]);
  }
  function removePerson(index: number) {
    setPeople((prev) => prev.filter((_, i) => i !== index));
    clearError();
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {ROLE_REQUIREMENTS.map(({ role, label, min, max }) => {
          const n = people.filter((p) => p.role === role).length;
          const over = max !== null && n > max;
          const ok = n >= min && !over;
          return (
            <span
              key={role}
              className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${
                over ? "bg-red-50 border-red-200 text-red-600"
                : ok ? "bg-green-50 border-green-200 text-green-700"
                : "bg-gray-50 border-gray-200 text-gray-400"
              }`}
            >
              {ok ? "✓" : over ? "✗" : "○"} {label}
              {max === null ? ` (${n})` : over ? ` (${n} — เกิน)` : ""}
            </span>
          );
        })}
      </div>

      <div className="space-y-3">
        {people.map((p, i) => (
          <div key={i} className="border border-gray-200 rounded-xl p-3.5 bg-gray-50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 flex items-center gap-2 flex-wrap">
                บุคคลที่ {i + 1}
                {p.role === "PROGRAM_CHAIR" && Object.values(PROGRAM_CHAIR_BY_PROGRAM).some((c) => c.email === p.email.trim()) && (
                  <span className="font-medium bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full">
                    กรอกอัตโนมัติตามหลักสูตร
                  </span>
                )}
              </span>
              {people.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePerson(i)}
                  className="p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                  aria-label="ลบบุคคลนี้"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="ชื่อ-นามสกุล (พร้อมตำแหน่ง)" required>
                <input
                  value={p.name}
                  onChange={(e) => updatePerson(i, { name: e.target.value })}
                  className={INPUT}
                  placeholder="เช่น รศ.ดร.สมชาย ใจดี"
                />
              </Field>
              <Field label="อีเมล" required>
                <input
                  type="email"
                  value={p.email}
                  onChange={(e) => updatePerson(i, { email: e.target.value })}
                  className={INPUT}
                  placeholder="email@chula.ac.th"
                />
              </Field>
              <Field label="บทบาท" required>
                <select
                  value={p.role}
                  onChange={(e) => updatePerson(i, { role: e.target.value })}
                  className={INPUT + " bg-white"}
                >
                  <option value="">— เลือกบทบาท —</option>
                  {PERSON_ROLES.map((r) => (
                    <option
                      key={r}
                      value={r}
                      disabled={r === "PROGRAM_CHAIR" && chairCount >= 1 && p.role !== "PROGRAM_CHAIR"}
                    >
                      {ROLE_LABELS[r] ?? r}
                      {r === "PROGRAM_CHAIR" ? " (ได้ 1 คน)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="เบอร์โทรศัพท์">
                <input
                  value={p.phone}
                  onChange={(e) => updatePerson(i, { phone: e.target.value })}
                  className={INPUT}
                  placeholder="0812345678"
                />
              </Field>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addPerson}
        className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 transition"
      >
        <Plus className="w-4 h-4" />
        เพิ่มบุคคล
      </button>
    </>
  );
}
