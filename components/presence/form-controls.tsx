"use client";

import { useEffect, useState, type RefObject } from "react";
import { CONSTELLATION } from "@/lib/vivid/morph-targets";
import { HUMAN, SHOWCASE } from "@/lib/vivid/sequencer";
import type { PresenceHandle } from "@/lib/vivid/scene";

// Every form there is, in the order the rotation would show them, plus the
// male bust which the rotation never shows.
const FORMS = [CONSTELLATION, HUMAN, "human-male", ...SHOWCASE.flat()];

// Development only. The rotation waits fourteen seconds and then shows one form
// every fifteen; tuning a car by waiting for it to come round is not a workflow.
// This jumps straight to any form and holds it, and pins a state so the face
// and throat can be seen lit without a microphone.
//
// `F` toggles the panel; the number keys pick a form. Nothing here exists in a
// production build: the component returns null and the hook does not run.
export function FormControls({ handle }: { handle: RefObject<PresenceHandle | null> }) {
  const [open, setOpen] = useState(false);
  const [held, setHeld] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === "f" || e.key === "F") setOpen((v) => !v);
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 0 && n < FORMS.length) void show(FORMS[n]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // show is stable for the lifetime of the component; handle is a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (process.env.NODE_ENV === "production") return null;

  async function show(name: string) {
    const presence = handle.current;
    if (!presence) return;
    setLoading(name);
    const ok = await presence.loadForm(name);
    setLoading(null);
    if (!ok) return;
    presence.holdForm(name);
    presence.setMorphTarget(name, 1.6);
    setHeld(name);
  }

  function release() {
    handle.current?.holdForm(null);
    handle.current?.setMorphTarget(CONSTELLATION, 1.6);
    setHeld(null);
  }

  function pin(state: "idle" | "listening" | "thinking" | "speaking") {
    handle.current?.setState(state);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute bottom-5 left-5 z-30 rounded border border-white/15 px-2 py-1 font-mono text-[9px] tracking-[0.2em] text-white/40 hover:text-white/80"
      >
        F · FORMS
      </button>
    );
  }

  return (
    <div className="absolute bottom-5 left-5 z-30 w-56 rounded border border-white/15 bg-black/80 p-3 font-mono text-[10px] tracking-[0.12em] text-white/70 backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-white/40">FORMS · dev</span>
        <button type="button" onClick={() => setOpen(false)} className="text-white/40 hover:text-white">
          ×
        </button>
      </div>
      <ul className="space-y-1">
        {FORMS.map((name, i) => (
          <li key={name}>
            <button
              type="button"
              onClick={() => void show(name)}
              className={`flex w-full items-center justify-between rounded px-1.5 py-0.5 text-left hover:bg-white/10 ${
                held === name ? "text-[#7DF3FF]" : ""
              }`}
            >
              <span>
                <span className="mr-2 text-white/30">{i}</span>
                {name}
              </span>
              {loading === name ? <span className="text-white/40">…</span> : null}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-white/10 pt-2">
        <div className="mb-1 text-white/40">HOLD STATE</div>
        <div className="flex flex-wrap gap-1">
          {(["idle", "listening", "thinking", "speaking"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => pin(s)}
              className="rounded border border-white/15 px-1.5 py-0.5 hover:border-white/50"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={release}
        className="mt-3 w-full rounded border border-white/15 py-1 hover:border-white/50"
      >
        release to constellation
      </button>
      <p className="mt-2 text-[9px] leading-relaxed text-white/30">
        A held form stays until released. Speaking to her still takes over, as it should.
      </p>
    </div>
  );
}
