"use client";

import { useEffect, useState } from "react";
import { TH_EN } from "@/lib/translations";

const THAI_CHARS = /[฀-๿]/;

function translateString(s: string): string {
  if (!THAI_CHARS.test(s)) return s;
  let out = s;
  for (const [th, en] of TH_EN) {
    if (out.includes(th)) out = out.split(th).join(en);
  }
  return out;
}

function translateNode(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
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
    root.querySelectorAll?.("[placeholder], [title]").forEach((el) => {
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
      if (m.type === "characterData" && m.target.nodeValue) {
        const t = translateString(m.target.nodeValue);
        if (t !== m.target.nodeValue) m.target.nodeValue = t;
      } else {
        m.addedNodes.forEach((n) => translateNode(n));
      }
    }
  });
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
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
