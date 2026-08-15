// Turning a silhouette into particles.
//
// The band generator answers "how wide is the form at this height", which is
// fine for a bust and hopeless for a car: one width per height cannot express a
// wheel arch, a gap under the sill, or the two antennas on a router. So a
// traced subject skips it entirely and works from the shape itself.
//
// The subject arrives as a mask — one bit per pixel, on where the subject is —
// and comes out as three things the shader already understands: a bright stroke
// around the outline, contour lines across the inside, and a depth that swells
// from nothing at the edge to full in the middle, so a flat picture reads as a
// solid when the view shifts.

import { REGION, type BandedTarget, type Region } from "@/lib/vivid/bands";

export interface Mask {
  width: number;
  height: number;
  on: Uint8Array;
}

export interface MaskFormOptions {
  count: number;
  seed: number;
  /** Share of the budget spent on the outline stroke. */
  outlineShare?: number;
  /** Horizontal contour lines drawn across the subject. */
  lines?: number;
  /** Share scattered loosely around the form. */
  atmosphereShare?: number;
  /**
   * How far the form swells front to back, as a share of its height.
   *
   * A picture is flat. Left flat, the figure vanishes to a line as the view
   * turns and the parallax has nothing to work on.
   */
  depth?: number;
  jitter?: number;
}

function mulberry(seedNum: number): () => number {
  let a = seedNum >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fills background pockets the outside cannot reach.
 *
 * A splatted mesh is full of pinholes where the model had few vertices, and a
 * traced photograph has them wherever the subject happened to match its
 * background. Neither is a real hole: a real one — the gap under a car between
 * its wheels, the space between two antennas — opens to the edge of the frame,
 * and is left exactly as it is.
 */
export function fillHoles(mask: Mask): Mask {
  const { width, height, on } = mask;
  const reachable = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (on[p] || reachable[p]) return;
    reachable[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length > 0) {
    const p = stack.pop() as number;
    const x = p % width;
    const y = (p - x) / width;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = on[i] || !reachable[i] ? 1 : 0;
  return { width, height, on: out };
}

/**
 * Distance from each subject pixel to the nearest background pixel.
 *
 * Two passes of a chamfer transform rather than an exact Euclidean one: the
 * result is used to swell the depth and to fade the edge brightness, and
 * neither notices the fraction of a pixel the approximation costs.
 */
export function distanceToEdge(mask: Mask): Float32Array {
  const { width, height, on } = mask;
  const d = new Float32Array(width * height);
  const FAR = width + height;
  for (let i = 0; i < d.length; i++) d[i] = on[i] ? FAR : 0;

  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : d[y * width + x]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (!on[p]) continue;
      d[p] = Math.min(d[p], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414);
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const p = y * width + x;
      if (!on[p]) continue;
      d[p] = Math.min(d[p], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414);
    }
  }
  return d;
}

/** Subject pixels with at least one background neighbour: the outline itself. */
export function edgePixels(mask: Mask): number[] {
  const { width, height, on } = mask;
  const out: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (!on[p]) continue;
      const left = x === 0 || !on[p - 1];
      const right = x === width - 1 || !on[p + 1];
      const up = y === 0 || !on[p - width];
      const down = y === height - 1 || !on[p + width];
      if (left || right || up || down) out.push(p);
    }
  }
  return out;
}

/** The subject's bounding box, so the form can be normalised to it. */
export function subjectBounds(mask: Mask) {
  const { width, height, on } = mask;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!on[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Particles for a traced subject, standing 0..1 tall and centred on its axis.
 *
 * Same output shape as the band generator, so everything downstream — fitting,
 * pairing to the constellation, baking — treats a traced car exactly like a
 * bust built from maths.
 */
export function targetFromMask(mask: Mask, options: MaskFormOptions): BandedTarget {
  const {
    count,
    seed,
    outlineShare = 0.24,
    lines = 96,
    atmosphereShare = 0.08,
    depth = 0.22,
    jitter = 0.0015,
  } = options;

  const rand = mulberry(seed);
  const positions = new Float32Array(count * 3);
  const regions = new Uint8Array(count);
  const rim = new Float32Array(count);

  const box = subjectBounds(mask);
  if (box.height <= 0) throw new Error("The mask has no subject in it.");
  // Pixels to form units: the subject stands exactly 1 tall, whatever it is.
  // Divided by the span between the first and last row, not by the count of
  // rows — six rows are five steps apart, and dividing by six leaves every
  // form a row short of the height it claims.
  const scale = 1 / Math.max(1, box.height - 1);
  const midX = (box.minX + box.maxX) / 2;
  // Image y runs downward and the form's runs up.
  const toX = (px: number) => (px - midX) * scale;
  const toY = (py: number) => (box.maxY - py) * scale;

  const dist = distanceToEdge(mask);
  let maxDist = 0;
  for (const v of dist) if (v > maxDist) maxDist = v;
  if (maxDist <= 0) maxDist = 1;

  let written = 0;
  const put = (x: number, y: number, z: number, region: Region, rimness: number) => {
    if (written >= count) return;
    const i = written * 3;
    positions[i] = x;
    positions[i + 1] = y;
    positions[i + 2] = z;
    regions[written] = region;
    rim[written] = rimness;
    written++;
  };

  // ---- the outline stroke ----
  // Every edge pixel gets at least one particle before any is doubled up, so
  // the stroke is continuous rather than dense in one place and broken in
  // another. This is the line that makes the subject recognisable.
  const edge = edgePixels(mask);
  const outlineCount = Math.min(count, Math.round(count * outlineShare));
  for (let i = 0; i < outlineCount && edge.length > 0; i++) {
    const p = edge[i % edge.length];
    const px = p % mask.width;
    const py = (p - px) / mask.width;
    put(
      toX(px) + (rand() - 0.5) * jitter,
      toY(py) + (rand() - 0.5) * jitter,
      // On the silhouette, so front and back meet here and the depth is nil.
      (rand() - 0.5) * jitter,
      REGION.RIM,
      1
    );
  }

  // ---- contour lines across the subject ----
  // Scanlines, exactly as the reference draws a head: evenly spaced rows, each
  // one broken wherever the subject is. A row that crosses a wheel arch comes
  // out as two runs with a gap, which is the whole reason for working from the
  // shape rather than from a width.
  const structural = Math.max(0, count - Math.round(count * atmosphereShare));
  const runs: { y: number; from: number; to: number }[] = [];
  let runPixels = 0;
  for (let line = 0; line < lines; line++) {
    const py = Math.min(box.maxY, box.minY + Math.floor(((line + 0.5) / lines) * box.height));
    let x = box.minX;
    while (x <= box.maxX) {
      if (!mask.on[py * mask.width + x]) {
        x++;
        continue;
      }
      const from = x;
      while (x <= box.maxX && mask.on[py * mask.width + x]) x++;
      runs.push({ y: py, from, to: x - 1 });
      runPixels += x - from;
    }
  }

  const forLines = Math.max(0, structural - written);
  if (runPixels > 0) {
    for (const run of runs) {
      const share = (run.to - run.from + 1) / runPixels;
      const points = Math.round(forLines * share);
      for (let i = 0; i < points && written < structural; i++) {
        // Within the run's own pixels. Sampling across `to - from + 1` reaches
        // one pixel past the right end and never past the left, which leans
        // every form to the right of its own centre.
        const px = run.from + rand() * (run.to - run.from);
        const d = dist[run.y * mask.width + Math.min(mask.width - 1, Math.round(px))];
        // 0 on the outline, 1 deepest inside.
        const u = Math.min(1, d / maxDist);
        // A dome front to back: the surface at the silhouette is edge-on and
        // has no depth, and it swells to the full thickness at the middle.
        const swell = Math.sqrt(Math.max(0, 2 * u - u * u));
        put(
          toX(px) + (rand() - 0.5) * jitter,
          toY(run.y) + (rand() - 0.5) * jitter,
          (rand() < 0.5 ? -1 : 1) * depth * swell + (rand() - 0.5) * jitter,
          REGION.INTERIOR,
          // Matches what an elliptical cross-section gives: 1 where the surface
          // turns away from the viewer, 0 facing straight on.
          1 - u
        );
      }
    }
  }

  // ---- atmosphere ----
  // Loose particles drifting off the subject. Exactly the share asked for and
  // no more: these sit outside the outline, so any extra would push the form's
  // measured extent past its own silhouette and shrink it when it is fitted.
  const atmosphere = Math.min(count - written, Math.round(count * atmosphereShare));
  const stopAt = written + atmosphere;
  while (written < stopAt && edge.length > 0) {
    const p = edge[Math.floor(rand() * edge.length)];
    const px = p % mask.width;
    const py = (p - px) / mask.width;
    const reach = 0.02 + rand() * 0.06;
    const angle = rand() * Math.PI * 2;
    put(
      toX(px) + Math.cos(angle) * reach,
      toY(py) + Math.sin(angle) * reach,
      (rand() - 0.5) * depth * 2,
      REGION.ATMOSPHERE,
      0
    );
  }

  // Whatever the runs and the atmosphere left over goes on the outline. The
  // count is a promise — a target of the wrong length is refused outright — and
  // the outline is the one place extra particles can never change the shape.
  while (written < count && edge.length > 0) {
    const p = edge[written % edge.length];
    const px = p % mask.width;
    const py = (p - px) / mask.width;
    put(
      toX(px) + (rand() - 0.5) * jitter,
      toY(py) + (rand() - 0.5) * jitter,
      (rand() - 0.5) * jitter,
      REGION.RIM,
      1
    );
  }
  // A mask with an outline always has edge pixels, so this only runs for a
  // degenerate one, and it still has to keep the promise.
  while (written < count) put(0, 0, 0, REGION.ATMOSPHERE, 0);

  // Warmth from the middle: a car lights at its centre when she speaks as it.
  return { positions, regions, rim, coreAnchor: [0, 0.5, 0], count };
}
