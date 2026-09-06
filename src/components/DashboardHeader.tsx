"use client";

import { ROLE_GRADIENT, ROLE_EMOJI, ROLE_LABELS, formatTodayLong } from "@/lib/utils";

interface Props {
  role: string;
  name: string;
  /** Big heading — the page purpose, e.g. "วิทยานิพนธ์ของฉัน" */
  title: string;
  /** Optional right-side highlight, e.g. pending count */
  highlight?: { label: string; value: number | string };
  /** Optional row of secondary stats shown under the title, e.g. overview counts */
  stats?: { label: string; value: number | string }[];
}

export function DashboardHeader({ role, name, title, highlight, stats }: Props) {
  const today = formatTodayLong();

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${ROLE_GRADIENT[role]} flex items-center justify-center shrink-0 text-base`}>
              {ROLE_EMOJI[role]}
            </div>
            <p className="text-sm font-medium text-gray-500 truncate">
              {ROLE_LABELS[role]}
              {name && <span className="text-gray-400"> · {name}</span>}
            </p>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-2 leading-tight">{title}</h1>
          <p className="text-gray-400 text-xs mt-2">{today}</p>

          {stats && stats.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {stats.map((s) => (
                <div key={s.label} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
                  <span className="font-bold text-gray-900">{s.value}</span>
                  <span className="text-gray-500 text-xs ml-1.5">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {highlight && (
          <div className="shrink-0 text-center bg-blue-50 border-2 border-blue-200 rounded-2xl px-3 sm:px-5 py-2.5 sm:py-3">
            <p className="text-2xl sm:text-3xl font-bold leading-none text-blue-700">{highlight.value}</p>
            <p className="text-xs text-blue-600 mt-1">{highlight.label}</p>
          </div>
        )}
      </div>
    </div>
  );
}
