"use client";

import type { VividState } from "@/lib/vivid/state";

// The thin strip along the bottom edge: the line she is on, and where.
//
// A connection indicator that carries the state's colour (breathing silver
// while she wakes, held green once the line is live, gold ticks on a lost
// line), the network status as a readout rather than a sentence, and the
// language. Small and constant: it is the instrument panel's bottom rail, not
// a message.

interface Props {
  state: VividState;
  connected: boolean;
  /** The raw network status text the socket reports. */
  status: string;
  language: string;
  className?: string;
}

export function StatusStrip({ state, connected, status, language, className = "" }: Props) {
  const lost = state === "error";
  const waking = state === "connecting" || state === "assembling";
  const dotColour = lost
    ? "var(--color-gold)"
    : connected
      ? "var(--color-green-bright)"
      : "var(--color-silver)";

  return (
    <div
      className={`pointer-events-none flex items-center gap-4 font-hud text-[9px] tracking-[0.22em] text-silver/70 uppercase sm:text-[10px] ${className}`}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="block h-[6px] w-[6px] rounded-full"
          style={{
            background: dotColour,
            boxShadow: `0 0 8px ${dotColour}`,
            animation: waking ? "hud-idle 1.4s ease-in-out infinite" : lost ? "hud-boot-pulse 0.5s steps(2) infinite" : "none",
          }}
        />
        <span className="text-silver-bright/80">{lost ? "LINE LOST" : connected ? "LINE LIVE" : "LINKING"}</span>
      </span>
      <span aria-hidden className="h-[1px] w-6 bg-silver/25" />
      <span className="truncate">{status}</span>
      <span aria-hidden className="h-[1px] w-6 bg-silver/25" />
      <span className="text-silver-bright/80">{language}</span>
    </div>
  );
}
