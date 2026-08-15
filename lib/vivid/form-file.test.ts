import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { decodeForm } from "@/lib/vivid/form-file";
import { REGION, resampleTarget } from "@/lib/vivid/bands";

const DIR = resolve("public/forms");
const files = readdirSync(DIR).filter((f) => f.endsWith(".bin"));

function load(name: string) {
  const buf = readFileSync(resolve(DIR, name));
  return decodeForm(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
}

describe("baked forms", () => {
  it("bakes every form", () => {
    // Seven cars and the router, all from the product meshes. She and the
    // building are generated in the browser and never touch this directory.
    expect(files.length).toBe(8);
    expect(files.filter((f) => f.startsWith("car-")).length).toBe(7);
    expect(files).toContain("interlink.bin");
  });

  it.each(files)("%s decodes to a whole population", (name) => {
    const t = load(name);
    expect(t.count).toBe(64450);
    expect(t.positions.length).toBe(t.count * 3);
    expect(t.positions.every((v) => Number.isFinite(v))).toBe(true);
  });

  it.each(files)("%s reconstructs without the deltas drifting", (name) => {
    // Delta encoding accumulates: one bad step and every point after it is
    // wrong, which shows as the form shearing away into the distance rather
    // than as an obvious failure.
    //
    // Forms are baked in their own units, standing 0..1 tall, so that height is
    // the invariant to check. Width is not: a car is nearly four times longer
    // than it is tall, and the drifting atmosphere reaches further still.
    const t = load(name);
    let minY = Infinity;
    let maxY = -Infinity;
    let far = 0;
    for (let i = 0; i < t.count; i++) {
      // Only the body of the form. Atmosphere drifts around it, the crown is
      // shed upward on purpose, and the halo rings run past it by design, so
      // none of them says anything about the height.
      const r = t.regions[i];
      if (r !== REGION.ATMOSPHERE && r !== REGION.CROWN && r !== REGION.HALO) {
        minY = Math.min(minY, t.positions[i * 3 + 1]);
        maxY = Math.max(maxY, t.positions[i * 3 + 1]);
      }
      far = Math.max(far, Math.abs(t.positions[i * 3]), Math.abs(t.positions[i * 3 + 2]));
    }
    expect(maxY - minY).toBeCloseTo(1, 1);
    expect(far).toBeLessThan(5);
  });

  it.each(files)("%s keeps its rim on the silhouette", (name) => {
    // A traced form's rim is its distance to the outline, which the position
    // does not carry, so it is stored. If it fails to round-trip the figure
    // loses its luminous edge and goes flat.
    const t = load(name);
    expect(t.rim.every((v) => v >= 0 && v <= 1)).toBe(true);
    let onEdge = 0;
    for (const v of t.rim) if (v > 0.9) onEdge++;
    expect(onEdge).toBeGreaterThan(0);
  });

  it.each(files)("%s names its parts", (name) => {
    const t = load(name);
    const seen = new Set(t.regions);
    expect(seen.has(REGION.RIM)).toBe(true);
    expect(seen.size).toBeGreaterThan(1);
  });

  // A phone builds roughly half the particles a desktop does. Baked forms hold
  // one point per full-density particle, and a count that disagrees is refused,
  // so without resampling none of the cars would ever appear on mobile.
  const MOBILE = 35449;

  it.each(files)("%s thins to a phone's particle count", (name) => {
    const thin = resampleTarget(load(name), MOBILE);
    expect(thin.count).toBe(MOBILE);
    expect(thin.positions.length).toBe(MOBILE * 3);
    expect(thin.regions.length).toBe(MOBILE);
    expect(thin.rim.length).toBe(MOBILE);
  });

  it.each(files)("%s keeps its whole shape when thinned", (name) => {
    // Sampled at a stride, not truncated. A prefix would be the bottom of the
    // form and nothing else, which still has the right count and would pass
    // every check above.
    const full = load(name);
    const thin = resampleTarget(full, MOBILE);
    const spanY = (t: typeof full) => {
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < t.count; i++) {
        if (t.regions[i] === REGION.ATMOSPHERE) continue;
        min = Math.min(min, t.positions[i * 3 + 1]);
        max = Math.max(max, t.positions[i * 3 + 1]);
      }
      return max - min;
    };
    expect(spanY(thin)).toBeCloseTo(spanY(full), 1);
  });

  it("leaves a target alone when the count already matches", () => {
    const full = load(files[0]);
    expect(resampleTarget(full, full.count)).toBe(full);
  });

  it("refuses a file that is not a form", () => {
    expect(() => decodeForm(new Uint8Array(64).buffer)).toThrow(/Not a baked form/);
  });

  it("refuses a version it cannot read", () => {
    // Reading an old file with new code would produce a subtly wrong shape,
    // which is much harder to notice than a failure to load.
    const buf = readFileSync(resolve(DIR, files[0]));
    const copy = new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    new DataView(copy.buffer).setUint32(4, 99, true);
    expect(() => decodeForm(copy.buffer)).toThrow(/version 99/);
  });

  it("ships no mesh to the browser", () => {
    // The whole point of baking: no .glb and no loader in what is served.
    const served = readdirSync(resolve("public"), { recursive: true }) as string[];
    expect(served.filter((f) => String(f).endsWith(".glb"))).toEqual([]);
  });
});
