// Bakes the forms into point clouds, offline.
//
// Run with:  pnpm bake
//
// Every form here is TRACED from the actual product mesh: a car comes from the
// silhouette of that car, seen from the side, and not from anyone's idea of
// what a car looks like. The mesh is rasterised to a mask and the mask becomes
// particles. Her, and the building, are generated in the browser instead.
//
// Deterministic: same meshes in, same bytes out. Re-run it any time.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { REGION, type BandedTarget } from "../lib/vivid/bands";
import { fillHoles, targetFromMask, type Mask } from "../lib/vivid/mask-form";
import { glbPositions } from "./glb-positions";
import { maskFromMesh, closeGaps } from "./mesh-mask";

const here = dirname(fileURLToPath(import.meta.url));
const MESHES = resolve(here, "../../primal/public/3d");
const OUT = resolve(here, "../public/forms");

// The whole population, so a form has a place for every particle.
const COUNT = 64450;

interface FormSource {
  name: string;
  /** A .glb under primal's 3d folder. */
  mesh: string;
  /** How far the form swells front to back. A car is shallow, a router is not. */
  depth: number;
  /** Which axis points at the viewer. Defaults to looking down z. */
  viewAxis?: "x" | "y" | "z";
}

const FORMS: FormSource[] = [
  { name: "car-falcon", mesh: "car-falcon.glb", depth: 0.34 },
  { name: "car-c-series", mesh: "car-c-series.glb", depth: 0.34 },
  { name: "car-og-series", mesh: "car-og-series.glb", depth: 0.34 },
  { name: "car-passion", mesh: "car-passion.glb", depth: 0.34 },
  { name: "car-r2", mesh: "car-r2.glb", depth: 0.4 },
  { name: "car-v-series", mesh: "car-v-series.glb", depth: 0.34 },
  { name: "car-vc-series", mesh: "car-vc-series.glb", depth: 0.34 },
  { name: "interlink", mesh: "interlink.glb", depth: 0.5 },
];


function maskFor(source: FormSource): Mask {
  const glb = readFileSync(resolve(MESHES, source.mesh));
  const positions = glbPositions(
    glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer
  );
  // Splat, close the gaps between splats, then fill whatever pockets are left
  // inside. A model is sparse across its flat panels, and every one of those
  // gaps would otherwise punch a hole through the silhouette.
  return fillHoles(
    closeGaps(maskFromMesh(positions, { resolution: 560, radius: 3, viewAxis: source.viewAxis }), 2)
  );
}

/**
 * Orders points so each sits next to the one before it.
 *
 * Delta encoding only pays if consecutive entries are close. Forms are built
 * scanline by scanline, so walking rows top to bottom and left to right along
 * each one keeps every step small.
 */
function walkOrder(target: BandedTarget, rows: number): number[] {
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < target.count; i++) {
    const y = target.positions[i * 3 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = maxY - minY || 1;
  const row = (i: number) =>
    Math.min(rows - 1, Math.floor(((target.positions[i * 3 + 1] - minY) / span) * rows));
  return Array.from({ length: target.count }, (_, i) => i).sort(
    (a, b) => row(a) - row(b) || target.positions[a * 3] - target.positions[b * 3]
  );
}

/**
 * Positions as 16-bit fixed point, delta-encoded, plus regions and rim.
 *
 * Int16 over a known range costs about a millimetre at this scale, far below a
 * particle's own size, and ordering the points so each sits near the last
 * leaves mostly small differences, which is what compresses.
 *
 * rim is stored, unlike in the previous format. On a ring it was recoverable
 * from the angle; on a traced form it comes from the distance to the outline,
 * which the position alone does not carry.
 */
function encode(target: BandedTarget): Buffer {
  const order = walkOrder(target, 140);
  let extent = 0;
  for (const v of target.positions) extent = Math.max(extent, Math.abs(v));
  const scale = extent > 0 ? 32767 / extent : 1;

  const header = Buffer.alloc(16);
  header.write("VFRM", 0, "ascii");
  header.writeUInt32LE(3, 4); // format version: 3 is a traced form, rim in file
  header.writeUInt32LE(target.count, 8);
  header.writeFloatLE(extent, 12);

  const pos = Buffer.alloc(target.count * 3 * 2);
  const previous = [0, 0, 0];
  for (let k = 0; k < target.count; k++) {
    const i = order[k];
    for (let a = 0; a < 3; a++) {
      const q = Math.max(-32767, Math.min(32767, Math.round(target.positions[i * 3 + a] * scale)));
      let delta = q - previous[a];
      // Wrap into range rather than clamp: a clamped delta would drift the rest
      // of the form permanently, where a wrapped one reconstructs exactly.
      if (delta > 32767) delta -= 65536;
      if (delta < -32768) delta += 65536;
      pos.writeInt16LE(delta, (k * 3 + a) * 2);
      previous[a] = q;
    }
  }

  const regions = Buffer.alloc(target.count);
  const rim = Buffer.alloc(target.count);
  for (let k = 0; k < target.count; k++) {
    regions[k] = target.regions[order[k]];
    rim[k] = Math.round(Math.min(1, Math.max(0, target.rim[order[k]])) * 255);
  }

  const anchor = Buffer.alloc(12);
  const [ax, ay, az] = target.coreAnchor;
  anchor.writeFloatLE(ax, 0);
  anchor.writeFloatLE(ay, 4);
  anchor.writeFloatLE(az, 8);

  return Buffer.concat([header, anchor, pos, regions, rim]);
}

mkdirSync(OUT, { recursive: true });

let total = 0;
for (const source of FORMS) {
  const mask = maskFor(source);
  // Baked in the form's own units, standing 1 tall. Fitting belongs at load,
  // where the viewport is known: a car is nearly four times longer than it is
  // tall, so fitting its height here would run it off both sides of the screen.
  const target = targetFromMask(mask, {
    count: COUNT,
    seed: 20260815,
    outlineShare: 0.26,
    lines: 104,
    atmosphereShare: 0.07,
    depth: source.depth,
    jitter: 0.0012,
  });

  const bytes = encode(target);
  writeFileSync(resolve(OUT, `${source.name}.bin`), bytes);
  total += bytes.length;
  let edge = 0;
  for (let i = 0; i < target.count; i++) if (target.regions[i] === REGION.RIM) edge++;
  console.log(
    `  ${source.name.padEnd(14)} ${String(mask.width).padStart(4)}x${String(mask.height).padEnd(4)} ` +
      `${((edge / target.count) * 100).toFixed(0).padStart(3)}% outline -> ` +
      `${(bytes.length / 1024).toFixed(0).padStart(4)}KB`
  );
}
console.log(`  ${FORMS.length} forms, ${(total / 1024).toFixed(0)}KB total`);
