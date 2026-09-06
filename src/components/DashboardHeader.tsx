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
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${ROLE_GRADIENT[role]} p-5 sm:p-7 text-white shadow-lg`}>
      {/* Decorative circles */}
      <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full" />
      <div className="absolute -bottom-12 -right-2 w-32 h-32 bg-white/5 rounded-full" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-white/85 text-sm font-medium">
            <span className="text-lg">{ROLE_EMOJI[role]}</span>
            {ROLE_LABELS[role]}
            {name && <span className="text-white/60">· {name}</span>}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mt-1.5 leading-tight">{title}</h1>
          <p className="text-white/60 text-xs mt-2">{today}</p>

          {stats && stats.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {stats.map((s) => (
                <div key={s.label} className="bg-white/15 backdrop-blur-sm rounded-xl px-3 py-1.5 border border-white/20">
                  <span className="font-bold">{s.value}</span>
                  <span className="text-white/70 text-xs ml-1.5">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {highlight && (
          <div className="shrink-0 text-center bg-white/15 backdrop-blur-sm rounded-2xl px-3 sm:px-5 py-2.5 sm:py-3 border border-white/20">
            <p className="text-2xl sm:text-3xl font-bold leading-none">{highlight.value}</p>
            <p className="text-xs text-white/80 mt-1">{highlight.label}</p>
          </div>
        )}
      </div>
    </div>
  );
}
