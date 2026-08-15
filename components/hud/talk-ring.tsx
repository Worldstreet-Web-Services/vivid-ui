"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { PresenceHandle } from "@/lib/vivid/scene";

// The control you speak through: a ring, not a pill.
//
// At rest it is a silver ring that traces itself in, with the label inside.
// While you are recording it fills gold, clockwise, with the level of your
// voice, and the whole ring breathes on it: the control shows that she is
// hearing you before she has said a word. The fill is driven straight from
// the presence in its own animation loop, so it costs no React render per
// frame. On a lost line or before she has assembled it sits dim and inert.

const R = 30;
const C = 2 * Math.PI * R;

interface Props {
  handle: RefObject<PresenceHandle | null>;
  recording: boolean;
  disabled: boolean;
  onPress: () => void;
  startLabel: string;
  stopLabel: string;
  className?: string;
}

export function TalkRing({
  handle,
  recording,
  disabled,
  onPress,
  startLabel,
  stopLabel,
  className = "",
}: Props) {
  const fill = useRef<SVGCircleElement>(null);
  const halo = useRef<SVGCircleElement>(null);

  useEffect(() => {
    let frame = 0;
    let shown = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const presence = handle.current;
      if (!presence || !fill.current || !halo.current) return;
      const target = recording ? Math.min(1, presence.levels().input * 1.8) : 0;
      shown += (target - shown) * 0.22;
      // The gold arc grows clockwise from the top with your voice.
      fill.current.style.strokeDashoffset = String(C * (1 - shown));
      // And a soft halo swells with it.
      halo.current.style.opacity = String(shown * 0.55);
      halo.current.setAttribute("r", String(R + 4 + shown * 6));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [handle, recording]);

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={recording ? stopLabel : startLabel}
      aria-pressed={recording}
      className={`hud-motion group/ring relative flex h-[76px] w-[76px] cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-1 focus-visible:ring-silver-bright/70 disabled:cursor-not-allowed ${className}`}
      style={{ animation: "hud-panel-in 0.55s 200ms both" }}
    >
      <svg aria-hidden viewBox="0 0 76 76" className="absolute inset-0 h-full w-full overflow-visible">
        {/* The halo behind the ring while you speak. */}
        <circle
          ref={halo}
          cx="38"
          cy="38"
          r={R + 4}
          fill="var(--color-gold)"
          opacity={0}
          style={{ filter: "blur(10px)", transition: "opacity 0.2s" }}
        />
        {/* The resting ring, tracing itself in. */}
        <circle
          cx="38"
          cy="38"
          r={R}
          fill="none"
          stroke="var(--color-silver)"
          strokeOpacity={disabled ? 0.25 : 0.55}
          strokeWidth={1}
          strokeDasharray={C}
          strokeDashoffset={C}
          style={{
            animation: "hud-trace 0.7s ease-out 300ms forwards",
            transform: "rotate(-90deg)",
            transformOrigin: "50% 50%",
            transition: "stroke-opacity 0.4s",
          }}
        />
        {/* Tick marks at the quarters, so it reads as an instrument. */}
        {[0, 90, 180, 270].map((deg) => (
          <line
            key={deg}
            x1="38"
            y1={38 - R - 3}
            x2="38"
            y2={38 - R + 2}
            stroke="var(--color-silver-bright)"
            strokeOpacity={0.5}
            strokeWidth={1}
            transform={`rotate(${deg} 38 38)`}
          />
        ))}
        {/* The gold fill: your voice, clockwise from the top. */}
        <circle
          ref={fill}
          cx="38"
          cy="38"
          r={R}
          fill="none"
          stroke="var(--color-gold-bright)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C}
          style={{
            transform: "rotate(-90deg)",
            transformOrigin: "50% 50%",
            filter: "drop-shadow(0 0 4px var(--color-gold))",
          }}
        />
      </svg>
      <span
        className={`font-display relative text-[10px] font-semibold tracking-[0.3em] transition-colors ${
          disabled
            ? "text-silver/40"
            : recording
              ? "text-gold-bright"
              : "text-silver-bright group-hover/ring:text-warm-white"
        }`}
        style={{ paddingLeft: "0.3em" }}
      >
        {recording ? stopLabel : startLabel}
      </span>
    </button>
  );
}
