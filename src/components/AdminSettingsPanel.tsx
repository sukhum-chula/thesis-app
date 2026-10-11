"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { PROGRAM_LABELS, formatUserName, ROLE_LABELS } from "@/lib/utils";
import {
  RULED_ROLES, MEMBER_TYPES, DEGREE_LEVELS, COUNT_RULES, COUNT_RULE_LABELS, DEGREE_LABELS, MEMBER_TYPE_LABELS,
  FIXED_COUNT_ROLES, DEFAULT_COMMITTEE_RULES,
  type CommitteeRules, type CountRule, type DegreeLevel, type MemberType, type RuledRole,
} from "@/lib/committeeRules";
import { ProgramType } from "@/types";
import { Landmark, Mail, Loader2, Building2 } from "lucide-react";

const PROGRAMS: ProgramType[] = ["PHD", "ME_MECH", "ME_CPS"];

// System-wide settings — department chair (one PROFESSOR, department-wide), program chair
// assignment (3 slots, one PROFESSOR each) and the
// finance-notification contact (one ADMIN account, whose email replaces the old hardcoded
// FINANCE_EMAIL env var). Rendered as its own "ตั้งค่าระบบ" tab on /admin-dashboard and also
// standalone below AdminUsersPanel at /dashboard/admin/users. Callers are responsible for
// their own ADMIN-role guard before rendering this.
export function AdminSettingsPanel() {
  const { users: allUsers, adminSetProgramChair, adminSetFinanceContact, adminSetDepartmentChair } = useApp();
  const { showToast } = useToast();
  const [savingProgram, setSavingProgram] = useState<ProgramType | null>(null);
  const [savingFinanceContact, setSavingFinanceContact] = useState(false);
  const [savingDepartmentChair, setSavingDepartmentChair] = useState(false);

  const professors = allUsers.filter((u) => u.roles.includes("PROFESSOR"));
  const adminAccounts = allUsers.filter((u) => u.roles.includes("ADMIN"));
  const financeContact = allUsers.find((u) => u.isFinanceContact);
  const departmentChair = allUsers.find((u) => u.isDepartmentChair);

  async function handleSetDepartmentChair(userId: string) {
    setSavingDepartmentChair(true);
    try {
      await adminSetDepartmentChair(userId || null);
      showToast("บันทึกหัวหน้าภาควิชาสำเร็จ", "success");
    } catch (err: any) {
      showToast(err.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่", "error");
    } finally {
      setSavingDepartmentChair(false);
    }
  }

  async function handleSetProgramChair(program: ProgramType, userId: string) {
    setSavingProgram(program);
    try {
      await adminSetProgramChair(program, userId || null);
      showToast("บันทึกประธานหลักสูตรสำเร็จ", "success");
    } catch (err: any) {
      showToast(err.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่", "error");
    } finally {
      setSavingProgram(null);
    }
  }

  async function handleSetFinanceContact(userId: string) {
    setSavingFinanceContact(true);
    try {
      await adminSetFinanceContact(userId || null);
      showToast("บันทึกผู้รับผิดชอบด้านการเงินสำเร็จ", "success");
    } catch (err: any) {
      showToast(err.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่", "error");
    } finally {
      setSavingFinanceContact(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-6">
      <div className="flex items-center gap-2">
        <Landmark className="w-5 h-5 text-indigo-500" />
        <h2 className="font-semibold text-gray-800">ตั้งค่าระบบ</h2>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-gray-700">หัวหน้าภาควิชา</p>
          <p className="text-sm text-gray-400">
            กำหนดอาจารย์ผู้เป็นหัวหน้าภาควิชา — มีได้เพียงท่านเดียวสำหรับทั้งภาควิชา
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
          <div className="flex-1 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
            <select
              value={departmentChair?.id ?? ""}
              onChange={(e) => handleSetDepartmentChair(e.target.value)}
              disabled={savingDepartmentChair}
              aria-label="หัวหน้าภาควิชา"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
            >
              <option value="">— ไม่มี —</option>
              {professors.map((p) => (
                <option key={p.id} value={p.id} translate="no">{formatUserName(p)}</option>
              ))}
            </select>
          </div>
          {savingDepartmentChair && <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />}
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t border-gray-100">
        <div>
          <p className="text-sm font-medium text-gray-700">ประธานหลักสูตร</p>
          <p className="text-sm text-gray-400">
            กำหนดอาจารย์ผู้เป็นประธานหลักสูตรของแต่ละหลักสูตร — ใช้เป็นผู้รับผิดชอบสำรองเมื่อคำร้องไม่ได้ระบุประธานหลักสูตรไว้โดยตรง
            แต่ละหลักสูตรมีประธานได้เพียงคนเดียว แต่อาจารย์ท่านเดียวสามารถเป็นประธานได้มากกว่าหนึ่งหลักสูตร
          </p>
        </div>
        {PROGRAMS.map((program) => {
          const current = professors.find((u) => u.programChairFor?.includes(program));
          return (
            <div key={program} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
              <p className="text-sm font-medium text-gray-700 sm:w-64 shrink-0">{PROGRAM_LABELS[program]}</p>
              <select
                value={current?.id ?? ""}
                onChange={(e) => handleSetProgramChair(program, e.target.value)}
                disabled={savingProgram === program}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
              >
                <option value="">— ไม่มี —</option>
                {professors.map((p) => {
                  const otherPrograms = (p.programChairFor ?? []).filter((pr) => pr !== program);
                  const alsoChairs = otherPrograms.length ? ` (เป็นประธานหลักสูตร ${otherPrograms.join(", ")} ด้วย)` : "";
                  return (
                    <option key={p.id} value={p.id}>{formatUserName(p)}{alsoChairs}</option>
                  );
                })}
              </select>
              {savingProgram === program && <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />}
            </div>
          );
        })}
      </div>

      <div className="space-y-3 pt-2 border-t border-gray-100">
        <div>
          <p className="text-sm font-medium text-gray-700">ผู้รับผิดชอบด้านการเงิน</p>
          <p className="text-sm text-gray-400">
            เลือกเจ้าหน้าที่ (ADMIN) ที่จะใช้อีเมลของบัญชีนั้นรับสำเนาเอกสารและแจ้งเตือนเรื่องการเงินโดยอัตโนมัติ
            (แทนที่ค่าคงที่ FINANCE_EMAIL เดิม)
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
          <div className="flex-1 flex items-center gap-2">
            <Mail className="w-4 h-4 text-gray-400 shrink-0" />
            <select
              value={financeContact?.id ?? ""}
              onChange={(e) => handleSetFinanceContact(e.target.value)}
              disabled={savingFinanceContact}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
            >
              <option value="">— ไม่มี —</option>
              {adminAccounts.map((a) => (
                <option key={a.id} value={a.id} translate="no">{formatUserName(a)} ({a.email})</option>
              ))}
            </select>
          </div>
          {savingFinanceContact && <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />}
        </div>
      </div>

      <CommitteeRulesTable />
    </div>
  );
}

// The committee composition table (src/lib/committeeRules.ts): per role, how many people and which
// kinds of account, per degree level. Edits stay local until บันทึก; a save applies to committees
// saved from then on (existing submissions are not re-checked).
function CommitteeRulesTable() {
  const { committeeRules, adminSetCommitteeRules } = useApp();
  const { showToast } = useToast();
  // null = not edited, follow the saved rules (they replace the defaults once the first fetch lands)
  const [draft, setDraft] = useState<CommitteeRules | null>(null);
  const [saving, setSaving] = useState(false);
  const rules = draft ?? committeeRules;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(committeeRules);
  const isDefault = JSON.stringify(rules) === JSON.stringify(DEFAULT_COMMITTEE_RULES);

  function setDegree(role: RuledRole, degree: DegreeLevel, patch: Partial<CommitteeRules[RuledRole][DegreeLevel]>) {
    setDraft({ ...rules, [role]: { ...rules[role], [degree]: { ...rules[role][degree], ...patch } } });
  }
  function toggle(role: RuledRole, degree: DegreeLevel, type: MemberType) {
    const current = rules[role][degree].types;
    const types = current.includes(type) ? current.filter((t) => t !== type) : MEMBER_TYPES.filter((t) => t === type || current.includes(t));
    setDegree(role, degree, { types });
  }

  async function save() {
    setSaving(true);
    try {
      await adminSetCommitteeRules(rules);
      setDraft(null);
      showToast("บันทึกเงื่อนไขคณะกรรมการสำเร็จ", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "เกิดข้อผิดพลาด กรุณาลองใหม่", "error");
    } finally {
      setSaving(false);
    }
  }

  const cell = "px-2 py-2 text-center border-b border-gray-100";
  return (
    <div className="space-y-3 pt-2 border-t border-gray-100">
      <div>
        <p className="text-sm font-medium text-gray-700">เงื่อนไขคณะกรรมการ</p>
        <p className="text-sm text-gray-400">
          จำนวนบุคคลในแต่ละตำแหน่ง และประเภทบัญชีที่เลือกได้ แยกตามระดับปริญญา — ME = อาจารย์ภาควิชาวิศวกรรมเครื่องกล,
          CU = อาจารย์จุฬาฯ จากภาควิชาอื่น, EX = กรรมการภายนอก มีผลกับคณะกรรมการที่บันทึกหลังจากนี้ (คำร้องเดิมไม่ถูกตรวจซ้ำ)
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th rowSpan={2} className="px-3 py-2 text-left font-medium border-b border-gray-100">ตำแหน่ง</th>
              {DEGREE_LEVELS.map((d) => (
                <th key={d} colSpan={MEMBER_TYPES.length + 1} className="px-2 pt-2 font-medium border-l border-gray-100">{DEGREE_LABELS[d]}</th>
              ))}
            </tr>
            <tr>
              {DEGREE_LEVELS.map((d) => [
                <th key={d + "count"} className="px-2 pb-2 font-medium text-xs border-b border-l border-gray-100">จำนวน</th>,
                ...MEMBER_TYPES.map((t) => (
                  <th key={d + t} title={MEMBER_TYPE_LABELS[t]} className="px-2 pb-2 font-semibold text-xs border-b border-gray-100">{t}</th>
                )),
              ])}
            </tr>
          </thead>
          <tbody>
            {RULED_ROLES.map((role) => {
              const fixed = FIXED_COUNT_ROLES.includes(role);
              return (
                <tr key={role}>
                  <td className="px-3 py-2 text-gray-800 border-b border-gray-100 whitespace-nowrap">{ROLE_LABELS[role]}</td>
                  {DEGREE_LEVELS.map((d) => [
                    <td key={d + "count"} className={cell + " border-l"}>
                      <select
                        value={rules[role][d].count}
                        onChange={(e) => setDegree(role, d, { count: e.target.value as CountRule })}
                        disabled={fixed || saving}
                        title={fixed ? "ตำแหน่งนี้มีได้ 1 คนเสมอ" : undefined}
                        aria-label={`จำนวน${ROLE_LABELS[role]} ${DEGREE_LABELS[d]}`}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400"
                      >
                        {COUNT_RULES.map((c) => <option key={c} value={c}>{COUNT_RULE_LABELS[c]}</option>)}
                      </select>
                    </td>,
                    ...MEMBER_TYPES.map((t) => (
                      <td key={d + t} className={cell}>
                        <input
                          type="checkbox"
                          checked={rules[role][d].types.includes(t)}
                          onChange={() => toggle(role, d, t)}
                          disabled={saving}
                          aria-label={`${ROLE_LABELS[role]} ${DEGREE_LABELS[d]} ${MEMBER_TYPE_LABELS[t]}`}
                          className="w-4 h-4 accent-indigo-600"
                        />
                      </td>
                    )),
                  ])}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">อาจารย์ที่ปรึกษาและประธานกรรมการสอบมีได้ 1 คนเสมอ · ตำแหน่งที่ตั้งเป็น ≥0 และไม่มีผู้ใดจะข้ามขั้นตอนลงนามของตำแหน่งนั้นไป</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          บันทึก
        </button>
        {dirty && (
          <button onClick={() => setDraft(null)} disabled={saving} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
            ยกเลิกการแก้ไข
          </button>
        )}
        {!isDefault && (
          <button onClick={() => setDraft(DEFAULT_COMMITTEE_RULES)} disabled={saving} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
            คืนค่าเริ่มต้น
          </button>
        )}
      </div>
    </div>
  );
}
