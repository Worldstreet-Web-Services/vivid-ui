import { describe, expect, it } from "vitest";
import { fitTarget, generateBandedTarget, REGION } from "@/lib/vivid/bands";
import { bustForm, FEMALE, MALE, type BustProportions } from "@/lib/vivid/bust";

const opts = { count: 20000, bands: 96, seed: 3 };

/** Widest half-width across the whole form, ignoring the drifting atmosphere. */
function structuralExtent(p: BustProportions) {
  const out = generateBandedTarget(bustForm(p), opts);
  let maxX = 0;
  for (let i = 0; i < out.count; i++) {
    if (out.regions[i] === REGION.ATMOSPHERE) continue;
    maxX = Math.max(maxX, Math.abs(out.positions[i * 3]));
  }
  return maxX;
}

/** Half-width at a given height, measured off the form itself. */
function widthAt(p: BustProportions, y: number) {
  const form = bustForm(p);
  const pt = form.outlineAt(y, 0);
  return pt ? Math.abs(pt[0]) : 0;
}

describe("bust proportions", () => {
  it("gives the female figure narrower shoulders", () => {
    // The second strongest cue, and the one read at a glance.
    expect(structuralExtent(FEMALE)).toBeLessThan(structuralExtent(MALE));
  });

  it("gives the female figure a longer neck relative to her head", () => {
    // The strongest cue. Measured as a ratio so it survives a change to the
    // absolute scale of either figure.
    expect(FEMALE.neckLength / 1).toBeGreaterThan(MALE.neckLength / 1);
  });

  it("gives the female figure a narrower jaw and chin", () => {
    expect(FEMALE.jawWidth).toBeLessThan(MALE.jawWidth);
    expect(FEMALE.chinWidth).toBeLessThan(MALE.chinWidth);
  });

  it("slopes the female shoulder more steeply", () => {
    expect(FEMALE.shoulderSlope).toBeGreaterThan(MALE.shoulderSlope);
  });

  it("makes the head widest at the cheekbones", () => {
    // Widest at the chin or the crown would read as a jaw or a balloon.
    const total = FEMALE.neckLength + FEMALE.torsoDrop + 1;
    const chin = (FEMALE.neckLength + FEMALE.torsoDrop) / total;
    const head = 1 / total;
    const at = (t: number) => widthAt(FEMALE, chin + head * t);
    expect(at(0.62)).toBeGreaterThan(at(0.05));
    expect(at(0.62)).toBeGreaterThan(at(0.95));
  });

  it("pinches at the neck, between head and shoulders", () => {
    const total = FEMALE.neckLength + FEMALE.torsoDrop + 1;
    const chin = (FEMALE.neckLength + FEMALE.torsoDrop) / total;
    const throat = FEMALE.torsoDrop / total;
    const neck = widthAt(FEMALE, (chin + throat) / 2);
    const head = widthAt(FEMALE, chin + (1 / total) * 0.5);
    const shoulder = widthAt(FEMALE, throat * 0.45);
    expect(neck).toBeLessThan(head);
    expect(neck).toBeLessThan(shoulder);
  });

  it("widens the shoulders smoothly rather than in a step", () => {
    // A square shoulder is the one shape the reference never has, so the
    // profile must keep easing out through the shoulder rather than saturating
    // early. Only through the shoulder: below it the waist pulls back in.
    const total = FEMALE.neckLength + FEMALE.torsoDrop + 1;
    const throat = FEMALE.torsoDrop / total;
    const widths = [0.9, 0.75, 0.6, 0.5].map((f) => widthAt(FEMALE, throat * f));
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeGreaterThan(widths[i - 1]);
    }
  });

  it("never draws the silhouette back in below the shoulders", () => {
    // Measured off the reference rather than assumed: from the throat down the
    // outline widens the whole way and is simply cut off by the frame. An
    // earlier version of this test asserted the opposite, and the waist it was
    // protecting is what closed the figure into an hourglass on a point.
    for (const p of [FEMALE, MALE]) {
      const total = p.neckLength + p.torsoDrop + 1;
      const throat = p.torsoDrop / total;
      let previous = 0;
      for (let i = 10; i >= 0; i--) {
        const width = widthAt(p, (throat * i) / 10);
        expect(width).toBeGreaterThanOrEqual(previous);
        previous = width;
      }
    }
  });

  it("carries the head on a neck thick enough to hold it", () => {
    // The measured ratio is a little under two thirds. Pinching below that is
    // what turned the figure into a goblet, so it is worth pinning down.
    for (const p of [FEMALE, MALE]) {
      expect(p.neckWidth / p.headWidth).toBeGreaterThan(0.55);
      expect(p.neckWidth / p.headWidth).toBeLessThan(0.8);
    }
  });

  it("gives the head a dome rather than a point", () => {
    // The crown holds most of its width well past the cheekbones and then turns
    // over hard. Narrowing steadily from the cheekbones draws a kite.
    for (const p of [FEMALE, MALE]) {
      const total = p.neckLength + p.torsoDrop + 1;
      const chin = (p.neckLength + p.torsoDrop) / total;
      const head = 1 / total;
      // t runs 0 at the chin to 1 at the crown.
      const at = (t: number) => widthAt(p, chin + head * t);
      const widest = at(0.5);
      // 0.81 in the reference frame, so this is the measurement with room to tune.
      expect(at(0.78)).toBeGreaterThan(widest * 0.78);
      expect(at(0.99)).toBeLessThan(widest * 0.4);
    }
  });

  it("puts the warm core on the face, low on the head and front-facing", () => {
    const out = generateBandedTarget(bustForm(FEMALE), opts);
    let core = 0;
    let coreYSum = 0;
    let behind = 0;
    for (let i = 0; i < out.count; i++) {
      if (out.regions[i] !== REGION.CORE) continue;
      core++;
      coreYSum += out.positions[i * 3 + 1];
      if (out.positions[i * 3 + 2] < 0) behind++;
    }
    expect(core).toBeGreaterThan(200);
    // Never on the back of the head, or it reads as a lantern.
    expect(behind).toBe(0);
    const total = FEMALE.neckLength + FEMALE.torsoDrop + 1;
    const chin = (FEMALE.neckLength + FEMALE.torsoDrop) / total;
    const mid = chin + 1 / total / 2;
    expect(coreYSum / core).toBeLessThan(mid);
  });

  it("runs filaments down the throat and no higher than the chin", () => {
    const out = generateBandedTarget(bustForm(FEMALE), opts);
    const total = FEMALE.neckLength + FEMALE.torsoDrop + 1;
    const chin = (FEMALE.neckLength + FEMALE.torsoDrop) / total;
    let filament = 0;
    for (let i = 0; i < out.count; i++) {
      if (out.regions[i] !== REGION.FILAMENT) continue;
      filament++;
      expect(out.positions[i * 3 + 1]).toBeLessThan(chin);
    }
    expect(filament).toBeGreaterThan(50);
  });

  it("draws nested arcs across the chest, below the throat only", () => {
    const out = generateBandedTarget(bustForm(FEMALE), opts);
    const total = FEMALE.neckLength + FEMALE.torsoDrop + 1;
    const throat = FEMALE.torsoDrop / total;
    let arcs = 0;
    const radii: number[] = [];
    for (let i = 0; i < out.count; i++) {
      if (out.regions[i] !== REGION.ARC) continue;
      arcs++;
      const x = out.positions[i * 3];
      const y = out.positions[i * 3 + 1];
      expect(y).toBeLessThan(throat);
      radii.push(Math.hypot(x, (y - throat) * 1.35));
    }
    expect(arcs).toBeGreaterThan(100);
    // Concentric means the radii cluster into rings rather than spreading
    // evenly, so a coarse histogram should have empty buckets between them.
    const buckets = new Set(radii.map((r) => Math.round(r / 0.01)));
    expect(buckets.size).toBeLessThan(radii.length / 4);
  });

  it("keeps amber off everything except the face and the throat", () => {
    // The one palette rule the reference never breaks. CORE and FILAMENT are
    // the only warm regions; if either leaks onto the crown or the shoulders
    // the figure reads as a lamp instead of a face with a voice.
    const out = generateBandedTarget(bustForm(FEMALE), opts);
    const total = FEMALE.neckLength + FEMALE.torsoDrop + 1;
    const chin = (FEMALE.neckLength + FEMALE.torsoDrop) / total;
    const throat = FEMALE.torsoDrop / total;
    for (let i = 0; i < out.count; i++) {
      const r = out.regions[i];
      if (r !== REGION.CORE && r !== REGION.FILAMENT) continue;
      const y = out.positions[i * 3 + 1];
      const z = out.positions[i * 3 + 2];
      expect(z).toBeGreaterThan(0); // front-facing only, never the back
      if (r === REGION.CORE) expect(y).toBeGreaterThan(chin);
      if (r === REGION.FILAMENT) expect(y).toBeLessThan(chin);
      if (r === REGION.FILAMENT) expect(y).toBeGreaterThan(throat - 0.35);
    }
  });

  it("keeps every particle finite for both figures", () => {
    for (const p of [FEMALE, MALE]) {
      const out = generateBandedTarget(bustForm(p), opts);
      expect(out.positions.every((v) => Number.isFinite(v))).toBe(true);
      expect(out.rim.every((v) => v >= 0 && v <= 1)).toBe(true);
    }
  });
});

describe("fitTarget", () => {
  it("scales a form to a height and centres it", () => {
    const fitted = fitTarget(generateBandedTarget(bustForm(FEMALE), opts), 4.4, 0.2);
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < fitted.count; i++) {
      if (fitted.regions[i] === REGION.ATMOSPHERE) continue;
      minY = Math.min(minY, fitted.positions[i * 3 + 1]);
      maxY = Math.max(maxY, fitted.positions[i * 3 + 1]);
    }
    expect(maxY - minY).toBeCloseTo(4.4, 3);
    expect((minY + maxY) / 2).toBeCloseTo(0.2, 3);
  });

  it("carries the core anchor through the same transform", () => {
    // If the anchor is not moved with the form, the voice lights up empty space.
    const raw = generateBandedTarget(bustForm(FEMALE), opts);
    const fitted = fitTarget(raw, 4.4, 0.2);
    expect(fitted.coreAnchor[1]).not.toBeCloseTo(raw.coreAnchor[1], 2);
    expect(Number.isFinite(fitted.coreAnchor[1])).toBe(true);
  });
});

describe("both figures come from one generator", () => {
  it("uses the same code path, differing only in proportions", () => {
    // If the male ever needs its own function, the parameterisation has failed
    // and the two figures will drift out of sympathy with each other.
    const f = generateBandedTarget(bustForm(FEMALE), opts);
    const m = generateBandedTarget(bustForm(MALE), opts);
    expect(f.count).toBe(m.count);
    // Same seed, same generator: the region mix should be broadly alike even
    // though the silhouettes differ.
    const mix = (t: typeof f) => {
      const c: Record<number, number> = {};
      for (const r of t.regions) c[r] = (c[r] ?? 0) + 1;
      return c;
    };
    const fm = mix(f);
    const mm = mix(m);
    for (const region of [REGION.RIM, REGION.CORE, REGION.FILAMENT, REGION.CROWN, REGION.ARC]) {
      expect(fm[region] ?? 0).toBeGreaterThan(0);
      expect(mm[region] ?? 0).toBeGreaterThan(0);
    }
  });

  it("differs enough in silhouette to be told apart", () => {
    // The figures must not be the same shape at a different scale: compare the
    // shoulder-to-head width ratio, which is what the eye actually reads.
    const ratio = (p: typeof FEMALE) => {
      const total = p.neckLength + p.torsoDrop + 1;
      const throat = p.torsoDrop / total;
      const chin = (p.neckLength + p.torsoDrop) / total;
      const form = bustForm(p);
      const shoulder = Math.abs(form.outlineAt(throat * 0.35, 0)![0]);
      const head = Math.abs(form.outlineAt(chin + (1 / total) * 0.6, 0)![0]);
      return shoulder / head;
    };
    expect(Math.abs(ratio(MALE) - ratio(FEMALE))).toBeGreaterThan(0.25);
  });
});

describe("fitTarget box constraint", () => {
  it("shrinks a wide figure to stay inside the frame", () => {
    // The male's shoulders are wider than a portrait viewport shows, so the
    // width has to win over the requested height.
    const raw = generateBandedTarget(bustForm(MALE), opts);
    const fitted = fitTarget(raw, 4.4, 0, 3.8);
    let halfWidth = 0, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < fitted.count; i++) {
      if (fitted.regions[i] === REGION.ATMOSPHERE) continue;
      halfWidth = Math.max(halfWidth, Math.abs(fitted.positions[i * 3]));
      minY = Math.min(minY, fitted.positions[i * 3 + 1]);
      maxY = Math.max(maxY, fitted.positions[i * 3 + 1]);
    }
    expect(halfWidth * 2).toBeLessThanOrEqual(3.8 + 1e-6);
    // and it ends up shorter than asked for, rather than overflowing
    expect(maxY - minY).toBeLessThan(4.4);
  });

  it("uses the full height when width is not the constraint", () => {
    const fitted = fitTarget(generateBandedTarget(bustForm(FEMALE), opts), 4.4, 0, 99);
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < fitted.count; i++) {
      if (fitted.regions[i] === REGION.ATMOSPHERE) continue;
      minY = Math.min(minY, fitted.positions[i * 3 + 1]);
      maxY = Math.max(maxY, fitted.positions[i * 3 + 1]);
    }
    expect(maxY - minY).toBeCloseTo(4.4, 3);
  });
});
