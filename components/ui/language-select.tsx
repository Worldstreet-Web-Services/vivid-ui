"use client";

import { useEffect, useRef, useState } from "react";
import { LANGUAGES, LANGUAGE_NAMES, type Language } from "@/lib/vivid/state";

export function LanguageSelect({
  value,
  onChange,
  className = "",
}: {
  value: Language;
  onChange: (next: Language) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div ref={root} className={`relative ${className}`}>
      {/* The list opens upward: this control lives at the bottom of the frame. */}
      {open ? (
        <ul
          role="listbox"
          className="absolute bottom-[calc(100%+8px)] right-0 min-w-[10.5rem] overflow-hidden rounded-lg border border-[#7DF3FF]/30 bg-black/85 backdrop-blur-sm"
        >
          {LANGUAGES.map((l) => (
            <li key={l}>
              <button
                role="option"
                aria-selected={l === value}
                onClick={() => {
                  onChange(l);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-6 px-3.5 py-2.5 text-left text-[10px] tracking-[0.22em] transition-colors ${
                  l === value
                    ? "bg-[#FFB03A]/10 text-[#FFB03A]"
                    : "text-[#7DF3FF]/65 hover:bg-[#7DF3FF]/8 hover:text-[#7DF3FF]"
                }`}
              >
                <span>{LANGUAGE_NAMES[l].toUpperCase()}</span>
                <span className="opacity-60">{l}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-[#7DF3FF]/35 px-3 py-1.5 text-[9px] tracking-[0.2em] text-[#7DF3FF] transition-colors hover:border-[#7DF3FF] sm:rounded-lg sm:px-4 sm:py-2 sm:text-[11px] sm:tracking-[0.3em]"
      >
        {value}
        <span
          className="text-[7px] transition-transform sm:text-[8px]"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        >
          ▲
        </span>
      </button>
    </div>
  );
}
