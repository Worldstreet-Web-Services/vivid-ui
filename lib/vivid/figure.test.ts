import { describe, expect, it } from "vitest";
import { REGION } from "@/lib/vivid/bands";
import { FEMALE, MALE } from "@/lib/vivid/bust";
import { figureTarget, landmarks } from "@/lib/vivid/figure";

const opts = { count: 20_000, seed: 20260815 };

/** Every particle that is part of the body itself: not halo, not shed energy. */
function body(t: ReturnType<typeof figureTarget>) {
  const out: number[] = [];
  for (let i = 0; i < t.count; i++) {
    const r = t.regions[i];
    if (r === REGION.HALO || r === REGION.CROWN || r === REGION.ATMOSPHERE) continue;
    out.push(i);
  }
  return out;
}

describe("figureTarget", () => {
  it("places exactly the number of particles asked for", () => {
    for (const count of [1000, 4096, 20_000]) {
      expect(figureTarget(FEMALE, { count, seed: 1 }).count).toBe(count);
    }
  });

  it("is a relief: everything on the body faces the viewer", () => {
    // The reference is a fixed frontal view, so she has no back. A form with
    // a back would waste half its particles where nobody sees them, and the
    // face test in bust.ts assumes z > 0 means front.
    const t = figureTarget(FEMALE, opts);
    for (const i of body(t)) expect(t.positions[i * 3 + 2]).toBeGreaterThanOrEqual(-0.002);
  });

  it("stands the body 0..1 tall", () => {
    const t = figureTarget(FEMALE, opts);
    let lo = Infinity;
    let hi = -Infinity;
    for (const i of body(t)) {
      lo = Math.min(lo, t.positions[i * 3 + 1]);
      hi = Math.max(hi, t.positions[i * 3 + 1]);
    }
    expect(lo).toBeGreaterThan(-0.02);
    expect(hi).toBeLessThan(1.02);
    expect(hi - lo).toBeGreaterThan(0.95);
  });

  it("brightens the rim by bunching, not by drawing a stroke", () => {
    // The whole point of sampling in angle across a half-cylinder: particles
    // pile up where the surface turns away. Count particles per column across
    // one band of the head and expect the outer columns to hold more.
    const t = figureTarget(FEMALE, { ...opts, atmosphereShare: 0, haloShare: 0 });
    const L = landmarks(FEMALE);
    const y0 = L.chin + L.headSpan * 0.4;
    const y1 = L.chin + L.headSpan * 0.6;
    const columns = new Array<number>(10).fill(0);
    let hw = 0;
    for (const i of body(t)) {
      const y = t.positions[i * 3 + 1];
      if (y < y0 || y > y1) continue;
      hw = Math.max(hw, Math.abs(t.positions[i * 3]));
    }
    for (const i of body(t)) {
      const y = t.positions[i * 3 + 1];
      if (y < y0 || y > y1) continue;
      const u = Math.abs(t.positions[i * 3]) / hw;
      columns[Math.min(9, Math.floor(u * 10))]++;
    }
    expect(columns[9]).toBeGreaterThan(columns[4] * 1.5);
    // And the rim attribute agrees: high at the edge, low in the middle.
    let edgeRim = 0;
    let midRim = 0;
    let ne = 0;
    let nm = 0;
    for (const i of body(t)) {
      const y = t.positions[i * 3 + 1];
      if (y < y0 || y > y1) continue;
      const u = Math.abs(t.positions[i * 3]) / hw;
      if (u > 0.9) {
        edgeRim += t.rim[i];
        ne++;
      } else if (u < 0.2) {
        midRim += t.rim[i];
        nm++;
      }
    }
    expect(edgeRim / ne).toBeGreaterThan(0.7);
    expect(midRim / nm).toBeLessThan(0.15);
  });

  it("puts the head lines closer together than the torso lines", () => {
    // Density follows importance. The head has the detail; the torso is
    // allowed to open out, which is what keeps her from being a filled shape.
    const t = figureTarget(FEMALE, { ...opts, atmosphereShare: 0, haloShare: 0 });
    const L = landmarks(FEMALE);
    const headYs = new Set<number>();
    const torsoYs = new Set<number>();
    for (const i of body(t)) {
      const y = t.positions[i * 3 + 1];
      const key = Math.round(y * 500);
      if (y > L.chin + L.headSpan * 0.2 && y < L.chin + L.headSpan * 0.8) headYs.add(key);
      if (y > L.throat * 0.1 && y < L.throat * 0.7) torsoYs.add(key);
    }
    const headSpan = L.headSpan * 0.6;
    const torsoSpan = L.throat * 0.6;
    expect(headYs.size / headSpan).toBeGreaterThan((torsoYs.size / torsoSpan) * 1.1);
  });

  it("names her face, throat, crown and halo", () => {
    const t = figureTarget(FEMALE, opts);
    const seen = new Set(t.regions);
    for (const r of [REGION.CORE, REGION.FILAMENT, REGION.CROWN, REGION.HALO, REGION.INTERIOR]) {
      expect(seen.has(r)).toBe(true);
    }
  });

  it("keeps the halo behind her and off her body", () => {
    const t = figureTarget(FEMALE, opts);
    let n = 0;
    for (let i = 0; i < t.count; i++) {
      if (t.regions[i] !== REGION.HALO) continue;
      expect(t.positions[i * 3 + 2]).toBeLessThan(0);
      n++;
    }
    expect(n).toBeGreaterThan(opts.count * 0.05);
  });

  it("sheds the crown as a plume, not a box", () => {
    // Narrow at the skull and spreading as it rises: the spread of the top
    // third of the plume is wider than the bottom third's.
    const t = figureTarget(FEMALE, opts);
    const L = landmarks(FEMALE);
    const top = L.chin + L.headSpan;
    let lowSpread = 0;
    let highSpread = 0;
    for (let i = 0; i < t.count; i++) {
      if (t.regions[i] !== REGION.CROWN) continue;
      const rise = (t.positions[i * 3 + 1] - top) / (L.headSpan * 0.4);
      const x = Math.abs(t.positions[i * 3]);
      if (rise < 0.33) lowSpread = Math.max(lowSpread, x);
      else if (rise > 0.66) highSpread = Math.max(highSpread, x);
    }
    expect(highSpread).toBeGreaterThan(lowSpread);
  });

  it("puts the male and female through the same generator", () => {
    const f = figureTarget(FEMALE, opts);
    const m = figureTarget(MALE, opts);
    expect(f.count).toBe(m.count);
    // Same regions present in both.
    expect(new Set(f.regions)).toEqual(new Set(m.regions));
  });

  it("is deterministic", () => {
    const a = figureTarget(FEMALE, { count: 3000, seed: 9 });
    const b = figureTarget(FEMALE, { count: 3000, seed: 9 });
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  });
});
