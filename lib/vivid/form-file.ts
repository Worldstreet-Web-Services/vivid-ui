// Reading a baked form back.
//
// The counterpart to scripts/bake-forms.ts. Positions arrive delta-encoded as
// 16-bit fixed point and are unpacked in one pass.

import { REGION, type BandedTarget, type Region } from "@/lib/vivid/bands";

const MAGIC = 0x4d524656; // "VFRM" little-endian
const VERSION = 3;
const HEADER = 16;
const ANCHOR = 12;

export function decodeForm(bytes: ArrayBuffer): BandedTarget {
  const view = new DataView(bytes);
  if (view.getUint32(0, true) !== MAGIC) throw new Error("Not a baked form");
  const version = view.getUint32(4, true);
  if (version !== VERSION) {
    // Refuse rather than misread: an older file would decode to a shape that is
    // subtly wrong, which is far harder to spot than a failure to load.
    throw new Error(`Form is version ${version}; this build reads ${VERSION}`);
  }
  const count = view.getUint32(8, true);
  const extent = view.getFloat32(12, true);
  const scale = extent / 32767;

  const coreAnchor: [number, number, number] = [
    view.getFloat32(HEADER, true),
    view.getFloat32(HEADER + 4, true),
    view.getFloat32(HEADER + 8, true),
  ];

  const positions = new Float32Array(count * 3);
  const rim = new Float32Array(count);
  const regions = new Uint8Array(count);

  let at = HEADER + ANCHOR;
  const running = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    for (let a = 0; a < 3; a++) {
      // Wraps the same way the encoder does, so the sum reconstructs exactly.
      running[a] = ((running[a] + view.getInt16(at, true)) << 16) >> 16;
      positions[i * 3 + a] = running[a] * scale;
      at += 2;
    }
  }
  for (let i = 0; i < count; i++) regions[i] = view.getUint8(at + i) as Region;
  at += count;
  // How squarely each particle sits on the silhouette. Stored rather than
  // derived: on a traced form this is the distance to the outline, which the
  // position alone does not carry.
  for (let i = 0; i < count; i++) rim[i] = view.getUint8(at + i) / 255;

  return { positions, regions, rim, coreAnchor, count };
}

/** True when a decoded form still names its parts, as a sanity check on a file. */
export function namesItsParts(target: BandedTarget): boolean {
  for (const r of target.regions) {
    if (r !== REGION.RIM) return true;
  }
  return false;
}
