// The Core: a living galaxy seen face-on. Particles orbit the camera axis, so
// the swirl reads directly; a hollow centre leaves a dark event horizon, and an
// amber corona rings the whole mass.
//
// aOrbit packs the orbital frame: (rho, angle, z, speed) where rho and z are
// preserved under rotation about Z and only the angle advances.
//
// aType: 0 galaxy · 1 corona · 2 star · 3 ember · 4 horizon ring · 5 blade

interface CoreAttributes {
  position: Float32Array;
  orbit: Float32Array;
  seed: Float32Array;
  tint: Float32Array;
  type: Float32Array;
  count: number;
}

function mulberry(seedNum: number) {
  let a = seedNum >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Colour arrives in patches, never as confetti: the reference shows regions of
// magenta, jade and violet that hold together as they turn.
function patch(x: number, y: number, z: number): number {
  const a = Math.sin(x * 1.3 + y * 0.8) * Math.sin(y * 1.1 - z * 0.9);
  const b = Math.sin(z * 2.7 + x * 2.1) * Math.sin(x * 1.9 + z * 2.4);
  const c = Math.sin((x + y + z) * 4.3);
  // stretched hard so the ramp is used end to end: distinct magenta, jade,
  // violet and gold regions rather than one averaged tint
  const v = a * 0.55 + b * 0.3 + c * 0.15;
  return Math.min(1, Math.max(0, 0.5 + Math.sign(v) * Math.pow(Math.abs(v), 0.7) * 0.85));
}

export function buildCore(density = 1): CoreAttributes {
  const rand = mulberry(20260812);
  const pos: number[] = [];
  const orbit: number[] = [];
  const seed: number[] = [];
  const tint: number[] = [];
  const type: number[] = [];

  const push = (x: number, y: number, z: number, speed: number, t: number, tn: number) => {
    pos.push(x, y, z);
    orbit.push(Math.hypot(x, y), Math.atan2(y, x), z, speed);
    seed.push(rand());
    tint.push(tn);
    type.push(t);
  };

  // --- the galaxy shell ---
  // Uniform scatter averages to a flat grey wash. The reference is clumpy:
  // knots of one colour holding together, with voids between them. So the
  // particles are grown around a few hundred cluster seeds, each seed owning a
  // tint, which is what produces visible magenta, jade and violet regions.
  const seeds = Math.round(420 * density);
  const clusters: Array<{ x: number; y: number; z: number; tn: number; s: number }> = [];
  for (let c = 0; c < seeds; c++) {
    const R = 0.36 + Math.pow(rand(), 0.6) * 0.6;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const x = R * Math.sin(phi) * Math.cos(theta);
    const y = R * Math.sin(phi) * Math.sin(theta);
    const z = R * Math.cos(phi) * 0.8;
    if (Math.hypot(x, y) < 0.3) continue;
    clusters.push({
      x, y, z,
      tn: patch(x * 3.4, y * 3.4, z * 3.4),
      s: 0.035 + rand() * 0.085, // knot size varies, so the texture is not regular
    });
  }

  const shell = Math.round(46000 * density);
  let placed = 0;
  let guard = 0;
  while (placed < shell && guard < shell * 8) {
    guard++;
    const c = clusters[(rand() * clusters.length) | 0];
    if (!c) break;
    // gaussian-ish falloff around the knot
    const g = () => (rand() + rand() + rand() - 1.5) * c.s;
    const x = c.x + g();
    const y = c.y + g();
    const z = c.z + g() * 0.8;
    const rho = Math.hypot(x, y);
    const R = Math.hypot(rho, z);
    // The event horizon: a hollow sphere still projects a filled disc, so the
    // dark centre has to be cut in the projected plane.
    if (rho < 0.29 + rand() * 0.1) continue;
    if (R > 1.02) continue;
    placed++;
    // Keplerian: inner shells sweep faster, which is what makes it swirl
    push(x, y, z, 0.2 + 0.05 / Math.max(R, 0.35), 0,
         Math.min(1, Math.max(0, c.tn + (rand() - 0.5) * 0.1)));
  }

  // --- horizon ring: the thin bright circle lining the dark centre ---
  const ringN = Math.round(1400 * density);
  for (let i = 0; i < ringN; i++) {
    const rho = 0.285 + (rand() - 0.5) * 0.022;
    const ang = rand() * Math.PI * 2;
    push(Math.cos(ang) * rho, Math.sin(ang) * rho, (rand() - 0.5) * 0.05, 0.26, 4, rand());
  }

  // --- blades: three golden crescents sweeping round the horizon like a
  // turbine. They are the moving shape at the centre of the reference. ---
  const blades = 3;
  const perBlade = Math.round(850 * density);
  for (let b = 0; b < blades; b++) {
    const phase = (b / blades) * Math.PI * 2;
    for (let i = 0; i < perBlade; i++) {
      const t = rand(); // 0 at the tail, 1 at the tip
      // logarithmic spiral: the crescent opens as it sweeps outward
      const sweep = t * 1.55;
      const rho = 0.31 * Math.exp(sweep * 0.52);
      const ang = phase + sweep;
      // thickness tapers to a point at both ends
      const wob = Math.sin(t * Math.PI);
      const spread = 0.019 * wob;
      const jr = (rand() + rand() - 1) * spread;
      const ja = ((rand() + rand() - 1) * spread) / Math.max(rho, 0.2);
      push(
        Math.cos(ang + ja) * (rho + jr),
        Math.sin(ang + ja) * (rho + jr),
        (rand() - 0.5) * 0.035,
        0.26,
        5,
        wob, // tint carries the taper, so the tips fade
      );
    }
  }

  // --- corona: the amber ring around the whole mass, facing the camera ---
  const corona = Math.round(11000 * density);
  for (let i = 0; i < corona; i++) {
    // concentrated at 1.06 with a soft outer falloff
    const rho = 1.02 + Math.pow(rand(), 2.2) * 0.3 - rand() * 0.06;
    const ang = rand() * Math.PI * 2;
    const z = (rand() - 0.5) * 0.22;
    push(Math.cos(ang) * rho, Math.sin(ang) * rho, z, 0.17, 1, rand());
  }

  // --- starfield ---
  const stars = Math.round(2400 * density);
  for (let i = 0; i < stars; i++) {
    const R = 4.5 + rand() * 9;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    push(
      R * Math.sin(phi) * Math.cos(theta),
      R * Math.sin(phi) * Math.sin(theta),
      R * Math.cos(phi) * 0.5 - 2,
      0,
      2,
      rand(),
    );
  }

  // --- embers drifting between the core and the field ---
  const embers = Math.round(1100 * density);
  for (let i = 0; i < embers; i++) {
    const rho = 1.3 + rand() * 1.9;
    const ang = rand() * Math.PI * 2;
    push(Math.cos(ang) * rho, Math.sin(ang) * rho, (rand() - 0.5) * 1.2, 0.1 / rho, 3, rand());
  }

  return {
    position: new Float32Array(pos),
    orbit: new Float32Array(orbit),
    seed: new Float32Array(seed),
    tint: new Float32Array(tint),
    type: new Float32Array(type),
    count: seed.length,
  };
}
