// A mesh's silhouette, as a mask.
//
// The cars are the real product, so their outline should come from the model
// rather than from a photograph of somebody else's car. Rasterising the vertices
// from the side gives exactly that: the same tracing pipeline the photographs
// go through, with a source that is already perfect.
//
// Vertices are splatted rather than triangles filled, because the position
// reader deliberately ignores indices. At tens of thousands of vertices over a
// few hundred pixels the splats overlap into a solid shape, and the closing
// pass below seals whatever is left.

import type { Mask } from "@/lib/vivid/mask-form";

export interface MeshMaskOptions {
  /** Longest side of the mask, in pixels. More is sharper and slower. */
  resolution?: number;
  /** Splat radius in pixels. Enough to close the gaps between vertices. */
  radius?: number;
  /** Which axis points at the viewer: the silhouette is taken looking down it. */
  viewAxis?: "x" | "y" | "z";
}

/**
 * Projects `positions` down the view axis and rasterises the result.
 *
 * The cars are longest along x and stand on y, so the side view — the one that
 * makes a car recognisable — looks down z.
 */
export function maskFromMesh(positions: Float32Array, options: MeshMaskOptions = {}): Mask {
  const { resolution = 460, radius = 3, viewAxis = "z" } = options;

  // Which components become the mask's across and up.
  const across = viewAxis === "x" ? 2 : 0;
  const up = viewAxis === "y" ? 2 : 1;

  let minA = Infinity;
  let maxA = -Infinity;
  let minU = Infinity;
  let maxU = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const a = positions[i + across];
    const u = positions[i + up];
    if (a < minA) minA = a;
    if (a > maxA) maxA = a;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
  }
  const spanA = maxA - minA || 1;
  const spanU = maxU - minU || 1;

  const pad = radius + 2;
  const scale = (resolution - pad * 2) / Math.max(spanA, spanU);
  const width = Math.max(1, Math.round(spanA * scale) + pad * 2);
  const height = Math.max(1, Math.round(spanU * scale) + pad * 2);
  const on = new Uint8Array(width * height);

  const r2 = radius * radius;
  for (let i = 0; i < positions.length; i += 3) {
    const cx = pad + (positions[i + across] - minA) * scale;
    // Image y runs downward, so the top of the mesh is row zero.
    const cy = pad + (maxU - positions[i + up]) * scale;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(height - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) on[y * width + x] = 1;
      }
    }
  }

  return { width, height, on };
}

/**
 * Closes pinholes left between splats.
 *
 * A dilate followed by an erode: the dilate seals gaps up to twice the radius,
 * and the erode puts the outline back where it was. Doing only the dilate would
 * fatten the whole silhouette, which on a car shows up as the roof pillars
 * merging with the windows.
 */
export function closeGaps(mask: Mask, radius = 2): Mask {
  const grown = morph(mask, radius, true);
  return morph(grown, radius, false);
}

function morph(mask: Mask, radius: number, grow: boolean): Mask {
  const { width, height, on } = mask;
  const out = new Uint8Array(width * height);
  const r2 = radius * radius;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = false;
      for (let dy = -radius; dy <= radius && !hit; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const nx = x + dx;
          const ny = y + dy;
          // Outside the frame counts as background either way.
          const v = nx < 0 || ny < 0 || nx >= width || ny >= height ? 0 : on[ny * width + nx];
          if (grow ? v === 1 : v === 0) {
            hit = true;
            break;
          }
        }
      }
      out[y * width + x] = grow ? (hit ? 1 : 0) : hit ? 0 : 1;
    }
  }
  return { width, height, on: out };
}
