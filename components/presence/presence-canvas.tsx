"use client";

import { useEffect, useRef, useState } from "react";
import { createPresence, WebGLUnavailableError, type PresenceHandle } from "@/lib/vivid/scene";
import {
  ASSEMBLING,
  GREETING,
  INTENSITY,
  LANGUAGES,
  LANGUAGE_NAMES,
  STATE_LINE,
  type Language,
  type VividState,
} from "@/lib/vivid/state";
import { LanguageSelect } from "@/components/ui/language-select";

const GLYPHS = "!<>-_\\/[]{}=+*^?#";

// Scrambles toward the target and always resolves to clean text (brief §1.7).
function useScramble(target: string) {
  const [text, setText] = useState(target);
  const raf = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 420);
      setText(
        target
          .split("")
          .map((ch, i) =>
            i / target.length < p || ch === " "
              ? ch
              : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
          )
          .join(""),
      );
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);
  return text;
}

const ORDER: Array<Exclude<VividState, "assembling">> = ["idle", "listening", "thinking", "speaking"];

export function PresenceCanvas() {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<PresenceHandle>(null);
  const [assembling, setAssembling] = useState(true);
  const [pct, setPct] = useState(0);
  const [state, setState] = useState<VividState>("assembling");
  const [intensity, setIntensity] = useState(0);
  const [lang, setLang] = useState<Language>("EN");
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!host.current) return;
    try {
      const presence = createPresence(host.current, {
        onProgress: setPct,
        onState: (s, i) => {
          setState(s);
          setIntensity(i);
          if (s !== "assembling") setAssembling(false);
        },
      });
      handle.current = presence;
      return presence.dispose;
    } catch (err) {
      if (err instanceof WebGLUnavailableError) {
        // Updating the DOM from an effect, rather than cascading a re-render.
        root.current?.setAttribute("data-gpu", "off");
        return;
      }
      throw err;
    }
  }, []);

  const settled = assembling ? null : (state as Exclude<VividState, "assembling">);
  const status = useScramble(
    assembling ? `${ASSEMBLING[lang]}... ${pct}%` : STATE_LINE[lang][settled ?? "idle"],
  );
  const loudness = intensity > 0.55 ? "high" : intensity > 0.3 ? "med" : "low";

  const pick = (next: (typeof ORDER)[number]) => {
    if (assembling) return;
    handle.current?.setState(next);
  };




  return (
    <main ref={root} className="group fixed inset-0 bg-black font-mono select-none data-[gpu=off]:grid data-[gpu=off]:place-items-center">
      <div className="pointer-events-none absolute inset-0 hidden place-items-center px-8 text-center group-data-[gpu=off]:grid">
        <div className="max-w-[46ch] space-y-4">
          <p className="text-[13px] tracking-[0.3em] text-[#7DF3FF]">VIVID NEEDS A GPU</p>
          <p className="text-[11px] leading-relaxed tracking-[0.16em] text-[#7DF3FF]/55">
            Graphics acceleration is switched off in this browser, so her form cannot be drawn.
            Enable it in settings, relaunch, and she will assemble.
          </p>
        </div>
      </div>

      <div ref={host} className="absolute inset-0 group-data-[gpu=off]:hidden" />

      {/* her name, and what she is */}
      <div
        className="absolute left-5 top-5 sm:left-8 sm:top-7 group-data-[gpu=off]:hidden transition-opacity duration-1000"
        style={{ opacity: assembling ? 0.25 : 1 }}
      >
        <p className="text-[13px] sm:text-[15px] tracking-[0.5em] sm:tracking-[0.62em] text-[#7DF3FF]" style={{ textShadow: "0 0 18px rgba(0,200,255,0.4)" }}>
          VIVID
        </p>
        <p className="mt-2 max-w-[19ch] sm:max-w-none text-[8px] sm:text-[9px] leading-relaxed tracking-[0.18em] sm:tracking-[0.24em] text-[#7DF3FF]/40">
          SHE SPEAKS {LANGUAGES.map((l) => LANGUAGE_NAMES[l].toUpperCase()).join(" · ")}
        </p>
      </div>

      {/* she greets in whichever language is active */}
      <p
        className="pointer-events-none absolute left-1/2 top-[calc(50%+30vmin)] sm:top-[calc(50%+26vmin)] -translate-x-1/2 text-center text-[14px] tracking-[0.3em] whitespace-nowrap text-[#7DF3FF]/80 group-data-[gpu=off]:hidden transition-opacity duration-1000"
        style={{ opacity: !assembling && state === "idle" ? 1 : 0, textShadow: "0 0 16px rgba(0,200,255,0.35)" }}
      >
        {GREETING[lang]}
      </p>

      {/* the crosshair marking the event horizon */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[13px] leading-none text-[#7DF3FF]/45 group-data-[gpu=off]:hidden"
        style={{ opacity: assembling ? 0 : 1, transition: "opacity 1.2s" }}
      >
        +
      </div>

      {/* the emitter star, visible only during assembly */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[82%] group-data-[gpu=off]:hidden h-60 w-60 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-700"
        style={{
          opacity: assembling ? 1 : 0,
          background:
            "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(200,240,255,0.5) 4%, rgba(0,168,232,0.28) 14%, rgba(0,0,0,0) 60%)",
        }}
      />


      <div
        className="absolute right-5 top-5 sm:right-8 sm:top-1/2 sm:-translate-y-1/2 group-data-[gpu=off]:hidden text-right text-[9px] sm:text-[10px] tracking-[0.24em] sm:tracking-[0.3em] text-[#7DF3FF]"
        style={{ textShadow: "0 0 12px rgba(0,200,255,0.45)" }}
      >
        {status}
        {!assembling && state === "speaking" ? (
          <span className="text-[#FFB03A]">{`  ${INTENSITY[lang][loudness]}`}</span>
        ) : null}
      </div>

      {/* Temporary: drives the state machine by hand until the voice service
          is wired. Delete this block when Vivid drives her own state. */}
      <div className="absolute inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] sm:bottom-7 flex flex-wrap items-center justify-center gap-1.5 px-4 sm:gap-2 group-data-[gpu=off]:hidden">
        {ORDER.map((s) => {
          const active = !assembling && state === s;
          return (
            <button
              key={s}
              onClick={() => pick(s)}
              disabled={assembling}
              className={`rounded-full border px-3 py-1.5 text-[9px] tracking-[0.2em] transition-colors disabled:opacity-30 sm:px-4 sm:py-2 sm:text-[10px] sm:tracking-[0.28em] ${
                active
                  ? "border-[#FFB03A] bg-[#FFB03A]/10 text-[#FFB03A]"
                  : "border-[#7DF3FF]/30 text-[#7DF3FF]/70 hover:border-[#7DF3FF] hover:text-[#7DF3FF]"
              }`}
            >
              {s.toUpperCase()}
            </button>
          );
        })}

        <LanguageSelect
          value={lang}
          onChange={setLang}
          className="sm:absolute sm:bottom-0 sm:right-8"
        />
      </div>
    </main>
  );
}
