"use client";

import { useEffect, useRef, type RefObject } from "react";
import { HudFrame } from "@/components/hud/hud-frame";
import type { PresenceHandle } from "@/lib/vivid/scene";
import type { VividState } from "@/lib/vivid/state";

// The state readout: what she is doing, as an instrument.
//
// A traced frame with the state line inside it, and beside the line a small
// live meter of the level that matters for the state: her hearing while she
// listens, her voice while she speaks. The meter is what makes attention
// visible in the chrome, not only in the particles. It is driven straight
// from the presence in its own animation loop and written to the DOM, so it
// costs no React render per frame.
//
// The frame re-traces on every state change (arriveKey), so a change reads
// as an event: the readout arrives, it does not just swap its words.

const BARS = 9;

interface Props {
  handle: RefObject<PresenceHandle | null>;
  state: VividState;
  /** The state line, already in the active language. */
  line: string;
  /** The loudness tag while she speaks, already in the active language. */
  loudness: string | null;
  className?: string;
}

export function StateReadout({ handle, state, line, loudness, className = "" }: Props) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);

  const live = state === "listening" || state === "speaking";

  useEffect(() => {
    let frame = 0;
    // Smoothed on the way to the DOM so the bars breathe rather than jitter.
    let shown = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const presence = handle.current;
      if (!presence) return;
      const { input, output } = presence.levels();
      const target = state === "listening" ? input : state === "speaking" ? output : 0;
      shown += (target - shown) * 0.25;
      const lit = Math.round(Math.min(1, shown * 1.6) * BARS);
      for (let i = 0; i < BARS; i++) {
        const el = bars.current[i];
        if (!el) continue;
        // Lit bars are gold while she speaks and green while she listens: the
        // meter carries the state's colour, the same as the particles do.
        const on = i < lit;
        el.style.opacity = on ? "1" : "0.18";
        el.style.background = on
          ? state === "listening"
            ? "var(--color-green-bright)"
            : "var(--color-gold-bright)"
          : "var(--color-silver)";
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [handle, state]);

  return (
    <HudFrame accent={live} arriveKey={state} className={className} padding="px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="font-hud text-[10px] font-medium tracking-[0.3em] whitespace-nowrap text-silver-bright sm:text-[11px]">
          {line}
          {loudness ? <span className="ml-3 text-gold">{loudness}</span> : null}
        </span>
        <span
          aria-hidden
          className="flex h-[10px] items-end gap-[2px]"
          style={{ opacity: live ? 1 : 0.35, transition: "opacity 0.6s" }}
        >
          {Array.from({ length: BARS }, (_, i) => (
            <span
              key={i}
              ref={(el) => {
                bars.current[i] = el;
              }}
              className="block w-[2px] rounded-[1px]"
              style={{
                height: `${4 + i * 0.7}px`,
                background: "var(--color-silver)",
                opacity: 0.18,
                transition: "opacity 0.08s, background 0.3s",
              }}
            />
          ))}
        </span>
      </div>
    </HudFrame>
  );
}
