"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { PROGRAM_LABELS, formatUserName } from "@/lib/utils";
import { ProgramType } from "@/types";
import { Landmark, Mail, Loader2 } from "lucide-react";

const PROGRAMS: ProgramType[] = ["PHD", "ME_MECH", "ME_CPS"];

// System-wide settings — program chair assignment (3 slots, one PROFESSOR each) and the
// finance-notification contact (one ADMIN account, whose email replaces the old hardcoded
// FINANCE_EMAIL env var). Rendered as its own "ตั้งค่าระบบ" tab on /admin-dashboard and also
// standalone below AdminUsersPanel at /dashboard/admin/users. Callers are responsible for
// their own ADMIN-role guard before rendering this.
export function AdminSettingsPanel() {
  const { users: allUsers, adminSetProgramChair, adminSetFinanceContact } = useApp();
  const { showToast } = useToast();
  const [savingProgram, setSavingProgram] = useState<ProgramType | null>(null);
  const [savingFinanceContact, setSavingFinanceContact] = useState(false);

  const professors = allUsers.filter((u) => u.roles.includes("PROFESSOR"));
  const adminAccounts = allUsers.filter((u) => u.roles.includes("ADMIN"));
  const financeContact = allUsers.find((u) => u.isFinanceContact);

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
                <option key={a.id} value={a.id}>{formatUserName(a)} ({a.email})</option>
              ))}
            </select>
          </div>
          {savingFinanceContact && <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />}
        </div>
      </div>
    </div>
  );
}
