// The busts.
//
// Everything is measured in head-heights (HH), crown to chin, which is how
// figure proportion is actually reasoned about — and it means the difference
// between the two figures is a handful of named numbers rather than two
// separate shapes that have to be kept in sympathy by hand.
//
// Femininity here comes only from silhouette and proportion. There are no
// facial features, no separate palette, nothing anatomical beyond the outline.
// The two strongest cues, in order, are neck length and shoulder span.

import { REGION, profileForm, type BandedForm, type Region } from "@/lib/vivid/bands";

export interface BustProportions {
  /** Width at the cheekbones — the widest part of the head. */
  headWidth: number;
  /** Width at the jaw angle. */
  jawWidth: number;
  /** Width at the chin. */
  chinWidth: number;
  /** How deep the head is, front to back, as a share of its width. */
  headDepth: number;
  /** How far the ears stand out past the cheekbones. */
  earBulge: number;
  /** Chin to the pit of the throat. The strongest femininity cue. */
  neckLength: number;
  neckWidth: number;
  /** Point to point across the shoulders. The second strongest cue. */
  shoulderSpan: number;
  /** Degrees below horizontal. Never square. */
  shoulderSlope: number;
  /** How far the torso continues below the shoulders before it is cut off. */
  torsoDrop: number;
}

// Measured off a frame of AIApex1.mp4 rather than estimated: the head there is
// 370px tall and 320 wide, the neck 200 across, the chin 165, and the shoulders
// are still widening when the frame cuts them off. An earlier read of these had
// the neck at 0.3 and the chin at 0.26, which is what made the figure read as a
// goblet: a narrow stem under a ball.
export const FEMALE: BustProportions = {
  headWidth: 0.84,
  jawWidth: 0.64,
  chinWidth: 0.44,
  headDepth: 0.84,
  earBulge: 0.032,
  neckLength: 0.32,
  // Just over half a head across. A neck reads as a neck by being thick enough
  // to carry the head; the femininity is in its LENGTH, not in pinching it.
  neckWidth: 0.52,
  // Runs past the bottom of the frame, as it does in the reference. Fitting the
  // whole span on screen is what turned the shoulders into a bell.
  shoulderSpan: 2.4,
  shoulderSlope: 20,
  torsoDrop: 0.72,
};

export const MALE: BustProportions = {
  headWidth: 0.88,
  jawWidth: 0.78,
  chinWidth: 0.58,
  headDepth: 0.88,
  earBulge: 0.036,
  neckLength: 0.22,
  neckWidth: 0.64,
  shoulderSpan: 2.95,
  shoulderSlope: 10,
  torsoDrop: 0.78,
};

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * The head outline, from chin to crown.
 *
 * An egg standing on its narrow end, widest at the cheekbones a little under
 * halfway up, with a broad rounded chin below and a dome over the top. The
 * landmarks are the measured ones: chin, jaw angle, cheekbone, then the curve
 * of the cranium.
 */
function headHalfWidth(t: number, p: BustProportions): number {
  const chin = p.chinWidth / 2;
  const jaw = p.jawWidth / 2;
  const cheek = p.headWidth / 2;

  let half: number;
  if (t < 0.18) {
    // Chin up to the jaw angle. Rounded, not pointed: a chin that comes to a
    // point puts the head on a stem.
    half = chin + (jaw - chin) * smooth(t / 0.18);
  } else if (t < 0.45) {
    half = jaw + (cheek - jaw) * smooth((t - 0.18) / 0.27);
  } else {
    // The cranium: a superellipse from the cheekbones over the crown. It holds
    // near full width most of the way up and then turns over hard, which is
    // what makes a dome. A cosine across the same span narrows steadily from
    // the cheekbones instead, and the head comes out as a kite.
    const u = (t - 0.45) / 0.55;
    half = cheek * Math.pow(Math.max(0, 1 - Math.pow(u, 2.6)), 0.5);
  }

  // The ears, as a bump either side at cheekbone height. With an elliptical
  // cross-section this widens the whole ring rather than adding two lobes, but
  // that widening is what the eye reads as ears on a silhouette.
  const ear = Math.exp(-Math.pow((t - 0.47) / 0.1, 2)) * p.earBulge;
  return half + ear;
}

/**
 * A frontal bust, as a stack of ellipse cross-sections.
 *
 * Heights run bottom-up in head-heights and are normalised at the end, so the
 * proportions above stay readable as anatomy.
 */
export function bustForm(p: BustProportions): BandedForm {
  const headTop = p.neckLength + p.torsoDrop + 1;
  const chinY = p.neckLength + p.torsoDrop;
  const throatY = p.torsoDrop;
  const total = headTop;

  // Normalised landmarks, so the form spans 0..1 whatever the proportions.
  const n = (v: number) => v / total;
  const nChin = n(chinY);
  const nThroat = n(throatY);
  const nHeadSpan = n(1);
  const nNeck = n(p.neckLength);

  // The face sits low on the head, centred a little above the jaw.
  const coreY = nChin + nHeadSpan * 0.38;
  // Measured off the reference: the amber oval is about 0.72 of the head across
  // and 0.49 of it tall. Wider than that and it stops reading as a face and
  // starts reading as the whole head being lit from inside.
  const faceHalfW = n(p.headWidth * 0.36);
  const faceHalfH = nHeadSpan * 0.245;

  const region = (x: number, y: number, z: number): Region | null => {
    // The warm centre: an oval on the face, front-facing only. The back of the
    // head stays cool, so the glow reads as a face rather than a lantern.
    if (z > 0) {
      const dx = x / faceHalfW;
      const dy = (y - coreY) / faceHalfH;
      if (dx * dx + dy * dy < 1) return REGION.CORE;
    }
    // Gold streams down the throat and over the sternum. A few thin strands
    // that branch as they fall, not a band across the whole throat — filling
    // the neck with gold reads as a lit throat rather than filaments running
    // through it.
    if (z > 0 && y < nChin && y > nThroat - n(0.3)) {
      const fall = (nChin - y) / (nChin - nThroat + n(0.3));
      // They spread apart on the way down, like roots over the sternum.
      const spread = n(p.neckWidth * 0.16) + fall * fall * n(0.5);
      const strand = Math.abs((Math.abs(x) % spread) - spread * 0.5);
      if (strand < n(0.012)) return REGION.FILAMENT;
    }
    // A thin cap at the very top of the skull, which the shader drifts upward.
    // In the reference this is a faint shedding of particles off the crown, not
    // a mass: tagging the whole cranium put what looked like a hat on her.
    if (y > nChin + nHeadSpan * 0.93) return REGION.CROWN;

    // Nested arcs across the chest, radiating from the pit of the throat like
    // ripples that stopped. Quantising the distance from that point into rings
    // is what makes them concentric rather than just more horizontal bands.
    if (y < nThroat) {
      const r = Math.hypot(x, (y - nThroat) * 1.35);
      const spacing = n(0.085);
      const phase = Math.abs((r % spacing) - spacing * 0.5);
      if (r > n(0.12) && phase < n(0.014)) return REGION.ARC;
    }
    return null;
  };

  return profileForm(
    0,
    1,
    (y) => {
      if (y > 1) return null;

      // ---- head ----
      if (y >= nChin) {
        const t = Math.min(1, (y - nChin) / nHeadSpan);
        const hw = headHalfWidth(t, p) / total;
        return { halfWidth: hw, halfDepth: hw * p.headDepth };
      }

      // ---- neck ---- tapers slightly upward, so it reads as carrying the head
      if (y >= nThroat) {
        const t = (y - nThroat) / nNeck;
        const hw = (p.neckWidth / 2 / total) * (1 - t * 0.1);
        // Blended into the jaw over the top of the neck. The chin is narrower
        // than the neck, so a straight handover steps outward at the jawline
        // and cuts a notch across the throat.
        const jawBlend = smooth(Math.max(0, (t - 0.72) / 0.28));
        const chinHalf = headHalfWidth(0, p) / total;
        const blended = hw + (chinHalf - hw) * jawBlend;
        return { halfWidth: blended, halfDepth: blended * 0.92 };
      }

      // ---- shoulders and torso ----
      // Drop below the throat, expressed as a share of the fall to the cut-off.
      const t = (nThroat - y) / nThroat;
      // The shoulder line is a curve, not a step, and it never turns back in.
      // The reference widens the whole way down and is simply cut off by the
      // frame; drawing a waist under it is what closed the silhouette into an
      // hourglass standing on a point.
      // Fast off the neck, then easing as it falls: the trapezius sweeps out
      // near the throat and the outer shoulder flattens below it. A symmetric
      // ease instead spends its whole middle at a constant angle, which draws
      // the shoulder as a straight diagonal to the corner of the frame.
      const spread = Math.pow(Math.min(1, t), 0.6);
      // Slope drops the outer edge as it travels, so the shoulder falls away
      // rather than sitting level.
      const drop = Math.tan((p.shoulderSlope * Math.PI) / 180) * spread * 0.16;
      const half =
        (p.neckWidth / 2 + (p.shoulderSpan / 2 - p.neckWidth / 2) * spread) / total - drop;
      return { halfWidth: Math.max(0, half), halfDepth: Math.max(0, half) * 0.34 };
    },
    [0, coreY, 0.02],
    region
  );
}
