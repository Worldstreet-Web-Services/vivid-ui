import { describe, expect, it } from "vitest";
import { BeatDetector } from "@/lib/vivid/audio";

/** Feeds a low-band signal at 60fps: `pulses` says when it spikes. */
function run(detector: BeatDetector, seconds: number, low: (t: number) => number) {
  const dt = 1 / 60;
  const onsets: number[] = [];
  for (let t = 0; t <= seconds; t += dt) {
    detector.update(t, low(t));
    if (detector.onset === 1) onsets.push(Number(t.toFixed(3)));
  }
  return onsets;
}

/** A pulse train: a sharp rise every `period` seconds on a low floor. */
function train(period: number, floor = 0.08, peak = 0.6) {
  return (t: number) => {
    const phase = (t % period) / period;
    return phase < 0.08 ? peak : floor;
  };
}

describe("BeatDetector", () => {
  it("finds the onsets in a regular pulse train", () => {
    const d = new BeatDetector();
    const onsets = run(d, 6, train(0.5));
    // ~12 pulses in 6s; the first can be missed while the average settles.
    expect(onsets.length).toBeGreaterThanOrEqual(10);
    expect(onsets.length).toBeLessThanOrEqual(13);
  });

  it("learns the tempo from their spacing", () => {
    const d = new BeatDetector();
    run(d, 6, train(0.5));
    expect(d.interval).toBeGreaterThan(0.45);
    expect(d.interval).toBeLessThan(0.55);
  });

  it("does not count one syllable twice", () => {
    // A single spike held for 100ms is one onset, not six frames of them.
    const d = new BeatDetector();
    const onsets = run(d, 2, (t) => (t > 0.5 && t < 0.6 ? 0.7 : 0.08));
    expect(onsets).toHaveLength(1);
  });

  it("fires nothing on silence", () => {
    const d = new BeatDetector();
    expect(run(d, 3, () => 0)).toHaveLength(0);
    expect(d.interval).toBe(0);
  });

  it("fires nothing on a steady loud tone", () => {
    // Loud is not a beat. An onset is a RISE above what has been normal.
    const d = new BeatDetector();
    const onsets = run(d, 4, () => 0.6);
    // The very first frame may register as a rise from zero; nothing after.
    expect(onsets.length).toBeLessThanOrEqual(1);
  });

  it("forgets a tempo nobody confirms", () => {
    const d = new BeatDetector();
    run(d, 3, train(0.5));
    expect(d.interval).toBeGreaterThan(0);
    // Then silence.
    run(d, 3, () => 0);
    // ...but run() restarts t at 0. Drive it forward explicitly instead.
    const d2 = new BeatDetector();
    const dt = 1 / 60;
    for (let t = 0; t < 3; t += dt) d2.update(t, train(0.5)(t));
    expect(d2.interval).toBeGreaterThan(0);
    for (let t = 3; t < 7; t += dt) d2.update(t, 0);
    expect(d2.interval).toBe(0);
  });

  it("keeps the phase running between beats", () => {
    const d = new BeatDetector();
    const dt = 1 / 60;
    for (let t = 0; t < 4; t += dt) d.update(t, train(0.5)(t));
    // Right after a beat lands the phase is reset to zero; a quarter of a
    // beat later it has advanced by about a quarter, and it never exceeds 1.
    // (Sampled just after a beat, so the comparison never crosses a wrap.)
    let onsetAt = -1;
    for (let t = 4; t < 5; t += dt) {
      d.update(t, train(0.5)(t));
      if (d.onset === 1) {
        onsetAt = t;
        break;
      }
    }
    expect(onsetAt).toBeGreaterThan(0);
    expect(d.phase).toBe(0);
    for (let t = onsetAt + dt; t < onsetAt + 0.125; t += dt) d.update(t, 0.08);
    expect(d.phase).toBeGreaterThan(0.15);
    expect(d.phase).toBeLessThan(0.35);
  });

  it("decays the onset rather than dropping it", () => {
    const d = new BeatDetector();
    d.update(0, 0.08);
    d.update(0.5, 0.7);
    expect(d.onset).toBe(1);
    d.update(0.55, 0.08);
    expect(d.onset).toBeGreaterThan(0.5);
    expect(d.onset).toBeLessThan(1);
  });
});
