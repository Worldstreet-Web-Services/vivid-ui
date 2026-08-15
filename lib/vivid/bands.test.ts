import { describe, expect, it } from "vitest";
import { REGION, generateBandedTarget, profileForm, rimness, type BandedForm } from "./bands";

// A tapering column: wide at the bottom, narrow at the top, absent above 1.
// Enough shape to tell banding from scatter without pulling in a real bust.
const cone: BandedForm = profileForm(
  0,
  1,
  (y) => (y > 1 ? null : { halfWidth: 0.5 * (1 - y * 0.6), halfDepth: 0.3 * (1 - y * 0.6) }),
  [0, 0.8, 0]
);

const opts = { count: 5000, bands: 40, seed: 7 };

describe("generateBandedTarget", () => {
  it("returns exactly the requested count", () => {
    // The count is a promise: a target of the wrong length would morph the
    // wrong particles, so it must hold even when bands return no outline.
    for (const count of [1, 999, 5000, 63001]) {
      const out = generateBandedTarget(cone, { ...opts, count });
      expect(out.positions.length).toBe(count * 3);
      expect(out.regions.length).toBe(count);
      expect(out.count).toBe(count);
    }
  });

  it("is deterministic for a seed", () => {
    const a = generateBandedTarget(cone, opts);
    const b = generateBandedTarget(cone, opts);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  });

  it("changes with the seed", () => {
    const a = generateBandedTarget(cone, opts);
    const b = generateBandedTarget(cone, { ...opts, seed: 8 });
    expect(Array.from(a.positions)).not.toEqual(Array.from(b.positions));
  });

  it("lays points in discrete horizontal bands, not a smear", () => {
    // The whole look rests on this. Structural points sit at band centres, so
    // the count of distinct Y values should be near the band count — a scatter
    // would give thousands.
    const out = generateBandedTarget(cone, { ...opts, jitter: 0, atmosphereShare: 0 });
    const ys = new Set<string>();
    for (let i = 0; i < out.count; i++) ys.add(out.positions[i * 3 + 1].toFixed(5));
    expect(ys.size).toBeLessThanOrEqual(opts.bands);
    expect(ys.size).toBeGreaterThan(opts.bands * 0.5);
  });

  it("puts most points on the rim and few inside", () => {
    // The reference reads as hollow: the edge carries the shape.
    const out = generateBandedTarget(cone, opts);
    let rim = 0;
    let interior = 0;
    for (const r of out.regions) {
      if (r === REGION.RIM) rim++;
      if (r === REGION.INTERIOR) interior++;
    }
    expect(rim).toBeGreaterThan(interior * 4);
  });

  it("crowds points toward the silhouette edges", () => {
    // rimBias should bunch particles where the outline crosses the silhouette,
    // which is what makes the left and right edges the brightest thing.
    const even = generateBandedTarget(cone, { ...opts, rimBias: 0, atmosphereShare: 0 });
    const biased = generateBandedTarget(cone, { ...opts, rimBias: 1, atmosphereShare: 0 });
    const meanAbsX = (t: { positions: Float32Array; count: number }) => {
      let sum = 0;
      for (let i = 0; i < t.count; i++) sum += Math.abs(t.positions[i * 3]);
      return sum / t.count;
    };
    expect(meanAbsX(biased)).toBeGreaterThan(meanAbsX(even));
  });

  it("gives a wide band more points than a narrow one", () => {
    // Otherwise the broad shoulders look like they are dissolving while the
    // crown looks solid.
    const out = generateBandedTarget(cone, { ...opts, jitter: 0, atmosphereShare: 0 });
    const perBand = new Map<string, number>();
    for (let i = 0; i < out.count; i++) {
      const key = out.positions[i * 3 + 1].toFixed(5);
      perBand.set(key, (perBand.get(key) ?? 0) + 1);
    }
    const rows = [...perBand.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
    expect(rows[0][1]).toBeGreaterThan(rows[rows.length - 1][1]);
  });

  it("keeps every point inside the form's height", () => {
    const out = generateBandedTarget(cone, opts);
    for (let i = 0; i < out.count; i++) {
      const y = out.positions[i * 3 + 1];
      expect(y).toBeGreaterThan(cone.yMin - 0.2);
      expect(y).toBeLessThan(cone.yMax + 0.2);
    }
  });

  it("carries the form's core anchor through", () => {
    expect(generateBandedTarget(cone, opts).coreAnchor).toEqual([0, 0.8, 0]);
  });

  it("lets a form name its own regions", () => {
    const withCore = profileForm(
      0,
      1,
      () => ({ halfWidth: 0.5, halfDepth: 0.3 }),
      [0, 0.5, 0],
      (_x, y) => (y > 0.8 ? REGION.CORE : null)
    );
    const out = generateBandedTarget(withCore, opts);
    let core = 0;
    for (const r of out.regions) if (r === REGION.CORE) core++;
    expect(core).toBeGreaterThan(0);
  });

  it("survives a form that is absent at most heights", () => {
    // A band with no outline must not leave the target short.
    const sparse = profileForm(0, 1, (y) => (y > 0.2 ? null : { halfWidth: 0.4, halfDepth: 0.2 }), [
      0, 0.1, 0,
    ]);
    const out = generateBandedTarget(sparse, opts);
    expect(out.positions.length).toBe(opts.count * 3);
    expect(out.positions.every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe("rimness", () => {
  it("is 1 where the outline crosses the silhouette", () => {
    expect(rimness(0)).toBeCloseTo(1, 6);
    expect(rimness(Math.PI)).toBeCloseTo(1, 6);
  });

  it("is 0 at the front and back of the ring", () => {
    expect(rimness(Math.PI / 2)).toBeCloseTo(0, 6);
    expect(rimness((3 * Math.PI) / 2)).toBeCloseTo(0, 6);
  });
});
