// Reading vertex positions out of a .glb, and nothing else.
//
// A full loader would pull in materials, textures, animations and a DOM to hang
// them on. All that is wanted here is where the surface is: the forms are baked
// offline and only the resulting point cloud ever ships, so the mesh never
// reaches a browser and never needs a renderer to read it.

interface Accessor {
  bufferView: number;
  componentType: number;
  count: number;
  type: string;
  byteOffset?: number;
}

interface BufferView {
  buffer: number;
  byteLength: number;
  byteOffset?: number;
  byteStride?: number;
}

interface Node {
  mesh?: number;
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  children?: number[];
}

interface Gltf {
  accessors: Accessor[];
  bufferViews: BufferView[];
  meshes: { primitives: { attributes: Record<string, number> }[] }[];
  nodes?: Node[];
  scenes?: { nodes: number[] }[];
  scene?: number;
}

const FLOAT = 5126;

function identity(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function multiply(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

/** Column-major, as glTF stores it. */
function fromTrs(node: Node): number[] {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const x2 = qx + qx,
    y2 = qy + qy,
    z2 = qz + qz;
  const xx = qx * x2,
    xy = qx * y2,
    xz = qx * z2;
  const yy = qy * y2,
    yz = qy * z2,
    zz = qz * z2;
  const wx = qw * x2,
    wy = qw * y2,
    wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function apply(m: number[], x: number, y: number, z: number): [number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/**
 * Every POSITION in the file, in world space.
 *
 * Node transforms are applied because a scene that places its mesh with a
 * translation would otherwise measure as though it sat at the origin, and the
 * form would come out lopsided.
 */
export function glbPositions(file: ArrayBuffer): Float32Array {
  const view = new DataView(file);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("Not a .glb file");

  const jsonLength = view.getUint32(12, true);
  const json: Gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(file, 20, jsonLength)));

  // The binary chunk follows the JSON chunk, each with an 8-byte header.
  const binStart = 20 + jsonLength + 8;
  return positionsFrom(json, new Uint8Array(file, binStart));
}


function positionsFrom(json: Gltf, bin: Uint8Array): Float32Array {
  const worldOf = new Map<number, number[]>();
  const walk = (index: number, parent: number[]) => {
    const node = json.nodes?.[index];
    if (!node) return;
    const world = multiply(parent, fromTrs(node));
    if (node.mesh !== undefined) worldOf.set(node.mesh, world);
    for (const child of node.children ?? []) walk(child, world);
  };
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? json.nodes?.map((_, i) => i) ?? [];
  for (const root of roots) walk(root, identity());

  const out: number[] = [];
  json.meshes.forEach((mesh, meshIndex) => {
    const world = worldOf.get(meshIndex) ?? identity();
    for (const primitive of mesh.primitives) {
      const accessorIndex = primitive.attributes.POSITION;
      if (accessorIndex === undefined) continue;
      const accessor = json.accessors[accessorIndex];
      if (accessor.componentType !== FLOAT || accessor.type !== "VEC3") {
        throw new Error(`POSITION must be float VEC3; got ${accessor.type}/${accessor.componentType}`);
      }
      const bufferView = json.bufferViews[accessor.bufferView];
      const stride = bufferView.byteStride ?? 12;
      const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      for (let i = 0; i < accessor.count; i++) {
        const at = base + i * stride;
        const x = new DataView(bin.buffer, bin.byteOffset + at, 12);
        const [wx, wy, wz] = apply(world, x.getFloat32(0, true), x.getFloat32(4, true), x.getFloat32(8, true));
        out.push(wx, wy, wz);
      }
    }
  });
  return Float32Array.from(out);
}
