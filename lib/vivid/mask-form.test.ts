import { describe, expect, it } from "vitest";
import { REGION } from "@/lib/vivid/bands";
import {
  distanceToEdge,
  edgePixels,
  fillHoles,
  subjectBounds,
  targetFromMask,
  type Mask,
} from "@/lib/vivid/mask-form";

/** Builds a mask from rows of text: `#` is subject, anything else is not. */
function draw(rows: string[]): Mask {
  const height = rows.length;
  const width = rows[0].length;
  const on = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) on[y * width + x] = row[x] === "#" ? 1 : 0;
  });
  return { width, height, on };
}

function show(mask: Mask): string[] {
  const rows: string[] = [];
  for (let y = 0; y < mask.height; y++) {
    let row = "";
    for (let x = 0; x < mask.width; x++) row += mask.on[y * mask.width + x] ? "#" : ".";
    rows.push(row);
  }
  return rows;
}

describe("fillHoles", () => {
  it("fills a pocket the outside cannot reach", () => {
    // A pinhole where the model had no vertices. Left alone it punches a hole
    // straight through the silhouette.
    const filled = fillHoles(draw([
      "#####",
      "##.##",
      "#####",
    ]));
    expect(show(filled)).toEqual(["#####", "#####", "#####"]);
  });

  it("leaves a gap that opens to the edge of the frame", () => {
    // The single most important case. The space under a car between its wheels,
    // and the space between a router's two antennas, both open downward or
    // upward out of the frame. Filling them turns the car into a brick.
    const filled = fillHoles(draw([
      "##.##",
      "##.##",
      "##.##",
    ]));
    expect(show(filled)).toEqual(["##.##", "##.##", "##.##"]);
  });

  it("leaves a mask with no holes exactly as it was", () => {
    const rows = ["..##..", ".####.", "######"];
    expect(show(fillHoles(draw(rows)))).toEqual(rows);
  });
});

describe("distanceToEdge", () => {
  it("is zero off the subject and grows inward", () => {
    const mask = draw([
      "#####",
      "#####",
      "#####",
      "#####",
      "#####",
    ]);
    const d = distanceToEdge(mask);
    // The border of the subject touches the frame, which counts as outside.
    expect(d[0]).toBeCloseTo(1, 5);
    expect(d[2 * 5 + 2]).toBeGreaterThan(d[1 * 5 + 1]);
  });

  it("gives background pixels no distance at all", () => {
    const mask = draw(["..#..", "..#.."]);
    const d = distanceToEdge(mask);
    expect(d[0]).toBe(0);
    expect(d[2]).toBeGreaterThan(0);
  });
});

describe("edgePixels", () => {
  it("finds the outline and not the inside", () => {
    const mask = draw([
      ".###.",
      ".###.",
      ".###.",
    ]);
    const edge = new Set(edgePixels(mask));
    // The middle of the middle row is enclosed on all four sides.
    expect(edge.has(1 * 5 + 2)).toBe(false);
    expect(edge.has(1 * 5 + 1)).toBe(true);
    expect(edge.has(0 * 5 + 2)).toBe(true);
  });
});

describe("subjectBounds", () => {
  it("measures the subject, not the frame", () => {
    const box = subjectBounds(draw([
      ".....",
      "..##.",
      "..##.",
      ".....",
    ]));
    expect(box).toMatchObject({ minX: 2, maxX: 3, minY: 1, maxY: 2, width: 2, height: 2 });
  });
});

describe("targetFromMask", () => {
  const car = draw([
    "..........",
    "..######..",
    ".########.",
    "##########",
    "##########",
    ".##....##.",
    ".##....##.",
  ]);

  it("places exactly the number of particles asked for", () => {
    // The count is a promise: a target of the wrong length is refused outright
    // by the registry, so it has to come out exact however the runs divided up.
    for (const count of [500, 4096, 10_000]) {
      expect(targetFromMask(car, { count, seed: 7 }).count).toBe(count);
    }
  });

  it("stands the subject exactly 1 tall and centres it", () => {
    const t = targetFromMask(car, { count: 8000, seed: 7, atmosphereShare: 0 });
    let lo = Infinity;
    let hi = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    for (let i = 0; i < t.count; i++) {
      lo = Math.min(lo, t.positions[i * 3 + 1]);
      hi = Math.max(hi, t.positions[i * 3 + 1]);
      left = Math.min(left, t.positions[i * 3]);
      right = Math.max(right, t.positions[i * 3]);
    }
    expect(hi - lo).toBeCloseTo(1, 1);
    expect(left + right).toBeCloseTo(0, 1);
  });

  it("keeps the gap under the subject open", () => {
    // The reason for tracing the shape instead of measuring a width per height.
    // The bottom rows here are two wheels with air between them, and a form
    // described by one width per row cannot express that at all.
    const t = targetFromMask(car, { count: 20_000, seed: 7, atmosphereShare: 0, depth: 0 });
    let betweenWheels = 0;
    for (let i = 0; i < t.count; i++) {
      const y = t.positions[i * 3 + 1];
      const x = t.positions[i * 3];
      // The bottom two rows, near the middle: air in the source.
      if (y < 0.2 && Math.abs(x) < 0.1) betweenWheels++;
    }
    expect(betweenWheels).toBe(0);
  });

  it("puts the brightest particles on the outline", () => {
    const t = targetFromMask(car, { count: 20_000, seed: 7 });
    let edge = 0;
    for (let i = 0; i < t.count; i++) {
      if (t.regions[i] === REGION.RIM) {
        // The stroke is the silhouette itself, so it is fully edge-on.
        expect(t.rim[i]).toBeCloseTo(1, 5);
        edge++;
      }
    }
    expect(edge).toBeGreaterThan(0);
    expect(t.rim.every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it("swells front to back, deepest where the subject is thickest", () => {
    // A traced picture is flat. Left flat, the figure collapses to a line as
    // the view turns and the parallax has nothing to work with.
    const t = targetFromMask(car, { count: 20_000, seed: 7, depth: 0.4, atmosphereShare: 0 });
    let deepest = 0;
    for (let i = 0; i < t.count; i++) deepest = Math.max(deepest, Math.abs(t.positions[i * 3 + 2]));
    expect(deepest).toBeGreaterThan(0.15);
    expect(deepest).toBeLessThanOrEqual(0.42);

    // On the outline, front and back meet, so there is no depth there.
    for (let i = 0; i < t.count; i++) {
      if (t.regions[i] === REGION.RIM) expect(Math.abs(t.positions[i * 3 + 2])).toBeLessThan(0.01);
    }
  });

  it("is the same every time for the same mask and seed", () => {
    const a = targetFromMask(car, { count: 3000, seed: 42 });
    const b = targetFromMask(car, { count: 3000, seed: 42 });
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  });

  it("refuses a mask with nothing in it", () => {
    expect(() => targetFromMask(draw(["...", "..."]), { count: 10, seed: 1 })).toThrow(
      /no subject/
    );
  });
});
