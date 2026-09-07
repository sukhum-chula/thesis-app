"use client";

import { generatePassword } from "@/lib/utils";
import { Shuffle } from "lucide-react";

/**
 * Shared passcode input for account creation / passcode reset — the admin can type a passcode
 * by hand or click "สุ่มรหัส" to fill it with a generated one, then still edit it before
 * submitting. See "Account creation & passcodes" in AGENTS.md.
 */
export function PasscodeField({
  value,
  onChange,
  label = "รหัสเข้าใช้งาน",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1.5 block">{label} *</label>
      <div className="flex gap-2">
        <input
          type="text"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="เช่น A00a00"
          className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 font-mono tracking-wide focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition placeholder:text-gray-300"
        />
        <button
          type="button"
          onClick={() => onChange(generatePassword())}
          title="สุ่มรหัสใหม่"
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition shrink-0"
        >
          <Shuffle className="w-4 h-4" />
          สุ่มรหัส
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1">พิมพ์รหัสเอง หรือกดสุ่มรหัสแล้วแก้ไขได้ตามต้องการ (อย่างน้อย 6 ตัวอักษร ไม่มีช่องว่าง)</p>
    </div>
  );
}
