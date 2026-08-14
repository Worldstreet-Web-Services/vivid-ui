// One material for the whole Core. Orbits, turbulence, audio response and the
// state machine all run on the GPU.

export const CORE_VERT = /* glsl */ `
attribute vec4 aOrbit;   // radius, angle, inclination, speed
attribute float aSeed;
attribute float aTint;
attribute float aType;

uniform float uTime;
uniform float uAsm;        // 0..1 assembly
uniform float uListen;
uniform float uThink;
uniform float uSpeak;
uniform float uIntensity;
uniform float uBass;
uniform float uTreble;
uniform float uBands[16];
uniform float uSizeScale;
uniform float uYaw;
uniform float uPitch;

varying float vTint;
varying float vType;
varying float vGlow;
varying float vSeed;
varying float vDepth;

float hash(float n) { return fract(sin(n) * 43758.5453123); }

// A shockwave front at radius f: bright where it passes, dark elsewhere.
float front(float R, float f, float width) {
  return exp(-pow((R - f) / width, 2.0));
}

// Three staggered waves radiating outward from the horizon.
float radiation(float R, float t, float speedScale) {
  float sum = 0.0;
  for (int i = 0; i < 3; i++) {
    float phase = fract(t * 0.42 * speedScale + float(i) * 0.333);
    float f = 0.28 + phase * 1.25;      // travels from the horizon outward
    sum += front(R, f, 0.1) * (1.0 - phase); // fades as it goes
  }
  return sum;
}

// cheap curl-ish turbulence
vec3 swirl(vec3 p, float t) {
  return vec3(
    sin(p.y * 3.1 + t * 0.7 + aSeed * 12.0),
    sin(p.z * 2.7 - t * 0.5 + aSeed * 19.0),
    sin(p.x * 3.4 + t * 0.6 + aSeed * 7.0));
}

void main() {
  float rho = aOrbit.x;    // radius in the screen plane
  float ang = aOrbit.y;
  float z   = aOrbit.z;
  float speed = aOrbit.w;
  float R = length(vec2(rho, z));   // true 3D radius

  vSeed = aSeed;
  vType = aType;
  vTint = aTint;
  vGlow = 0.0;

  // ---- rotation about the camera axis: the swirl reads face-on ----
  float a = ang + uTime * speed * (1.0 + uThink * 0.8);

  int band = int(clamp((R - 0.34) / 0.62 * 15.0, 0.0, 15.0));
  float bandAmp = uBands[band];

  // A slow breath under everything, so she is never mechanically still.
  float breath = sin(uTime * 0.31) * 0.5 + 0.5;

  // Each state owns a MOTION, not a colour. Cover the screen and you could
  // still name the state from how the particles move:
  //   IDLE      a slow, even turn
  //   LISTENING the whole mass trembles in place, taut and alert
  //   THINKING  matter scatters outward from the centre in continuous bursts
  //   SPEAKING  rings of energy race outward from the horizon
  float flatten = 1.0 + uThink * 0.5 - uSpeak * 0.25;
  float spin    = 1.0 - uListen * 0.5 + uThink * 0.5 + uSpeak * 0.25;

  float rr = rho;
  if (aType > 3.5) {
    a = ang + uTime * speed * (1.6 * spin);
    // Orbit ring and beam blades: widen and pulse with speech intensity.
    float beamPulse = sin(uTime * (8.0 + uIntensity * 10.0) + aSeed * 12.0) * 0.5 + 0.5;
    rr = rho * (
      1.0
      + uSpeak * (uIntensity * 0.16 + bandAmp * 0.07 + beamPulse * 0.03)
      - uListen * 0.05
      + uBass * 0.05
    );
  } else if (aType < 0.5) {
    rr = rho + bandAmp * 0.03 * (0.35 + uSpeak) + breath * 0.012;

    // IDLE — one slow faint pulse leaving the horizon, so she reads as alive
    // and waiting rather than paused. Fades out as any other state takes over.
    float calm = (1.0 - uListen) * (1.0 - uThink) * (1.0 - uSpeak);
    rr += calm * radiation(R, uTime, 0.28) * 0.02;

    // THINKING — scatter from the centre. Each particle rides its own launch
    // cycle: it leaves the horizon, flies outward, thins out and is recycled.
    // The mass never settles, which is what unresolved computation looks like.
    if (uThink > 0.01) {
      float launch = fract(uTime * 0.34 + aSeed * 1.37);
      float burst = pow(launch, 0.55);           // fast off the line, then slows
      rr = mix(rr, 0.3 + burst * 1.25, uThink * 0.85);
      // fan out as they travel, so the bursts read as spokes not a ring
      a += uThink * burst * (aSeed - 0.5) * 1.4;
    }

    // SPEAKING — radiation. Shockwave fronts leave the horizon and sweep
    // outward through the mass, lifting each shell as they pass, so the whole
    // galaxy pulses outward on her voice.
    if (uSpeak > 0.01) {
      float rad = radiation(R, uTime, 1.0 + uIntensity);
      rr += uSpeak * rad * (0.06 + uIntensity * 0.14);
    }
  }

  a += uTime * speed * (spin - 1.0);

  vec3 p = vec3(cos(a) * rr, sin(a) * rr, z * flatten);

  // LISTENING — the whole mass trembles in place: a fast, small, per-particle
  // shiver, like a taut string or a held breath. It moves nowhere; it vibrates.
  if (uListen > 0.01 && aType < 3.5) {
    float f = 34.0 + aSeed * 26.0;
    float amp = (0.006 + bandAmp * 0.022) * uListen;
    p += amp * vec3(
      sin(uTime * f + aSeed * 61.0),
      sin(uTime * f * 1.13 + aSeed * 37.0),
      sin(uTime * f * 0.87 + aSeed * 19.0));
  }

  // ---- turbulence, stronger while thinking ----
  if (aType < 1.5) {
    p += swirl(p, uTime) * (0.012 + uThink * 0.11 + uIntensity * 0.02);
  } else if (aType > 2.5) {
    p += swirl(p, uTime * 0.3) * 0.06;
  }

  // ---- assembly: the galaxy condenses out of a scattered cloud ----
  float delay = aType > 1.5 ? 0.0 : aSeed * 0.4;
  float prog = clamp((uAsm - delay) / 0.6, 0.0, 1.0);
  float ease = 1.0 - pow(1.0 - prog, 3.0);
  vec3 scattered = normalize(p + 0.001) * (R + (1.0 - ease) * (4.0 + aSeed * 5.0));
  p = mix(scattered, p, ease);

  // ---- pointer parallax ----
  float cy = cos(uYaw), sy = sin(uYaw);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  float cp = cos(uPitch), sp = sin(uPitch);
  p = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;

  // ---- brightness ----
  float flick = 0.65 + 0.35 * hash(aSeed * 31.0 + floor(uTime * 3.0));
  if (aType < 0.5) {
    // brighter toward the outside of the shell, so the mass has a lit edge
    vGlow = (0.3 + smoothstep(0.5, 0.98, R) * 0.7) * flick
          + bandAmp * 0.45 * uSpeak + uTreble * 0.2
          // the wave fronts light the shells they pass through
          + uSpeak * radiation(R, uTime, 1.0 + uIntensity) * (0.35 + uIntensity * 0.7)
          + (1.0 - uListen) * (1.0 - uThink) * (1.0 - uSpeak)
            * radiation(R, uTime, 0.28) * 0.35;
  } else if (aType < 1.5) {
    // the corona fades outward from its peak; the falloff tightens while she
    // listens and spreads while she speaks
    float inner = 1.04 - uListen * 0.06 + uSpeak * 0.04;
    float outer = 1.34 - uListen * 0.16 + uSpeak * 0.12;
    vGlow = (1.0 - smoothstep(inner, outer, rho))
          * (0.9 + uBass * 0.9 * (0.4 + uSpeak) - uThink * 0.45) * flick;
  } else if (aType < 2.5) {
    vGlow = 0.3 * flick;
  } else if (aType < 3.5) {
    vGlow = 0.32 * flick;
  } else if (aType < 4.5) {
    vGlow = (0.36 + uBass * 0.28 + uSpeak * (0.16 + uIntensity * 0.46 + bandAmp * 0.2)) * flick;
  } else {
    vGlow = (0.3 + uSpeak * (0.16 + uIntensity * 0.56 + bandAmp * 0.26)) * aTint * flick;
  }
  vGlow = min(vGlow, 1.15);

  float size = 1.5;
  if (aType > 0.5 && aType < 1.5) size = 1.8;
  if (aType > 1.5 && aType < 2.5) size = 1.25 + hash(aSeed) * 1.1;
  if (aType > 2.5 && aType < 3.5) size = 1.6;
  if (aType > 3.5 && aType < 4.5) size = 1.4;
  if (aType > 4.5) size = 1.5 + aTint * 0.9;
  if (aType > 3.5) {
    size *= 1.0 + uSpeak * (0.06 + uIntensity * 0.22 + bandAmp * 0.1);
  }
  size *= 0.75 + vGlow * 0.6;
  gl_PointSize = size * uSizeScale * ease / max(0.5, vDepth * 0.5);
}
`;

export const CORE_FRAG = /* glsl */ `
uniform float uListen;
uniform float uThink;
uniform float uSpeak;
uniform float uIntensity;

varying float vTint;
varying float vType;
varying float vGlow;
varying float vSeed;
varying float vDepth;

// The palette: violet, magenta, jade, cyan and gold, mixed in patches.
vec3 ramp(float t) {
  vec3 violet = vec3(0.51, 0.24, 0.94);
  vec3 magenta = vec3(0.93, 0.24, 0.71);
  vec3 jade   = vec3(0.24, 0.93, 0.62);
  vec3 cyan   = vec3(0.29, 0.78, 1.0);
  vec3 gold   = vec3(1.0,  0.74, 0.29);
  if (t < 0.25) return mix(violet, magenta, t / 0.25);
  if (t < 0.5)  return mix(magenta, jade,  (t - 0.25) / 0.25);
  if (t < 0.75) return mix(jade,   cyan,   (t - 0.5)  / 0.25);
  return mix(cyan, gold, (t - 0.75) / 0.25);
}

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float alpha = smoothstep(0.5, 0.0, d);

  vec3 col;
  if (vType > 4.5) {                       // blades: gold, hot at the belly
    col = mix(vec3(1.0, 0.78, 0.2), vec3(1.0, 0.97, 0.82), vTint * 0.55);
    alpha *= 0.85;
  } else if (vType > 3.5) {                // the ring lining the horizon
    col = mix(vec3(0.32, 0.72, 1.0), vec3(0.75, 0.95, 1.0), vTint);
    col = mix(col, vec3(1.0, 0.88, 0.66), uSpeak * uIntensity * 0.22);
    alpha *= 0.8;
  } else if (vType > 2.5) {                // embers
    col = mix(vec3(1.0, 0.62, 0.24), vec3(1.0, 0.87, 0.6), vTint);
    alpha *= 2.2;
  } else if (vType > 1.5) {                // stars
    col = mix(vec3(0.75, 0.83, 1.0), vec3(1.0, 0.94, 0.85), vTint);
    alpha *= 4.5;
  } else if (vType > 0.5) {                // accretion ring
    col = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.78, 0.32), vTint * 0.7 + 0.15);
    col = mix(col, vec3(0.25, 0.75, 1.0), uListen * 0.65);
    col = mix(col, vec3(0.5, 0.3, 0.9), uThink * 0.6);
    col = mix(col, vec3(1.0, 0.9, 0.72), uSpeak * (0.2 + uIntensity * 0.28));
  } else {                                 // the galaxy shell
    col = ramp(vTint);
    // IDLE keeps the full spectrum; the other three each take a hue so the
    // state is legible at a glance and never ambiguous
    col = mix(col, vec3(0.20, 0.70, 1.00), uListen * 0.72); // cyan, cold
    col = mix(col, vec3(0.58, 0.28, 0.95), uThink * 0.68);  // violet, unsettled
    col = mix(col, vec3(1.00, 0.72, 0.26), uSpeak * 0.6);   // gold, warm
  }

  float glowMapped = vGlow / (1.0 + vGlow * 0.85);
  gl_FragColor = vec4(col * (0.35 + glowMapped * 0.62), alpha * (0.03 + glowMapped * 0.055));
}
`;
