"use client";

import { useEffect, useRef, useState } from "react";
import { HudFrame } from "@/components/hud/hud-frame";
import { LANGUAGES, LANGUAGE_NAMES, type Language } from "@/lib/vivid/state";

const ENABLED_LANGUAGES: Language[] = ["EN", "YO", "IG", "PCM"];

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
      {/* The list opens upward, in a frame that traces itself in: this
          control lives at the bottom of the instrument. Each row reveals a
          beat after the one above, in steps, so the list arrives rather than
          appears. */}
      {open ? (
        <div className="absolute right-0 bottom-[calc(100%+8px)] min-w-[11.5rem]">
          <HudFrame padding="p-0" corner={8}>
            <ul role="listbox" className="bg-black/85 backdrop-blur-sm">
              {LANGUAGES.map((l, i) => {
                const enabled = ENABLED_LANGUAGES.includes(l);
                return (
                  <li
                    key={l}
                    className="hud-motion"
                    style={{ animation: `hud-body-in 0.25s steps(3) ${420 + i * 60}ms both` }}
                  >
                    <button
                      role="option"
                      aria-selected={l === value}
                      aria-disabled={!enabled}
                      onClick={() => {
                        if (!enabled) return;
                        onChange(l);
                        setOpen(false);
                      }}
                      className={`font-hud flex w-full items-center justify-between gap-6 px-3.5 py-2 text-left text-[10px] tracking-[0.22em] transition-colors ${
                        !enabled ? "cursor-not-allowed text-silver-bright/28" : ""
                      } ${
                        l === value
                          ? "text-gold"
                          : enabled
                            ? "text-silver-bright/65 hover:bg-silver-bright/8 hover:text-silver-bright"
                            : ""
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {/* The selected row carries the gold tick every HUD list has. */}
                        <span
                          aria-hidden
                          className="block h-[1px] w-2"
                          style={{
                            background: l === value ? "var(--color-gold)" : "transparent",
                          }}
                        />
                        {LANGUAGE_NAMES[l].toUpperCase()}
                      </span>
                      <span className="opacity-60">{l}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </HudFrame>
        </div>
      ) : null}

      {/* The trigger: a bracketed tab, not a pill. */}
      <button
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="hud-motion font-hud relative flex items-center gap-2 px-3 py-1.5 text-[9px] tracking-[0.2em] text-silver-bright transition-colors hover:text-warm-white sm:px-4 sm:py-2 sm:text-[11px] sm:tracking-[0.3em]"
        style={{ animation: "hud-panel-in 0.55s 260ms both" }}
      >
        {/* Two corner brackets, the tab's whole frame. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 h-2 w-2 border-t border-l border-silver-bright/60"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 bottom-0 h-2 w-2 border-r border-b border-silver-bright/60"
        />
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
