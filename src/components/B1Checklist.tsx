"use client";

import { AlertCircle } from "lucide-react";
import { B1_CHECK_GROUPS, type B1Check } from "@/lib/utils";

/** The บ.วศ.1 pre-submit checklist — shared by the student (PROPOSAL step 1) and the ADMIN
 *  (step 2, with the extra committee check). Groups with no items are not rendered. */
export function B1Checklist({
  title,
  checks,
  value,
  onChange,
}: {
  title: string;
  checks: B1Check[];
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
}) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-3">
      <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        {title}
      </p>
      {B1_CHECK_GROUPS.map((group) => {
        const items = checks.filter((c) => c.group === group.key);
        if (items.length === 0) return null;
        return (
          <div key={group.key} className="space-y-2">
            <p className="text-xs font-semibold text-amber-900">{group.title}</p>
            {items.map((c) => (
              <label key={c.key} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!value[c.key]}
                  onChange={(e) => onChange({ ...value, [c.key]: e.target.checked })}
                  className="mt-0.5 w-4 h-4 accent-amber-600 shrink-0"
                />
                <span className="text-xs text-amber-800">{c.label}</span>
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function allChecked(checks: B1Check[], value: Record<string, boolean>): boolean {
  return checks.every((c) => value[c.key]);
}
