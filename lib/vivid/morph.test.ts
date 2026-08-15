import { describe, expect, it } from "vitest";
import { alignToReference, fitTarget, generateBandedTarget, REGION } from "@/lib/vivid/bands";
import { bustForm, FEMALE } from "@/lib/vivid/bust";
import { CONSTELLATION, clearTargets, getTarget, registerTarget } from "@/lib/vivid/morph-targets";

const COUNT = 6000;
const opts = { count: COUNT, bands: 96, seed: 11 };

/** A stand-in for the galaxy: points scattered around the origin. */
function reference(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  let a = 99;
  const rand = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < count; i++) {
    const theta = rand() * Math.PI * 2;
    const r = 0.4 + rand() * 1.6;
    out[i * 3] = Math.cos(theta) * r;
    out[i * 3 + 1] = Math.sin(theta) * r;
    out[i * 3 + 2] = (rand() - 0.5) * 0.4;
  }
  return out;
}

/** Mirrors the GLSL: mDelay/mProg/mEase, then mix(from, to, mEase). */
const STAGGER = 0.35;
function morphAt(from: number, to: number, seed: number, uMorph: number): number {
  const mDelay = seed * STAGGER;
  const mProg = Math.min(1, Math.max(0, (uMorph - mDelay) / (1 - STAGGER)));
  const mEase = 1 - Math.pow(1 - mProg, 3);
  return from * (1 - mEase) + to * mEase;
}

describe("alignToReference", () => {
  const ref = reference(COUNT);
  const raw = fitTarget(generateBandedTarget(bustForm(FEMALE), opts), 4.4, 0);
  const aligned = alignToReference(raw, ref);

  it("keeps every point, just in a different order", () => {
    // Losing or duplicating a point would tear a hole in the form.
    const sortNums = (a: Float32Array) => Array.from(a).sort((x, y) => x - y);
    expect(sortNums(aligned.positions)).toEqual(sortNums(raw.positions));
    expect(aligned.count).toBe(raw.count);
  });

  it("moves the region and rim tags with their points", () => {
    // If tags do not follow their positions, the face ends up on a shoulder.
    const tally = (r: Uint8Array) => {
      const c: Record<number, number> = {};
      for (const v of r) c[v] = (c[v] ?? 0) + 1;
      return c;
    };
    expect(tally(aligned.regions)).toEqual(tally(raw.regions));
  });

  it("shortens the distance particles have to travel", () => {
    // The whole point. An arbitrary mapping sends particles across the frame,
    // which reads as static rather than as the mass reorganising.
    const travel = (t: typeof raw) => {
      let sum = 0;
      for (let i = 0; i < COUNT; i++) {
        sum += Math.hypot(
          t.positions[i * 3] - ref[i * 3],
          t.positions[i * 3 + 1] - ref[i * 3 + 1]
        );
      }
      return sum / COUNT;
    };
    expect(travel(aligned)).toBeLessThan(travel(raw));
  });

  it("sends a particle to roughly the side of the figure it started on", () => {
    const sameSide = (t: typeof raw) => {
      let agree = 0;
      for (let i = 0; i < COUNT; i++) {
        if (Math.sign(t.positions[i * 3]) === Math.sign(ref[i * 3])) agree++;
      }
      return agree / COUNT;
    };
    expect(sameSide(aligned)).toBeGreaterThan(0.75);
    expect(sameSide(aligned)).toBeGreaterThan(sameSide(raw));
  });
});

describe("the morph curve", () => {
  it("leaves the constellation untouched at rest", () => {
    for (let i = 0; i <= 1000; i++) {
      expect(morphAt(3.2, -91.7, i / 1000, 0)).toBe(3.2);
    }
  });

  it("lands every particle by the end", () => {
    for (let i = 0; i <= 1000; i++) {
      expect(morphAt(3.2, 7, i / 1000, 1)).toBeCloseTo(7, 10);
    }
  });

  it("never overshoots or reverses on the way", () => {
    // A particle that backs up mid-transition reads as a glitch.
    for (const seed of [0, 0.31, 0.72, 0.99]) {
      let last = -Infinity;
      for (let u = 0; u <= 1.0001; u += 0.01) {
        const v = morphAt(0, 1, seed, u);
        expect(v).toBeGreaterThanOrEqual(last - 1e-9);
        expect(v).toBeLessThanOrEqual(1 + 1e-9);
        last = v;
      }
    }
  });

  it("staggers: some particles are still leaving as others arrive", () => {
    // Without the stagger the whole mass moves as one and the change reads as
    // a cut rather than a reorganisation.
    const early = morphAt(0, 1, 0.02, 0.55);
    const late = morphAt(0, 1, 0.98, 0.55);
    expect(early - late).toBeGreaterThan(0.25);
  });
});

describe("target registration", () => {
  it("refuses a target of the wrong length", () => {
    clearTargets();
    expect(() => registerTarget("bad", new Float32Array(9), 100)).toThrow(/points; the Core has/);
  });

  it("defaults a form with no named parts to plain rim", () => {
    clearTargets();
    registerTarget(CONSTELLATION, new Float32Array(30), 10);
    const t = getTarget(CONSTELLATION)!;
    expect(t.regions.length).toBe(10);
    expect([...t.regions].every((r) => r === REGION.RIM)).toBe(true);
  });
});

describe("core anchors", () => {
  it("gives a form with no named parts an anchor and a reach", () => {
    // Without these, a car or a gold bar has nowhere to put the voice.
    clearTargets();
    const positions = new Float32Array(300);
    for (let i = 0; i < 100; i++) positions[i * 3] = (i / 100) * 4;
    registerTarget("plain", positions, 100);
    const t = getTarget("plain")!;
    expect(t.coreAnchor).toBeNull();
    expect(t.coreRadius).toBeGreaterThan(0);
  });

  it("scales the reach to the form, so a small form does not glow like a big one", () => {
    clearTargets();
    const small = new Float32Array(300);
    const big = new Float32Array(300);
    for (let i = 0; i < 100; i++) {
      small[i * 3] = (i / 100) * 0.5;
      big[i * 3] = (i / 100) * 20;
    }
    registerTarget("small", small, 100);
    registerTarget("big", big, 100);
    expect(getTarget("big")!.coreRadius).toBeGreaterThan(getTarget("small")!.coreRadius * 10);
  });

  it("honours an explicit reach over the derived one", () => {
    clearTargets();
    registerTarget("bust", new Float32Array(300), 100, [0, 1, 0], undefined, undefined, 0.62);
    expect(getTarget("bust")!.coreRadius).toBe(0.62);
  });

  it("moves the anchor with the form when it is fitted", () => {
    // An anchor left behind lights empty space.
    const raw = generateBandedTarget(bustForm(FEMALE), opts);
    const fitted = fitTarget(raw, 4.4, 0.2);
    expect(fitted.coreAnchor[1]).toBeGreaterThan(0);
    expect(Math.abs(fitted.coreAnchor[1])).toBeLessThan(4.4);
  });
});
