"use client";

import { useEffect, useState } from "react";
import { TH_EN } from "@/lib/translations";

const THAI_CHARS = /[฀-๿]/;

// Longest phrase first, so a full sentence is replaced before any word inside it.
const PAIRS = [...TH_EN].sort((a, b) => b[0].length - a[0].length);
// Keys this short also occur inside unrelated Thai text (ท่าน in เท่านั้น, ดี in เดียว or in a name
// like ตั้งใจดี), so they only match as a standalone token — no Thai character touching either end.
const SHORT_KEY = 8;

function replaceStandalone(s: string, th: string, en: string): string {
  let out = "";
  let from = 0;
  for (let i = s.indexOf(th); i !== -1; i = s.indexOf(th, i + th.length)) {
    const end = i + th.length;
    if ((i > 0 && THAI_CHARS.test(s[i - 1])) || (end < s.length && THAI_CHARS.test(s[end]))) continue;
    out += s.slice(from, i) + en;
    from = end;
  }
  return out + s.slice(from);
}

const cache = new Map<string, string>();

export function translateString(s: string): string {
  if (!THAI_CHARS.test(s)) return s;
  const hit = cache.get(s);
  if (hit !== undefined) return hit;
  let out = s;
  for (const [th, en] of PAIRS) {
    if (!out.includes(th)) continue;
    out = th.length < SHORT_KEY ? replaceStandalone(out, th, en) : out.split(th).join(en);
    if (!THAI_CHARS.test(out)) break;
  }
  cache.set(s, out);
  return out;
}

// User data (names, thesis titles, affiliations…) is wrapped in translate="no" so it is never
// rewritten — a name like ตั้งใจดี must not become ตั้งใจGood.
function isExcluded(node: Node): boolean {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return !!el?.closest('[translate="no"]');
}

function translateNode(root: Node) {
  if (isExcluded(root)) return;
  if (root.nodeType === Node.TEXT_NODE) {
    const text = root.nodeValue;
    if (text && THAI_CHARS.test(text)) {
      const translated = translateString(text);
      if (translated !== text) root.nodeValue = translated;
    }
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (isExcluded(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue;
    if (text && THAI_CHARS.test(text)) {
      const translated = translateString(text);
      if (translated !== text) node.nodeValue = translated;
    }
  }
  // Placeholders / titles on inputs and buttons
  if (root instanceof Element || root instanceof Document) {
    const els = [...(root instanceof Element ? [root] : []), ...root.querySelectorAll("[placeholder], [title]")];
    els.forEach((el) => {
      if (isExcluded(el)) return;
      const ph = el.getAttribute("placeholder");
      if (ph && THAI_CHARS.test(ph)) el.setAttribute("placeholder", translateString(ph));
      const ti = el.getAttribute("title");
      if (ti && THAI_CHARS.test(ti)) el.setAttribute("title", translateString(ti));
    });
  }
}

let observer: MutationObserver | null = null;

function startTranslating() {
  translateNode(document.body);
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") m.addedNodes.forEach((n) => translateNode(n));
      else translateNode(m.target); // characterData, or a placeholder/title React re-rendered
    }
  });
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["placeholder", "title"],
  });
}

export function LanguageToggle() {
  const [lang, setLang] = useState<"th" | "en">("th");

  useEffect(() => {
    const saved = localStorage.getItem("ui-lang");
    if (saved === "en") {
      setLang("en");
      startTranslating();
    }
  }, []);

  function toggle() {
    if (lang === "th") {
      localStorage.setItem("ui-lang", "en");
      setLang("en");
      startTranslating();
    } else {
      localStorage.setItem("ui-lang", "th");
      // Reload restores the original Thai text (React state keeps working data intact)
      window.location.reload();
    }
  }

  return (
    <button
      onClick={toggle}
      title={lang === "th" ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย"}
      aria-label="Toggle language"
      className="shrink-0 px-2 py-1 rounded-lg border border-gray-200 text-xs font-bold text-gray-500 hover:text-blue-600 hover:border-blue-300 transition"
    >
      {lang === "th" ? "TH" : "EN"}
    </button>
  );
}
