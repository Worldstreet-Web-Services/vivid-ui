"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// The frame every HUD element sits in.
//
// An SVG outline that draws itself on arrival, corner brackets that snap on a
// beat after it, and the content flickering up inside once the frame is
// there: the arrival sequence of a holographic panel, in the order the genre
// does it. Silver stroke; a gold accent along one edge when the element is the
// one that matters right now. Sized by its content, so it is a wrapper and not
// a layout.
//
// The frame is drawn with stroke-dashoffset, so the trace is one CSS animation
// and costs nothing per frame. The path length is measured once on mount and
// again on resize; until measured the frame is simply present, which is also
// what reduced-motion users get.

export interface HudFrameProps {
  children: ReactNode;
  /** A gold line along the left edge: this element is live right now. */
  accent?: boolean;
  /** Corner bracket length in px. */
  corner?: number;
  /** Delay before the arrival begins, in ms. Lets a set of frames stagger. */
  delay?: number;
  /** Re-runs the arrival when this changes: the frame re-traces on a new key. */
  arriveKey?: string | number;
  className?: string;
  /** Padding inside the frame, as a Tailwind class. */
  padding?: string;
}

function Frame({
  children,
  accent = false,
  corner = 10,
  delay = 0,
  className = "",
  padding = "px-3 py-2",
}: Omit<HudFrameProps, "arriveKey">) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // Set once the arrival has finished. After that a resize (the font swapping
  // in, a longer state line) redraws the frame in place with no animation:
  // otherwise every measurement re-ran the trace and the frame stuttered, or
  // never finished, whenever the text reflowed under it.
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      // Sub-pixel churn from font metrics is not a resize.
      setSize((prev) => (prev && Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // The last beat of the arrival is the corners, at delay + 560ms + 120ms.
    const t = window.setTimeout(() => setArrived(true), delay + 720);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, [delay]);

  const w = size?.w ?? 0;
  const h = size?.h ?? 0;
  const perimeter = 2 * (w + h);
  const inset = 0.5;

  return (
    <div
      ref={box}
      className={`hud-motion relative ${className}`}
      style={arrived ? undefined : { animation: `hud-panel-in 0.55s ${delay}ms both` }}
    >
      {size ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-visible"
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
        >
          {/* The outline, tracing itself. */}
          <rect
            x={inset}
            y={inset}
            width={Math.max(0, w - inset * 2)}
            height={Math.max(0, h - inset * 2)}
            fill="none"
            stroke="var(--color-silver)"
            strokeOpacity={0.45}
            strokeWidth={1}
            strokeDasharray={perimeter}
            strokeDashoffset={arrived ? 0 : perimeter}
            style={arrived ? undefined : { animation: `hud-trace 0.5s linear ${delay + 120}ms forwards` }}
          />
          {/* Corner brackets, snapping on after the trace. */}
          <g
            fill="none"
            stroke="var(--color-silver-bright)"
            strokeWidth={1.5}
            opacity={arrived ? 1 : 0}
            style={arrived ? undefined : { animation: `hud-corner 0.12s steps(2) ${delay + 560}ms forwards` }}
          >
            <path d={`M0 ${corner} V0 H${corner}`} />
            <path d={`M${w - corner} 0 H${w} V${corner}`} />
            <path d={`M${w} ${h - corner} V${h} H${w - corner}`} />
            <path d={`M${corner} ${h} H0 V${h - corner}`} />
          </g>
          {/* The gold accent, when this is the live element. */}
          {accent ? (
            <line
              x1={0}
              y1={corner}
              x2={0}
              y2={h - corner}
              stroke="var(--color-gold)"
              strokeWidth={2}
              style={{ filter: "drop-shadow(0 0 4px var(--color-gold))" }}
            />
          ) : null}
        </svg>
      ) : null}
      {/* Content, up in steps once the frame is there. */}
      <div
        className={`relative ${padding}`}
        style={arrived ? undefined : { animation: `hud-body-in 0.3s steps(3) ${delay + 380}ms both` }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * A HudFrame whose arrival re-runs whenever `arriveKey` changes.
 *
 * Keyed at the component, not at an inner element: keying the inner div alone
 * remounted the DOM node while the size state and the ResizeObserver stayed
 * bound to the old one, so a state change that altered the text's width left
 * the frame drawn for the previous size, or not at all.
 */
export function HudFrame(props: HudFrameProps) {
  const { arriveKey, ...rest } = props;
  return <Frame key={arriveKey} {...rest} />;
}
