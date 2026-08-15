// Her, as an energy figure.
//
// Built from the reference rather than from a photograph. The frames show a
// head and shoulders drawn in flowing lines: latitude lines across a rounded
// head, arching over the crown and pinching in at the temples, sweeping down
// over the shoulders. The bright rim is not a stroke — it is where dozens of
// those lines converge as the surface turns away from the viewer.
//
// So the figure is a relief. The silhouette comes from measured proportions
// (bust.ts); the surface is that silhouette given depth, rounded like a head
// and a torso; and the particles are laid along CONTOUR STREAMS across that
// surface, not around it. Seen from the front they read as the reference's
// lines. Nothing here has a back: the reference is a fixed frontal view, and a
// relief is what it actually shows.
//
// Density follows importance rather than a mask. Streams are closer together
// near the silhouette and across the head, and thin out through the middle
// of the torso, so the form emerges from the field instead of being filled.

import { REGION, type BandedForm, type BandedTarget, type Region } from "@/lib/vivid/bands";
import { bustForm, type BustProportions } from "@/lib/vivid/bust";

export interface FigureOptions {
  count: number;
  seed: number;
  /** Contour streams down the whole figure. */
  streams?: number;
  /** Share of the budget for the halo rings behind the head. */
  haloShare?: number;
  /** Share for the loose energy around the figure. */
  atmosphereShare?: number;
  /** How far the head stands proud of its silhouette, as a share of height. */
  headDepth?: number;
  torsoDepth?: number;
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

/** Where the landmarks sit for a set of proportions, all in 0..1 of height. */
export function landmarks(p: BustProportions) {
  const total = p.neckLength + p.torsoDrop + 1;
  return {
    chin: (p.neckLength + p.torsoDrop) / total,
    throat: p.torsoDrop / total,
    headSpan: 1 / total,
    total,
  };
}

/**
 * The relief.
 *
 * Given the silhouette's half-width at a height, the surface across it is a
 * rounded profile: at the centre it stands `depth` proud, and it falls to zero
 * at the edge. A cosine, so it turns over hard at the rim — an ellipse would
 * flatten the middle and steepen the sides, and it is the rate the surface
 * turns away that draws the rim.
 */
function reliefZ(u: number, depth: number): number {
  // u is -1..1 across the silhouette.
  return depth * Math.cos((Math.min(1, Math.abs(u)) * Math.PI) / 2);
}

/**
 * How squarely a point on the relief faces the viewer, 0 at the centre and 1
 * at the rim. This is what the shader brightens, and it is what makes the
 * silhouette emerge without anyone drawing it.
 */
function rimOf(u: number): number {
  return Math.pow(Math.min(1, Math.abs(u)), 1.6);
}

/**
 * Lays the figure out.
 *
 * Contour streams run across the surface at a series of heights, each one
 * following the relief so it bows out at the centre and turns in at the edges,
 * exactly as a line of latitude on a head does. Streams are placed by
 * importance: close together over the head and near the throat, opening out
 * down the torso.
 */
export function figureTarget(p: BustProportions, options: FigureOptions): BandedTarget {
  const {
    count,
    seed,
    streams = 150,
    haloShare = 0.1,
    atmosphereShare = 0.05,
    headDepth = 0.2,
    torsoDepth = 0.12,
    jitter = 0.0016,
  } = options;

  const rand = mulberry(seed);
  const form: BandedForm = bustForm(p);
  const L = landmarks(p);

  const positions = new Float32Array(count * 3);
  const regions = new Uint8Array(count);
  const rim = new Float32Array(count);
  let written = 0;

  // Body particles are named by the bust's own regionAt (face, throat, arcs);
  // anything shed off the body keeps the region it was given. Letting the
  // figure's naming reach the plume or the atmosphere relabels energy that has
  // left the body as part of it.
  const put = (x: number, y: number, z: number, region: Region, r: number, name = true) => {
    if (written >= count) return;
    const i = written * 3;
    positions[i] = x;
    positions[i + 1] = y;
    positions[i + 2] = z;
    regions[written] = (name ? form.regionAt?.(x, y, z) : null) ?? region;
    rim[written] = r;
    written++;
  };

  const halfWidthAt = (y: number): number => {
    const pt = form.outlineAt(y, 0);
    return pt ? Math.abs(pt[0]) : 0;
  };

  // ---- where the streams go ----
  //
  // Importance per height, 0..1: dense over the head, densest just under the
  // chin where the jaw turns into the neck, easing off down the torso. The
  // streams are then placed so equal amounts of importance fall between them.
  const importance = (y: number): number => {
    if (y > L.chin) {
      // Over the head. Slightly denser toward the crown, where the lines
      // bunch as the skull turns over.
      const t = (y - L.chin) / L.headSpan;
      return 0.9 + 0.35 * t * t;
    }
    if (y > L.throat) return 1.0; // the neck: short, and every line counts
    // The torso, easing away with distance from the throat.
    const t = (L.throat - y) / Math.max(0.0001, L.throat);
    return 0.72 * (1 - 0.6 * t);
  };
  const STEPS = 400;
  const cumulative: number[] = [0];
  for (let i = 1; i <= STEPS; i++) {
    cumulative.push(cumulative[i - 1] + importance(i / STEPS));
  }
  const totalImportance = cumulative[STEPS];
  const streamHeights: number[] = [];
  for (let s = 0; s < streams; s++) {
    const want = ((s + 0.5) / streams) * totalImportance;
    let lo = 0;
    let hi = STEPS;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < want) lo = mid + 1;
      else hi = mid;
    }
    streamHeights.push(lo / STEPS);
  }

  // ---- particle budget ----
  const haloCount = Math.round(count * haloShare);
  const atmosphereCount = Math.round(count * atmosphereShare);
  const structural = count - haloCount - atmosphereCount;

  // Each stream's share of the structure follows its length, so a wide
  // shoulder line is not sparser than a short one across the crown, weighted
  // toward the head where the reference has its detail.
  const lengths = streamHeights.map((y) => {
    const hw = halfWidthAt(y);
    const headBoost = y > L.chin ? 1.35 : 1;
    return hw * 2 * headBoost;
  });
  const totalLength = lengths.reduce((a, b) => a + b, 0) || 1;

  // ---- the streams ----
  for (let s = 0; s < streams && written < structural; s++) {
    const y = streamHeights[s];
    const hw = halfWidthAt(y);
    if (hw <= 0) continue;
    const share = lengths[s] / totalLength;
    const points = Math.max(2, Math.round(structural * share));
    // Where on the figure this stream is, so its depth can be that part's.
    const depth = y > L.chin ? headDepth : y > L.throat ? headDepth * 0.72 : torsoDepth;

    // Each stream drifts slightly, so neighbouring lines are not perfectly
    // parallel — the reference's lines wander a little, and it is what keeps
    // them from reading as a grid.
    const wobble = (rand() - 0.5) * 0.006;
    const phase = rand() * Math.PI * 2;

    for (let i = 0; i < points && written < structural; i++) {
      // Along the stream, denser toward the ends: the same particle spacing
      // measured across the surface bunches where the surface turns away, and
      // that is what makes the rim bright without drawing it. Sampling in
      // angle around a half-cylinder gives exactly that bunching.
      const a = (i + rand() * 0.9) / points; // 0..1 along
      const u = -Math.cos(a * Math.PI); // -1..1 across, dense at the ends
      const x = u * hw;
      const z = reliefZ(u, depth);
      // A gentle wave along the line, so it reads as a hand-drawn stream
      // rather than a ruled one.
      const wave = Math.sin(a * Math.PI * 2.5 + phase) * 0.004;
      // Over the head the lines bow: a line of latitude on a sphere seen from
      // just below its equator arches upward at the centre, more so toward
      // the crown, and it is that arch that makes the head read as round
      // rather than as a disc with stripes across it.
      // Bowed by a constant amount, not by one that grows toward the crown:
      // a growing bow lifts the topmost lines above the outline and draws
      // the skull to a point. Constant, the top line still arches but stays
      // inside the silhouette, and the crown keeps its dome.
      let bow = 0;
      if (y > L.chin) {
        const t = (y - L.chin) / L.headSpan;
        // Fades to nothing over the last stretch, so the topmost lines sit
        // flat under the dome rather than poking through it.
        const cap = 1 - Math.pow(Math.max(0, (t - 0.72) / 0.28), 2);
        bow = (1 - u * u) * L.headSpan * 0.035 * Math.max(0, cap);
      }
      put(
        x + (rand() - 0.5) * jitter,
        y + wobble + wave + bow + (rand() - 0.5) * jitter,
        z + (rand() - 0.5) * jitter,
        REGION.INTERIOR,
        rimOf(u)
      );
    }
  }

  // ---- the halo ----
  // Rings behind the head, radiating from the face. Faint, thin, and running
  // past the frame, as they do in the reference.
  const faceY = L.chin + L.headSpan * 0.42;
  const haloFrom = halfWidthAt(L.chin + L.headSpan * 0.5) * 1.6;
  const haloTo = haloFrom + 0.9;
  const RINGS = 12;
  for (let i = 0; i < haloCount && written < count; i++) {
    const ring = Math.floor(rand() * RINGS);
    const r = haloFrom + ((haloTo - haloFrom) * (ring + 0.5)) / RINGS;
    const a = rand() * Math.PI * 2;
    // Rings sit behind the figure and are placed directly, not through
    // put(): the figure's own region naming has no business on them.
    if (written >= count) break;
    const k = written * 3;
    positions[k] = Math.cos(a) * r + (rand() - 0.5) * jitter;
    positions[k + 1] = faceY + Math.sin(a) * r * 0.9 + (rand() - 0.5) * jitter;
    positions[k + 2] = -headDepth * 0.6 - rand() * 0.1;
    regions[written] = REGION.HALO;
    rim[written] = 0;
    written++;
  }

  // ---- atmosphere ----
  // Energy shed off the figure: mostly off the crown, drifting up, and a
  // little off the shoulders. Not a uniform scatter around the outline.
  while (written < count) {
    const offCrown = rand() < 0.7;
    if (offCrown) {
      // A plume: it leaves the top of the skull, spreads as it rises, and
      // thins with height. Height is drawn from a distribution that piles up
      // near the crown, and the spread grows with it.
      const rise = Math.pow(rand(), 1.8); // most particles low, a few high
      const y = L.chin + L.headSpan * (0.92 + rise * 0.4);
      const spread = halfWidthAt(L.chin + L.headSpan * 0.9) * (0.5 + rise * 1.4);
      const x = (rand() - 0.5) * 2 * spread * Math.sqrt(rand());
      put(x, y, (rand() - 0.5) * headDepth * 0.5, REGION.CROWN, 0, false);
    } else {
      const side = rand() < 0.5 ? -1 : 1;
      const y = rand() * L.throat;
      const x = side * (halfWidthAt(y) + 0.01 + rand() * 0.05);
      put(x, y, (rand() - 0.5) * torsoDepth, REGION.ATMOSPHERE, 0, false);
    }
  }

  const anchor: [number, number, number] = [0, faceY, headDepth * 0.4];
  return { positions, regions, rim, coreAnchor: anchor, count };
}
