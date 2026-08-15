"use client";

// The four corner brackets that frame the whole viewport.
//
// The first thing to appear at boot, before her and before the wordmark: they
// draw the space the instrument lives in. Hairline silver, well inside the
// safe area so they never fight the browser chrome, and each traces in from
// its corner with a small stagger, so the frame is drawn rather than shown.

const LEN = 22;

export function ViewportFrame({ visible = true }: { visible?: boolean }) {
  const corners: { style: React.CSSProperties; d: string; delay: number }[] = [
    { style: { top: 12, left: 12 }, d: `M0 ${LEN} V0 H${LEN}`, delay: 0 },
    { style: { top: 12, right: 12 }, d: `M0 0 H${LEN} V${LEN}`, delay: 90 },
    { style: { bottom: 12, right: 12 }, d: `M${LEN} 0 V${LEN} H0`, delay: 180 },
    { style: { bottom: 12, left: 12 }, d: `M${LEN} ${LEN} H0 V0`, delay: 270 },
  ];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 hud-motion transition-opacity duration-700"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {corners.map((c, i) => (
        <svg
          key={i}
          className="absolute overflow-visible"
          style={c.style}
          width={LEN}
          height={LEN}
          viewBox={`0 0 ${LEN} ${LEN}`}
        >
          <path
            d={c.d}
            fill="none"
            stroke="var(--color-silver-bright)"
            strokeOpacity={0.55}
            strokeWidth={1}
            strokeDasharray={LEN * 2}
            strokeDashoffset={LEN * 2}
            style={{ animation: `hud-trace 0.45s ease-out ${c.delay}ms forwards` }}
          />
        </svg>
      ))}
    </div>
  );
}
