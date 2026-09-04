"use client";

import { useState } from "react";
import { Eye, Download, FileText, History, ChevronDown, ChevronUp } from "lucide-react";
import { FORM_LABELS, FORM_SHORT, formatBytes, formatDate, previewFile } from "@/lib/utils";
import type { MockUpload, FormType } from "@/types";

/** Short primary label — the form code for known types. */
function fileLabel(formType: string, fileName: string): string {
  return FORM_SHORT[formType as FormType] ?? FORM_LABELS[formType as FormType] ?? formType;
}

/** Subtitle description (e.g. "เสนอหัวข้อวิทยานิพนธ์") extracted from the full label. */
function fileDesc(formType: string): string {
  const full = FORM_LABELS[formType as FormType];
  if (!full) return "";
  const parts = full.split(" — ");
  if (parts.length > 1) return parts[1];
  // No dash separator — show the full name when the short label truncates it
  const short = FORM_SHORT[formType as FormType];
  return short && short !== full ? full : "";
}

interface Group {
  formType: FormType;
  latest: MockUpload;
  history: MockUpload[];
}

function buildGroups(uploads: MockUpload[]): Group[] {
  const groups: Group[] = [];
  const seen = new Set<string>();

  // Preserve FORM_LABELS order first — every type is one slot with version history,
  // same concept for both submission types (SIGNED = แบบรายงานฯ chain)
  for (const ft of Object.keys(FORM_LABELS) as FormType[]) {
    const byType = uploads
      .filter((u) => u.formType === ft)
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    if (!byType.length) continue;
    seen.add(ft);
    groups.push({ formType: ft, latest: byType[0], history: byType.slice(1) });
  }

  // Catch any types not in FORM_LABELS order
  for (const u of uploads) {
    if (!seen.has(u.formType) && !seen.has(u.id)) {
      const byType = uploads
        .filter((x) => x.formType === u.formType)
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      seen.add(u.formType);
      groups.push({ formType: u.formType as FormType, latest: byType[0], history: byType.slice(1) });
    }
  }

  return groups;
}

type FileGroup = { key: string; label: string; types: Set<FormType> };

// PROPOSAL: two lettered-form phases + finance
const FILE_GROUPS_PROPOSAL: FileGroup[] = [
  { key: "main",    label: "เอกสารหลัก",                 types: new Set<FormType>(["BW1A", "BW1B", "B1C", "B1D"]) },
  { key: "finance", label: "เอกสารการเงิน",              types: new Set<FormType>(["FINANCE_DOC", "FINANCE_ATTACH"]) },
  { key: "faculty", label: "เอกสารอื่นๆ",                types: new Set<FormType>(["SIGNED", "EXAM_RESULT", "INVITE_LETTER", "VERY_GOOD_EVAL"]) },
];

// THESIS_DEFENSE: phase-aware — B2+B3 / finance / from faculty / thesis
const FILE_GROUPS_THESIS: FileGroup[] = [
  { key: "b2b3",    label: "บ.2 + บ.3 (เสนอผลการสอบ)",        types: new Set<FormType>(["B2", "B3", "FINANCE_ATTACH"]) },
  { key: "finance", label: "เอกสารการเงิน",                     types: new Set<FormType>(["FINANCE_DOC"]) },
  { key: "faculty", label: "เอกสารจากคณะและผลการสอบ",          types: new Set<FormType>(["SIGNED", "EXAM_RESULT", "INVITE_LETTER", "VERY_GOOD_EVAL"]) },
  { key: "thesis",  label: "วิทยานิพนธ์ (ขั้นตอนสุดท้าย)",     types: new Set<FormType>(["B4", "THESIS"]) },
];

interface Props {
  uploads: MockUpload[];
  submissionTitle: string;
  submissionType?: string;
  title?: string;
  compact?: boolean;
  hideHistory?: boolean;
}

export function FileList({ uploads, submissionTitle, submissionType, title = "เอกสารแนบ", compact = false, hideHistory = false }: Props) {
  const [openHistory, setOpenHistory] = useState<Set<string>>(new Set());

  if (!uploads.length) return null;

  const FILE_GROUPS = submissionType === "THESIS_DEFENSE" ? FILE_GROUPS_THESIS : FILE_GROUPS_PROPOSAL;

  const groups = buildGroups(uploads);
  const sections = FILE_GROUPS.map((g) => ({
    ...g,
    items: groups.filter((x) => g.types.has(x.formType)),
  }));
  // Anything not covered by a named group falls into the last section
  const covered = new Set(FILE_GROUPS.flatMap((g) => [...g.types]));
  const leftovers = groups.filter((x) => !covered.has(x.formType));
  if (leftovers.length) sections[sections.length - 1].items.push(...leftovers);

  function toggle(key: string) {
    setOpenHistory((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function renderGroup({ formType, latest, history }: Group) {
    const key = `${formType}-${latest.id}`;
    const isOpen = openHistory.has(key);
    const label = fileLabel(formType, latest.fileName);
    const desc  = fileDesc(formType);

    return (
      <div key={key} className="rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50">
          <FileText className="w-4 h-4 text-blue-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-800 leading-snug truncate">{label}</p>
            {desc && <p className="text-xs text-gray-500 truncate">{desc}</p>}
            <p className="text-xs text-gray-400 truncate">
              {`${latest.fileName} · ${formatBytes(latest.fileSize)} · ${formatDate(latest.uploadedAt)}`}
            </p>
          </div>
          <button
            onClick={() => previewFile(latest.id, latest.fileUrl, latest.fileName)}
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
          >
            <Eye className="w-3.5 h-3.5" />
            ดูเอกสาร
          </button>
        </div>

        {!hideHistory && history.length > 0 && (
          <>
            <button
              onClick={() => toggle(key)}
              className="w-full flex items-center gap-1.5 px-4 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition border-t border-gray-100"
            >
              <History className="w-3.5 h-3.5" />
              ประวัติ ({history.length} เวอร์ชันก่อนหน้า)
              {isOpen ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
            </button>
            {isOpen && (
              <div className="divide-y divide-gray-100 bg-white border-t border-gray-100">
                {history.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                    <FileText className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-500 truncate">{u.fileName} · {formatBytes(u.fileSize)}</p>
                      <p className="text-xs text-gray-400">{formatDate(u.uploadedAt)}</p>
                    </div>
                    <button
                      onClick={() => previewFile(u.id, u.fileUrl, u.fileName)}
                      className="p-2 -m-1 shrink-0"
                      aria-label="ดูเอกสาร"
                    >
                      <Eye className="w-3.5 h-3.5 text-gray-300 hover:text-blue-500 transition" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  let renderedSections = 0;
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 ${compact ? "p-4" : "p-5"} space-y-4`}>
      <h2 className="font-semibold text-gray-800">{title} ({uploads.length} ไฟล์)</h2>

      {sections.map(({ key, label, items }) => {
        if (!items.length) return null;
        const withDivider = renderedSections > 0;
        renderedSections++;
        return (
          <div key={key} className="space-y-2">
            {withDivider && <div className="border-t border-gray-100" />}
            <p className="text-xs font-semibold text-gray-400 tracking-wide">
              {label} <span className="font-normal">({items.length})</span>
            </p>
            {items.map(renderGroup)}
          </div>
        );
      })}
    </div>
  );
}
