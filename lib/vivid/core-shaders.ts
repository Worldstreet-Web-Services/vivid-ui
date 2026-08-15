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
uniform float uConnect;
uniform float uError;
uniform float uIntensity;
uniform float uInputLevel;   // her hearing: the microphone
uniform float uOutputLevel;  // her voice: the TTS
uniform float uBeatPhase;
uniform float uBeatOnset;
uniform float uSurge;
uniform float uBass;
uniform float uTreble;
uniform float uBands[16];
uniform float uSizeScale;
uniform float uYaw;
uniform float uPitch;
// The same pointer, followed more slowly, for the far plane.
uniform float uYawFar;
uniform float uPitchFar;

varying float vTint;
varying float vType;
varying float vGlow;
varying float vSeed;
varying float vDepth;
varying float vShed;     // how far this particle has peeled off the body, 0..1

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
  float flatten = 1.0 + uThink * 0.5 - uSpeak * 0.25 + uError * 0.35;
  float spin    = 1.0 - uListen * 0.5 + uThink * 0.5 + uSpeak * 0.25 - uConnect * 0.6 - uError * 0.7;

  // ATTENTION. Listening is not only a tremble: the whole mass tightens toward
  // its centre on the strength of what she hears, so when you speak she
  // visibly gathers toward you, and eases back out as you pause. Driven by the
  // input level, never the output: this is her hearing, not her voice.
  float attend = uListen * uInputLevel;
  // CONNECTING. She is waking: the mass sits loose and dim and slowly draws in,
  // the horizon ring beating slowly underneath, before she is fully here.
  float waking = uConnect * (0.5 + 0.5 * sin(uTime * 1.9));
  // ERROR. The line is lost: the mass sags outward and slackens.
  float sag = uError;
  // SURGE. Every state change arrives: a brief tightening that settles.
  float arrive = uSurge;

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
    // Gathers toward you as you speak; slackens on the lost line; draws in
    // while waking; tightens on every arrival.
    rr *= 1.0 - attend * 0.09 - arrive * 0.06 + sag * 0.12 - uConnect * 0.05 + waking * 0.02;

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
      // And on the beat of her voice the shells lift together, so the mass
      // pulses on her cadence rather than only on her loudness.
      rr += uSpeak * uBeatOnset * 0.05 * smoothstep(0.3, 1.0, R);
    }
  }

  a += uTime * speed * (spin - 1.0);

  vec3 p = vec3(cos(a) * rr, sin(a) * rr, z * flatten);

  // LISTENING — the whole mass trembles in place: a fast, small, per-particle
  // shiver, like a taut string or a held breath. It moves nowhere; it vibrates.
  if (uListen > 0.01 && aType < 3.5) {
    float f = 34.0 + aSeed * 26.0;
    // The tremble is hers; its size is yours. Louder into the mic, tauter she is.
    float amp = (0.006 + uInputLevel * 0.028) * uListen;
    p += amp * vec3(
      sin(uTime * f + aSeed * 61.0),
      sin(uTime * f * 1.13 + aSeed * 37.0),
      sin(uTime * f * 0.87 + aSeed * 19.0));
  }

  // ---- turbulence, gated by its own magnitude ----
  // The body of the presence should hold still while energy sheds off it. So
  // the swirl is not applied evenly: each particle is pushed by pow(d, 4) of
  // its own displacement, which leaves the many nearly where they were and
  // lets the few most-displaced peel away. Without the gate the whole cloud
  // jiggles; with it, a stable presence sheds. (After tgcnzn's visualiser.)
  vShed = 0.0;
  if (aType < 1.5) {
    float amount = 0.06 + uThink * 0.34 + uIntensity * 0.08;
    vec3 push = swirl(p, uTime) * amount;
    // Three sines rarely all sit near zero, so length(push) alone would let
    // most of the shell drift. The gate is taken past a threshold and then
    // steepened, so the body genuinely holds and only the tail sheds. Measured
    // over the swirl's distribution: about a fifth of the shell moves
    // perceptibly, one particle in seventeen peels away, the rest holds.
    float dn = clamp(length(push) / (amount * 1.7321), 0.0, 1.0);
    float gate = pow(smoothstep(0.65, 1.0, dn), 4.0);
    p += push * gate;
    vShed = gate;
  } else if (aType > 2.5) {
    p += swirl(p, uTime * 0.3) * 0.06;
  }

  // ---- assembly: the galaxy condenses out of a scattered cloud ----
  float delay = aType > 1.5 ? 0.0 : aSeed * 0.4;
  float prog = clamp((uAsm - delay) / 0.6, 0.0, 1.0);
  float ease = 1.0 - pow(1.0 - prog, 3.0);
  vec3 scattered = normalize(p + 0.001) * (R + (1.0 - ease) * (4.0 + aSeed * 5.0));
  p = mix(scattered, p, ease);

  // ---- pointer parallax, by depth ----
  // Depth is the medium. If every particle turns by the same yaw the whole
  // thing is one flat plane that swivels; what sells space is the planes
  // moving at different rates. The star field behind her turns less than she
  // does and lags a beat behind (uYawFar is the same pointer, damped harder),
  // so the presence sits IN a field rather than on a backdrop.
  float far = aType > 1.5 && aType < 2.5 ? 1.0 : 0.0;
  float yaw = mix(uYaw, uYawFar * 0.45, far);
  float pitch = mix(uPitch, uPitchFar * 0.45, far);
  float cy = cos(yaw), sy = sin(yaw);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  float cp = cos(pitch), sp = sin(pitch);
  p = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;

  // ---- brightness ----
  float flick = 0.65 + 0.35 * hash(aSeed * 31.0 + floor(uTime * 3.0));
  // The lost line: the flicker goes ragged, the whole field dimmer.
  flick = mix(flick, flick * (0.55 + 0.45 * hash(aSeed * 7.0 + floor(uTime * 11.0))), uError);
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
  // Waking: the horizon ring is her heartbeat before she is here.
  if (aType > 3.5 && aType < 4.5) vGlow += waking * 0.9;
  // Arrival: over-bright for an instant, then it settles into the state.
  vGlow *= 1.0 + arrive * 0.9;
  // Lost line: dim.
  vGlow *= 1.0 - uError * 0.45;
  size *= 0.75 + vGlow * 0.6;
  // Shed particles swell as they leave, so the wisps read as energy rather
  // than as stray dots.
  size *= 1.0 + vShed * 1.6;
  gl_PointSize = size * uSizeScale * ease / max(0.5, vDepth * 0.5);
}
`;

export const CORE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uListen;
uniform float uThink;
uniform float uSpeak;
uniform float uConnect;
uniform float uError;
uniform float uIntensity;
uniform float uSurge;

// The brand, handed in from lib/vivid/palette.ts so the shader and the chrome
// share one definition. Silver is the body, gold the metal at her core, green
// the colour of her attention. Nothing else appears.
uniform vec3 uSilverDeep;
uniform vec3 uSilver;
uniform vec3 uSilverBright;
uniform vec3 uGreen;
uniform vec3 uGreenBright;
uniform vec3 uGold;
uniform vec3 uGoldBright;
uniform vec3 uWhite;

varying float vTint;
varying float vType;
varying float vGlow;
varying float vSeed;
varying float vDepth;
varying float vShed;     // how far this particle has peeled off the body, 0..1

// The body's palette: metallic silver, shadow through highlight, with sparse
// patches of green and gold set into it. The patches are what keeps silver
// from reading as grey: a few particles in every hundred carry the brand's
// two accents, so at rest she is unmistakably silver and unmistakably ours.
vec3 ramp(float t) {
  // The metal itself, over most of the range.
  vec3 metal = t < 0.5
    ? mix(uSilverDeep, uSilver, t / 0.5)
    : mix(uSilver, uSilverBright, (t - 0.5) / 0.5);
  // Two narrow bands of accent, at fixed places on the tint so the same
  // particles carry them from frame to frame rather than flickering.
  // Green gets the wider band: it is the accent silver hides most easily,
  // and at rest all three colours of the brand should be readable.
  float greenBand = smoothstep(0.26, 0.31, t) * (1.0 - smoothstep(0.40, 0.45, t));
  float goldBand  = smoothstep(0.67, 0.71, t) * (1.0 - smoothstep(0.74, 0.78, t));
  vec3 col = mix(metal, uGreen, greenBand * 0.9);
  return mix(col, uGold, goldBand * 0.85);
}

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float alpha = smoothstep(0.5, 0.0, d);

  vec3 col;
  if (vType > 4.5) {                       // blades: gold, hot to near-white at the belly
    col = mix(uGold, uGoldBright, vTint * 0.7);
    col = mix(col, uWhite, vTint * vTint * 0.35);
    alpha *= 0.85;
  } else if (vType > 3.5) {                // the ring lining the horizon: silver
    col = mix(uSilver, uSilverBright, vTint);
    col = mix(col, uGoldBright, uSpeak * uIntensity * 0.22);
    alpha *= 0.8;
  } else if (vType > 2.5) {                // embers: dim gold, drifting off
    col = mix(uGold * 0.7, uGoldBright, vTint * 0.5);
    alpha *= 1.8;
  } else if (vType > 1.5) {                // stars: silver-white points
    col = mix(uSilverBright, uWhite, vTint);
    alpha *= 4.5;
  } else if (vType > 0.5) {                // accretion ring: the gold at her core
    col = mix(uGold, uGoldBright, vTint * 0.7 + 0.15);
    // The states reach the core too, more gently than the shell.
    col = mix(col, uGreenBright, uListen * 0.45);
    col = mix(col, uSilverBright, uThink * 0.5);
    col = mix(col, uWhite, uSpeak * (0.2 + uIntensity * 0.28));
  } else {                                 // the galaxy shell: silver, with the accents in it
    col = ramp(vTint);
    // At rest the shell keeps its silver and its patches. Each state pulls it
    // toward one colour and one meaning, so the state reads at a glance:
    // green, she is attending; silver-white, she is working; gold, her voice.
    col = mix(col, uGreen, uListen * 0.72);
    col = mix(col, uSilverBright, uThink * 0.68);
    col = mix(col, uGold, uSpeak * 0.6);
    // Waking is silver going toward its shadow; the lost line drains her to
    // the deepest silver, colour leaving before the light does.
    col = mix(col, uSilverDeep, uConnect * 0.5);
    col = mix(col, uSilverDeep, uError * 0.7);
  }
  // Arrival flashes toward the warm white for an instant, whatever the state.
  col = mix(col, uWhite, uSurge * 0.35);

  // Shed energy burns bright: it lifts toward the warm white on its way out.
  col = mix(col, uWhite, vShed * 0.55);

  // ---- signal imperfection ----
  // A presence that is perfectly clean reads as a screensaver. Two small
  // things keep her a signal rather than a render: a per-pixel grain, and a
  // rare, brief dip across the whole field, as if the carrier wavered. Both
  // are a hair; this is imperfection, not damage. Every particle dips
  // together, which is what makes it read as the signal and not as twinkle.
  float grain = fract(sin(dot(gl_PointCoord + vSeed, vec2(12.9898, 78.233))) * 43758.5453);
  float carrier = fract(sin(floor(uTime * 7.0) * 91.7) * 43758.5453);
  float dip = carrier > 0.985 ? 0.72 : 1.0;   // measured: one 143ms dip every ten seconds
  // On a lost line the dips come far more often and cut deeper.
  dip = mix(dip, carrier > 0.86 ? 0.45 : 1.0, uError);
  float signal = dip * (0.94 + grain * 0.06);

  float glowMapped = vGlow / (1.0 + vGlow * 0.85);
  gl_FragColor = vec4(
    col * (0.35 + glowMapped * 0.62 + vShed * 0.3) * signal,
    alpha * (0.03 + glowMapped * 0.055 + vShed * 0.04));
}
`;
