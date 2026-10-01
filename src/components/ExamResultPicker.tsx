"use client";

import { DEFENSE_EXAM_RESULTS, VERY_GOOD_RESULT } from "@/lib/utils";
import { SectionLabel } from "@/components/FileUploader";

type Result = (typeof DEFENSE_EXAM_RESULTS)[number];

// Whole static class strings per option (Tailwind can't see interpolated names)
const OPTION_CLASSES: Record<Result, { on: string; off: string }> = {
  "ดีมาก":   { on: "border-purple-500 bg-purple-50 text-purple-800", off: "border-gray-200 text-gray-600 hover:border-purple-300" },
  "ดี":      { on: "border-blue-500 bg-blue-50 text-blue-800",       off: "border-gray-200 text-gray-600 hover:border-blue-300" },
  "ผ่าน":    { on: "border-green-500 bg-green-50 text-green-800",    off: "border-gray-200 text-gray-600 hover:border-green-300" },
  "ไม่ผ่าน": { on: "border-red-500 bg-red-50 text-red-800",          off: "border-gray-200 text-gray-600 hover:border-red-300" },
};

/** Exam-result picker — a numbered section of an action card. THESIS_DEFENSE: the student picks it
 *  at THESIS_STEP.STUDENT_REPORT (and again when resubmitting after the advisor rejected the
 *  result); ดีมาก also needs แบบประเมินวิทยานิพนธ์ดีมาก. PROPOSAL step 5.1: the head of committee
 *  picks ผ่าน/ไม่ผ่าน (`options`). */
export function ExamResultPicker({
  n,
  value,
  onChange,
  options = DEFENSE_EXAM_RESULTS,
  hint = "เลือกผลการสอบตามใบรายงานผลการสอบ — อาจารย์ที่ปรึกษาจะตรวจสอบอีกครั้ง",
}: {
  n: number;
  value: string;
  onChange: (v: string) => void;
  options?: readonly Result[];
  hint?: string;
}) {
  return (
    <div>
      <SectionLabel n={n} required>เลือกผลการสอบวิทยานิพนธ์</SectionLabel>
      <p className="text-sm text-gray-500 pl-6 mb-2">{hint}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            className={`py-3 rounded-xl border-2 font-semibold text-base transition ${value === r ? OPTION_CLASSES[r].on : OPTION_CLASSES[r].off}`}
          >
            {r}
          </button>
        ))}
      </div>
      {value === VERY_GOOD_RESULT && (
        <div className="mt-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-purple-700">ผล ดีมาก — ต้องอัปโหลดเพิ่มเติม</p>
          <p className="text-xs text-purple-600 mt-0.5">กรุณากรอกแบบประเมินวิทยานิพนธ์ดีมาก แล้วอัปโหลดด้วย (ในช่องอัปโหลดด้านล่าง)</p>
        </div>
      )}
    </div>
  );
}
