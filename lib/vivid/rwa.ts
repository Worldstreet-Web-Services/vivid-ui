// The building: a stepped office tower.
//
// Built in code rather than traced. A tower is a few dimensions, and a
// parametric one is exact, tunable and free of the wobble a photograph brings
// to a shape whose whole character is that its faces are flat and its corners
// are square. The setbacks are what make it read as a building rather than a
// column: a plain extruded box at this scale looks like a domino.

import { REGION, prismForm, type BandedForm, type Region } from "@/lib/vivid/bands";

export interface TowerProportions {
  /** Width at the base, as a share of height. */
  baseWidth: number;
  /** Depth at the base, relative to its width. Never square, or it reads flat. */
  depthRatio: number;
  /** Where the tower steps in, bottom-up, and how much it keeps at each step. */
  setbacks: { at: number; keep: number }[];
  /** Height of the mast above the last setback. */
  crownHeight: number;
  crownWidth: number;
}

export const TOWER: TowerProportions = {
  baseWidth: 0.3,
  depthRatio: 0.72,
  setbacks: [
    { at: 0.42, keep: 0.82 },
    { at: 0.68, keep: 0.66 },
    { at: 0.86, keep: 0.48 },
  ],
  crownHeight: 0.07,
  crownWidth: 0.1,
};

export function towerForm(p: TowerProportions = TOWER): BandedForm {
  const topOfShaft = 1 - p.crownHeight;
  // Lit from the middle floors: the point of a tower is that it is occupied.
  const coreY = 0.52;

  const widthAt = (y: number): number => {
    let keep = 1;
    for (const step of p.setbacks) {
      if (y >= step.at) keep = step.keep;
    }
    return p.baseWidth * keep;
  };

  const region = (x: number, y: number, z: number): Region | null => {
    // A band of lit floors around the middle. All the way around, unlike the
    // bust's face: a lit storey does not stop at the corner of the building.
    if (y > coreY - 0.1 && y < coreY + 0.1) return REGION.CORE;
    // The service spine, running the full height of the tower's centre.
    if (Math.abs(x) < p.baseWidth * 0.08 && z > 0 && y < topOfShaft) return REGION.FILAMENT;
    if (y > topOfShaft) return REGION.CROWN;
    return null;
  };

  return prismForm(
    0,
    1,
    (y) => {
      if (y > 1) return null;
      if (y > topOfShaft) {
        // The mast tapers to a point rather than stopping flat.
        const t = (y - topOfShaft) / p.crownHeight;
        const w = (p.crownWidth * p.baseWidth * (1 - t * 0.75)) / 2;
        return { halfWidth: w, halfDepth: w * p.depthRatio };
      }
      const w = widthAt(y) / 2;
      return { halfWidth: w, halfDepth: w * p.depthRatio };
    },
    [0, coreY, 0.04],
    // A tower's corners are the crispest thing about it.
    10,
    region
  );
}
