// Turning a form into particles, the way the reference does it.
//
// The obvious approach — scatter points over a surface — produces an even fog
// of dots. The reference is not that. It is forty-odd horizontal rings wrapping
// the form, bright where they cross the silhouette and nearly empty in the
// middle, so the shape is carried by its edge rather than filled in.
//
// So a form here is not a mesh. It is something that can be asked for its
// outline at a given height. Slice it, walk each outline, and the rings come
// out for free. Where the outline comes from — parametric maths, or a mesh
// sliced by a plane — is the form's own business.

export type Region = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const REGION = {
  /** On the silhouette edge. Brightest; carries the shape. */
  RIM: 0 as Region,
  /** Inside the outline. Sparse and dim, so the middle reads as hollow. */
  INTERIOR: 1 as Region,
  /** The warm energy centre — the face on a bust, the grille on a car. */
  CORE: 2 as Region,
  /** Gold streams: the throat on a bust, the spine of a tower. */
  FILAMENT: 3 as Region,
  /** Sheds upward off the top of the form and drifts away. */
  CROWN: 4 as Region,
  /** Loose motes around the form. Texture, not structure. */
  ATMOSPHERE: 5 as Region,
  /** Nested concentric arcs, like frozen ripples across the chest. */
  ARC: 6 as Region,
  /**
   * Rings that surround a form rather than belong to it. Drawn as thin lines
   * like ARC, but never measured as part of the body: they run well past it by
   * design, and fitting to them would shrink the figure to make room for its
   * own surroundings.
   */
  HALO: 7 as Region,
} as const;

export interface BandedForm {
  yMin: number;
  yMax: number;
  /**
   * The outline at height `y`, as [x, z] pairs walked around the cross-section,
   * or null where the form has no material at that height.
   *
   * `theta` runs 0..2π. Returning a closed loop is the caller's job; nothing
   * here assumes the outline is an ellipse, so a mesh slice fits the same
   * shape as a parametric one.
   */
  outlineAt(y: number, theta: number): [number, number] | null;
  /** Where this form's energy lives, so the speaking states have an anchor. */
  coreAnchor: [number, number, number];
  /** Lets a form name its own parts. Anything unclassified stays rim/interior. */
  regionAt?(x: number, y: number, z: number): Region | null;
}

export interface BandOptions {
  /** Exactly this many points come back. Never more, never fewer. */
  count: number;
  bands: number;
  seed: number;
  /**
   * How strongly points bunch toward the silhouette edge.
   *
   * Zero by default, and that is deliberate. Any bias thins the middle of each
   * half-ring — which is exactly x = 0 — and leaves a dark seam straight down
   * the centre of the figure. The edge reads bright rather than crowded, so
   * `rim` carries the emphasis and the rings stay even.
   */
  rimBias?: number;
  /** Share of points pushed inside the outline, as the dim interior. */
  interiorShare?: number;
  /** Share scattered loosely around the form. */
  atmosphereShare?: number;
  /**
   * Share spent tracing the projected silhouette as a continuous stroke.
   *
   * The single feature that separates the reference from a cloud shaped like a
   * figure: a bright unbroken line around the head, jaw, neck and shoulders.
   * Rings alone cannot draw it. A ring only touches the silhouette at two
   * points, so almost no sample lands there, and where the outline runs
   * horizontally — over the crown — no ring touches it at all.
   */
  outlineShare?: number;
  jitter?: number;
}

export interface BandedTarget {
  positions: Float32Array;
  regions: Uint8Array;
  /**
   * How squarely each particle sits on the silhouette, 0..1.
   *
   * The reference gets its luminous edge from brightness at grazing angles,
   * not from crowding particles there: the rings stay evenly dense — which is
   * what lets the face fill with contour lines — and the edge glows because
   * those particles are brighter and bloom pools around them. Emitting it here
   * lets the shader do that without knowing anything about the form.
   */
  rim: Float32Array;
  coreAnchor: [number, number, number];
  count: number;
}

/**
 * Builds a form from a profile: the half-width and half-depth at each height.
 *
 * This is how the busts are described — a head is a stack of ellipse
 * cross-sections that narrow at the jaw, pinch at the neck and flare at the
 * shoulders — and it keeps the proportions as named numbers that can be tuned
 * rather than a mesh that has to be remade.
 */
export function profileForm(
  yMin: number,
  yMax: number,
  profile: (y: number) => { halfWidth: number; halfDepth: number } | null,
  coreAnchor: [number, number, number],
  regionAt?: (x: number, y: number, z: number) => Region | null
): BandedForm {
  return {
    yMin,
    yMax,
    coreAnchor,
    regionAt,
    outlineAt(y, theta) {
      const at = profile(y);
      if (!at || at.halfWidth <= 0) return null;
      return [Math.cos(theta) * at.halfWidth, Math.sin(theta) * at.halfDepth];
    },
  };
}

/**
 * Like `profileForm`, but the cross-section can be square.
 *
 * `sharpness` is the exponent of a superellipse: 2 is an ellipse, and larger
 * values push the outline out toward its corners — around 8 reads as a
 * rectangle with the corners just softened. A tower has flat faces and
 * corners, and an elliptical slice through it reads as a pill.
 */
export function prismForm(
  yMin: number,
  yMax: number,
  profile: (y: number) => { halfWidth: number; halfDepth: number } | null,
  coreAnchor: [number, number, number],
  sharpness = 8,
  regionAt?: (x: number, y: number, z: number) => Region | null
): BandedForm {
  return {
    yMin,
    yMax,
    coreAnchor,
    regionAt,
    outlineAt(y, theta) {
      const at = profile(y);
      if (!at || at.halfWidth <= 0) return null;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      // Radius of the superellipse in this direction.
      const denom =
        Math.pow(Math.abs(c) / at.halfWidth, sharpness) +
        Math.pow(Math.abs(s) / at.halfDepth, sharpness);
      const r = denom > 0 ? Math.pow(denom, -1 / sharpness) : 0;
      return [c * r, s * r];
    },
  };
}

// Same generator the Core is built with, so a form is stable between reloads
// and a tweak to the proportions is the only thing that ever moves it.
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
 * An angle around the ring, biased toward the silhouette edges.
 *
 * Viewed head-on, a ring's outline crosses the silhouette at theta 0 and π —
 * the far left and far right of the form. Those are the points that draw the
 * shape, so that is where the particles should be. Pushing a uniform sample
 * through a power curve does it without rejection sampling.
 */
function biasedTheta(u: number, rimBias: number): number {
  // A ring crosses the silhouette exactly twice, at theta 0 and theta π. Fold
  // into halves and push each half's sample toward BOTH its ends, so density
  // gathers on those two crossings.
  //
  // Folding into quarters instead gathers at 0, π/2, π and 3π/2 — and π/2 and
  // 3π/2 are the front and back of the ring, dead centre of the form, which is
  // the one place the edge should not be bunching.
  const half = Math.floor(u * 2);
  const frac = u * 2 - half;
  const t = frac * 2 - 1; // -1..1, 0 at the middle of the half
  const bent = 0.5 + 0.5 * Math.sign(t) * Math.pow(Math.abs(t), 1 / (1 + rimBias * 2));
  return (half + bent) * Math.PI;
}

/** How much a point at this angle sits on the silhouette: 1 at the edges. */
export function rimness(theta: number): number {
  return Math.abs(Math.cos(theta));
}

/**
 * Slices `form` into rings and places exactly `count` particles on them.
 *
 * Bands get points in proportion to their outline size, so a wide shoulder ring
 * is not as sparse as the narrow crown. Without that the head looks dense and
 * the body looks like it is dissolving.
 */
export function generateBandedTarget(form: BandedForm, options: BandOptions): BandedTarget {
  const {
    count,
    bands,
    seed,
    rimBias = 0,
    interiorShare = 0.12,
    atmosphereShare = 0.08,
    outlineShare = 0,
    jitter = 0.004,
  } = options;

  const rand = mulberry(seed);
  const positions = new Float32Array(count * 3);
  const regions = new Uint8Array(count);
  const rim = new Float32Array(count);

  // Measure each band first: a band's share of the particles should follow how
  // much outline it actually has.
  const PROBE = 24;
  const bandY: number[] = [];
  const bandSize: number[] = [];
  let totalSize = 0;
  for (let b = 0; b < bands; b++) {
    const y = form.yMin + ((b + 0.5) / bands) * (form.yMax - form.yMin);
    let size = 0;
    for (let i = 0; i < PROBE; i++) {
      const pt = form.outlineAt(y, (i / PROBE) * Math.PI * 2);
      if (pt) size += Math.hypot(pt[0], pt[1]);
    }
    bandY.push(y);
    bandSize.push(size);
    totalSize += size;
  }

  const structural = Math.max(0, count - Math.round(count * atmosphereShare));
  let written = 0;

  const put = (x: number, y: number, z: number, region: Region, rimness = 0) => {
    if (written >= count) return;
    const i = written * 3;
    positions[i] = x;
    positions[i + 1] = y;
    positions[i + 2] = z;
    regions[written] = form.regionAt?.(x, y, z) ?? region;
    rim[written] = rimness;
    written++;
  };

  // The silhouette stroke, drawn first so it is never squeezed out.
  //
  // Sampled far more finely than the bands, because this is a LINE rather than
  // a stack of rings: at each height it puts a particle at each extreme of the
  // outline, and those extremes joined up are exactly the shape's profile. It
  // closes over the crown by itself, where the half-width runs down to nothing.
  const span = form.yMax - form.yMin;
  const outlineCount = Math.max(0, Math.round(count * outlineShare));
  if (outlineCount > 0) {
    const steps = Math.max(1, Math.floor(outlineCount / 2));
    for (let i = 0; i < steps && written < outlineCount; i++) {
      // Jittered within its step rather than evenly spaced, so the stroke reads
      // as particles rather than as a dotted rule.
      const y = form.yMin + ((i + rand()) / steps) * span;
      for (const theta of [0, Math.PI]) {
        const pt = form.outlineAt(y, theta);
        if (!pt) continue;
        put(
          pt[0] + (rand() - 0.5) * jitter * 0.5,
          y + (rand() - 0.5) * jitter * 0.5,
          pt[1],
          REGION.RIM,
          1
        );
      }
    }
  }

  // Whatever the stroke did not use.
  const forBands = Math.max(0, structural - written);
  for (let b = 0; b < bands && written < structural; b++) {
    if (bandSize[b] <= 0) continue;
    const share = totalSize > 0 ? bandSize[b] / totalSize : 1 / bands;
    const forThisBand = Math.max(1, Math.round(forBands * share));
    const y = bandY[b];

    for (let i = 0; i < forThisBand && written < structural; i++) {
      const theta = biasedTheta(rand(), rimBias);
      const pt = form.outlineAt(y, theta);
      if (!pt) continue;

      // A slice of each band drops inside the outline. Sparse on purpose: the
      // interior is meant to read as hollow, not filled.
      const inside = rand() < interiorShare;
      const pull = inside ? 0.25 + rand() * 0.55 : 1;

      put(
        pt[0] * pull + (rand() - 0.5) * jitter,
        y + (rand() - 0.5) * jitter,
        pt[1] * pull + (rand() - 0.5) * jitter,
        inside ? REGION.INTERIOR : REGION.RIM,
        inside ? 0 : rimness(theta)
      );
    }
  }

  // Whatever is left becomes atmosphere, plus any shortfall from bands that
  // returned no outline — the count is a promise, so it gets filled either way.
  while (written < count) {
    const y = form.yMin + rand() * span;
    const theta = rand() * Math.PI * 2;
    const pt = form.outlineAt(y, theta);
    const reach = 1.15 + rand() * 0.75;
    if (pt) {
      put(pt[0] * reach, y + (rand() - 0.5) * span * 0.06, pt[1] * reach, REGION.ATMOSPHERE);
    } else {
      const r = 0.35 + rand() * 0.5;
      put(Math.cos(theta) * r, y, Math.sin(theta) * r, REGION.ATMOSPHERE);
    }
  }

  return { positions, regions, rim, coreAnchor: form.coreAnchor, count };
}

/**
 * Scales and centres a target so it sits where the camera is already looking.
 *
 * Forms are authored in their own units — the busts run 0..1 tall, because
 * head-heights are the readable way to describe a figure — and the Core lives
 * at a very different scale. Fitting here keeps that separation: a form
 * describes proportion, this decides how big it appears.
 *
 * `height` is a ceiling, not a promise: a wide form is scaled down to stay
 * inside `maxWidth` and simply ends up shorter.
 */
export function fitTarget(
  target: BandedTarget,
  height: number,
  centreY = 0,
  maxWidth = Infinity
): BandedTarget {
  let minY = Infinity;
  let maxY = -Infinity;
  let halfWidth = 0;
  let sumX = 0;
  let sumZ = 0;
  // The drifting atmosphere reaches well past the form, so the fit is measured
  // on the structure only — otherwise the figure shrinks to make room for haze.
  let structural = 0;
  for (let i = 0; i < target.count; i++) {
    if (target.regions[i] === REGION.ATMOSPHERE || target.regions[i] === REGION.HALO) continue;
    const y = target.positions[i * 3 + 1];
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    sumX += target.positions[i * 3];
    sumZ += target.positions[i * 3 + 2];
    structural++;
  }
  if (structural === 0 || maxY <= minY) return target;

  const midX = sumX / structural;
  const midY = (minY + maxY) / 2;
  const midZ = sumZ / structural;

  // Measured about the centre the form is ABOUT to be moved to, not about the
  // origin. Sampling is never perfectly symmetric, so measuring first and
  // centring after lets the widest point drift past the box by that difference.
  for (let i = 0; i < target.count; i++) {
    if (target.regions[i] === REGION.ATMOSPHERE || target.regions[i] === REGION.HALO) continue;
    halfWidth = Math.max(halfWidth, Math.abs(target.positions[i * 3] - midX));
  }

  // Fit inside the box, not just to the height. A broad-shouldered figure is
  // wider than it is tall in a portrait viewport, and fitting height alone runs
  // the shoulders straight off the sides.
  const scale = Math.min(
    height / (maxY - minY),
    halfWidth > 0 ? maxWidth / 2 / halfWidth : Infinity
  );

  const positions = new Float32Array(target.positions.length);
  for (let i = 0; i < target.count; i++) {
    positions[i * 3] = (target.positions[i * 3] - midX) * scale;
    positions[i * 3 + 1] = (target.positions[i * 3 + 1] - midY) * scale + centreY;
    positions[i * 3 + 2] = (target.positions[i * 3 + 2] - midZ) * scale;
  }
  const [ax, ay, az] = target.coreAnchor;
  return {
    ...target,
    positions,
    coreAnchor: [(ax - midX) * scale, (ay - midY) * scale + centreY, (az - midZ) * scale],
  };
}

/**
 * Reorders a target so each particle travels to somewhere near where it
 * already is, rather than across the whole figure.
 *
 * With an arbitrary mapping the transition is technically correct and looks
 * like static: forty thousand particles crossing each other reads as noise, not
 * as matter reorganising. Pairing both sets by the angle they sit at around the
 * centre keeps left on the left and top on the top, so the mass appears to fold
 * into the new shape.
 *
 * Angle rather than nearest-neighbour on purpose: a true assignment is O(n²),
 * and between a galaxy and a bust there is no meaningful nearest point anyway.
 * What the eye reads is that nothing crossed the frame.
 */
/**
 * Rewrites a target to a different number of points.
 *
 * Baked forms hold one point per particle of a full-density core, but a phone
 * builds roughly half as many. Without this the counts disagree and the form is
 * rejected, so the cars simply never appear on mobile.
 *
 * Sampled at a stride rather than by taking a prefix: the baked points are
 * ordered band by band, so a prefix would be the bottom of the form and nothing
 * else. A stride keeps the whole shape and thins it evenly.
 */
export function resampleTarget(target: BandedTarget, count: number): BandedTarget {
  if (count === target.count) return target;

  const positions = new Float32Array(count * 3);
  const regions = new Uint8Array(count);
  const rim = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // Wraps when asked for more points than were baked, which duplicates a few
    // rather than leaving holes. Under-sampling is the case that actually
    // happens; over-sampling is here so the function has no bad input.
    const from = Math.floor((i * target.count) / count) % target.count;
    positions[i * 3] = target.positions[from * 3];
    positions[i * 3 + 1] = target.positions[from * 3 + 1];
    positions[i * 3 + 2] = target.positions[from * 3 + 2];
    regions[i] = target.regions[from];
    rim[i] = target.rim[from];
  }
  return { ...target, positions, regions, rim, count };
}

export function alignToReference(target: BandedTarget, reference: Float32Array): BandedTarget {
  const n = target.count;
  if (reference.length !== n * 3) return target;

  // Angles are computed once and then sorted, rather than being computed inside
  // the comparator. A sort asks for the key O(n log n) times, so the comparator
  // form ran about seventeen atan2 calls per particle instead of one, and this
  // is on the path every form load takes.
  const byAngle = (arr: Float32Array) => {
    const angle = new Float64Array(n);
    for (let i = 0; i < n; i++) angle[i] = Math.atan2(arr[i * 3 + 1], arr[i * 3]);
    const order = Array.from({ length: n }, (_, i) => i);
    order.sort((a, b) => angle[a] - angle[b]);
    return order;
  };

  const refOrder = byAngle(reference);
  const tgtOrder = byAngle(target.positions);

  const positions = new Float32Array(n * 3);
  const regions = new Uint8Array(n);
  const rim = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const to = refOrder[k];
    const from = tgtOrder[k];
    positions[to * 3] = target.positions[from * 3];
    positions[to * 3 + 1] = target.positions[from * 3 + 1];
    positions[to * 3 + 2] = target.positions[from * 3 + 2];
    regions[to] = target.regions[from];
    rim[to] = target.rim[from];
  }
  return { ...target, positions, regions, rim };
}
