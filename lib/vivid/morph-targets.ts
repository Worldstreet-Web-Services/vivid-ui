// The forms the Core can take.
//
// Every form is the SAME particles in different places, never a second object
// faded in over the first. A target is just a destination position per
// particle, in the same order as the constellation's own positions, so
// particle 173 is particle 173 in every form.
//
// The constellation is registered here as `constellation`, and its destination
// is where each particle already lives. Morphing to it is therefore a no-op by
// construction rather than by a special case in the shader.

export const CONSTELLATION = "constellation";

export interface MorphTarget {
  name: string;
  /** count * 3, matching the particle order the geometry was built with. */
  positions: Float32Array;
  /** Which part of the form each particle belongs to. See REGION in ./bands. */
  regions: Uint8Array;
  /** How squarely each particle sits on the silhouette, 0..1. */
  rim: Float32Array;
  /**
   * Where this form's energy lives, so the speaking/listening states have
   * somewhere to anchor on a form with no face. Null falls back to the origin,
   * which is right for the constellation: its energy is its centre.
   */
  coreAnchor: [number, number, number] | null;
  /**
   * How far the form's energy reaches from its anchor.
   *
   * Derived from the form's own size rather than fixed, so a gold bar's core
   * does not glow at the scale of a skyscraper's.
   */
  coreRadius: number;
}

const targets = new Map<string, MorphTarget>();

/** Rough size of a form, used to scale its energy when none is given. */
function extentOf(positions: Float32Array): number {
  let max = 0;
  for (let i = 0; i < positions.length; i += 3) {
    max = Math.max(max, Math.hypot(positions[i], positions[i + 1], positions[i + 2]));
  }
  return max;
}

/**
 * Registers a form. `positions` must hold exactly one xyz per particle, in the
 * geometry's own order — a target of a different length would silently morph
 * the wrong particles, so it is rejected rather than trusted.
 */
export function registerTarget(
  name: string,
  positions: Float32Array,
  particleCount: number,
  coreAnchor: [number, number, number] | null = null,
  regions?: Uint8Array,
  rim?: Float32Array,
  coreRadius?: number
): void {
  if (positions.length !== particleCount * 3) {
    throw new Error(
      `Morph target "${name}" has ${positions.length / 3} points; the Core has ${particleCount}.`
    );
  }
  targets.set(name, {
    name,
    positions,
    // A form with no parts named is all rim, which is the honest default: the
    // constellation has no face or throat to light differently.
    regions: regions ?? new Uint8Array(particleCount),
    rim: rim ?? new Float32Array(particleCount),
    coreAnchor,
    coreRadius: coreRadius ?? extentOf(positions) * 0.22,
  });
}

export function getTarget(name: string): MorphTarget | undefined {
  return targets.get(name);
}

export function targetNames(): string[] {
  return [...targets.keys()];
}

// Exported for the tests and for a hot reload, which would otherwise register
// the same names onto a stale particle count.
export function clearTargets(): void {
  targets.clear();
}
