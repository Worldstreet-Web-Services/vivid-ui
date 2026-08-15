// One material for the whole Core. Orbits, turbulence, audio response and the
// state machine all run on the GPU.

export const CORE_VERT = /* glsl */ `
attribute vec4 aOrbit;   // radius, angle, inclination, speed
attribute float aSeed;
attribute float aTint;
attribute float aType;
attribute vec3 aTarget;  // where this particle sits in the form being morphed to
attribute float aRegion; // which part of that form: see REGION in lib/vivid/bands
attribute float aRim;    // how squarely it sits on the silhouette, 0..1

// Matches REGION in lib/vivid/bands.ts.
#define R_RIM 0.0
#define R_INTERIOR 1.0
#define R_CORE 2.0
#define R_FILAMENT 3.0
#define R_CROWN 4.0
#define R_ATMOSPHERE 5.0
#define R_ARC 6.0
#define R_HALO 7.0

// How much of the morph is spent staggering particles rather than moving them.
// Without it every particle leaves at once and the change reads as a cut; with
// it the mass reorganises in a wave.
#define MORPH_STAGGER 0.35

uniform float uTime;
uniform float uAsm;        // 0..1 assembly
uniform float uMorph;      // 0..1 toward aTarget; 0 is the constellation
uniform float uDissolve;   // 0..1, peaks mid-way out of a form
uniform vec3 uCoreAnchor;  // where the current form's energy lives
uniform float uCoreRadius; // how far it reaches
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
varying float vRegion;
varying float vForm;     // how far into the form we are, so the constellation is untouched
varying float vEdge;     // how squarely on the silhouette, for the fragment palette

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

  // ---- morph: the same particles reorganise into a named form ----
  //
  // The assembly above is this same idea applied once at boot, from a scattered
  // cloud to the galaxy. This generalises it: any form can be the destination,
  // and the particle keeps its identity across every one of them.
  //
  // At uMorph = 0 this is exactly p. mProg clamps to 0, mEase is
  // 1 - pow(1, 3) = 0, and mix(p, aTarget, 0.0) returns p unchanged — so the
  // constellation is bit-for-bit what it was before this existed.
  float mDelay = aSeed * MORPH_STAGGER;
  float mProg = clamp((uMorph - mDelay) / (1.0 - MORPH_STAGGER), 0.0, 1.0);
  float mEase = 1.0 - pow(1.0 - mProg, 3.0);
  vec3 formPos = aTarget;

  // ---- the form is never quite still ----
  if (uMorph > 0.001) {
    // CROWN sheds upward and drifts off, which is what stops the top of the
    // head reading as a cut line.
    if (aRegion > R_CROWN - 0.5 && aRegion < R_CROWN + 0.5) {
      float rise = fract(uTime * 0.09 + aSeed);
      formPos.y += rise * 0.16;
      formPos.x += sin(uTime * 0.5 + aSeed * 30.0) * 0.02 * rise;
      formPos.z += cos(uTime * 0.4 + aSeed * 21.0) * 0.02 * rise;
    }
    // Everything else breathes: a slow swell, stronger on the body than the
    // head, so it reads as alive rather than bouncing.
    float breathe = sin(uTime * 0.42) * 0.5 + 0.5;
    formPos *= 1.0 + breathe * 0.004 * (1.0 - formPos.y);
    // and a small wander around home so the surface shimmers
    formPos += swirl(formPos * 6.0, uTime * 0.25) * 0.0022;
  }

  p = mix(p, formPos, mEase);

  // ---- coming apart ----
  // Leaving a form is not the arrival played backwards. Particles let go of the
  // structure unevenly, stream outward, and only then fall back into the
  // galaxy — so the figure loosens and breaks up rather than tidily unwinding.
  if (uDissolve > 0.001) {
    float loosen = uDissolve * (0.35 + aSeed * 0.9);
    p += normalize(p + 0.001) * loosen * 0.55;
    p += swirl(p, uTime * 0.9) * uDissolve * 0.22;
  }

  vRegion = aRegion;
  vForm = mEase * step(0.001, uMorph);
  vEdge = pow(aRim, 2.2);

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
  // ---- the form's own light ----
  if (vForm > 0.001) {
    // The silhouette glows because grazing particles are brighter, not because
    // more of them are crowded there.
    float edge = pow(aRim, 2.2);
    // The outline is the brightest line, not a floodlight. At 2.4 the stroke
    // saturated to white and, blended additively over its neighbours, bleached
    // the contour lines and the face out of the picture.
    float lift = 0.35 + edge * 1.25;

    // Every form has an anchor, so the states reach forms with no face: a car
    // lights at its grille, a tower up its spine, a gold bar from its middle.
    // Forms that name a CORE region get the precise treatment below on top of
    // this; forms that do not still answer when she speaks.
    float toCore = length(aTarget - uCoreAnchor);
    float coreness = 1.0 - smoothstep(0.0, max(0.0001, uCoreRadius), toCore);
    lift += coreness * (0.25 + uSpeak * (0.9 + uIntensity * 1.3) + uListen * 0.2);

    // The face carries the voice: horizontal wave lines running across the
    // amber oval, driven by the audio bands, crests going near-white.
    if (aRegion > R_CORE - 0.5 && aRegion < R_CORE + 0.5) {
      float wave = sin(aTarget.y * 180.0 - uTime * 2.6 + bandAmp * 7.0);
      lift = 1.5 + wave * (0.5 + uSpeak * (0.9 + uIntensity * 1.4));
    }
    // Filaments surge a beat behind the voice, so the throat answers the face
    // rather than moving with it.
    if (aRegion > R_FILAMENT - 0.5 && aRegion < R_FILAMENT + 0.5) {
      float lag = sin(uTime * 3.1 - 1.1 + aSeed * 4.0) * 0.5 + 0.5;
      lift = 1.2 + uSpeak * lag * (0.8 + uIntensity);
    }
    if (aRegion > R_ARC - 0.5 && aRegion < R_ARC + 0.5) lift = 0.9 + edge * 1.2;
    // The rings around her. Faint, and faintest furthest out, so they read as
    // the room she is in and not as a target painted behind her.
    if (aRegion > R_HALO - 0.5) lift = 0.34;
    // The interior is the contour lines, and in the reference they are most
    // of what you see. Brighter toward the edge, where the surface turns away
    // from the viewer, so the figure reads as a solid with a rounded surface
    // rather than a flat plate; and never below a floor, so the lines stay
    // legible right through the middle of the face.
    // The contour lines, lit by their own curvature: brighter where the surface
    // turns away from the viewer. On her there is no drawn outline at all; the
    // rim is these lines bunching at the edge, each one brighter for being
    // there, and the two effects together are what make it blaze. So the edge
    // term is not held back.
    if (aRegion > R_INTERIOR - 0.5 && aRegion < R_INTERIOR + 0.5) lift = 0.5 + edge * 1.6;
    if (aRegion > R_ATMOSPHERE - 0.5 && aRegion < R_ATMOSPHERE + 0.5) lift = 0.18;
    if (aRegion > R_CROWN - 0.5 && aRegion < R_CROWN + 0.5) lift = 0.45;

    vGlow = mix(vGlow, lift * flick, vForm);
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
varying float vRegion;
varying float vForm;
varying float vEdge;

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

  // ---- the form's palette ----
  // The same particles, so the same colours. A form keeps each particle's own
  // place on the spectrum, and it is what a flat single-hue treatment lost:
  // one cyan everywhere reads as a toy, the full ramp reads as the
  // constellation having taken a shape. The silhouette stroke goes to a hot
  // near-white, so the outline is the brightest thing on screen; the interior
  // keeps its colour but sits back, so the lines read as lines through a solid.
  if (vForm > 0.001) {
    vec3 own = ramp(vTint);
    // The reference: a deep electric blue through the body, running to bright
    // cyan at the outline. Each particle keeps a trace of its own place on the
    // spectrum, so the body shimmers rather than sitting flat, but blue is the
    // key. The stroke stops at cyan; white is reserved for the crest of the
    // face, or the outline bleaches everything around it.
    vec3 deep = vec3(0.05, 0.32, 0.92);
    vec3 cyan = vec3(0.30, 0.86, 1.0);
    vec3 body = mix(deep, own, 0.22);
    vec3 formCol = mix(body, cyan, vEdge);
    if (vRegion > 1.5 && vRegion < 2.5) {
      // face: gold through to a near-white crest
      formCol = mix(vec3(1.0, 0.42, 0.0), vec3(1.0, 0.96, 0.76), clamp(vGlow - 0.9, 0.0, 1.0));
    } else if (vRegion > 2.5 && vRegion < 3.5) {
      formCol = vec3(1.0, 0.69, 0.23);          // throat filaments
    } else if (vRegion > 3.5 && vRegion < 4.5) {
      formCol = mix(own, vec3(0.7, 0.96, 1.0), 0.6); // crown, cooler as it leaves
    } else if (vRegion > 4.5 && vRegion < 5.5) {
      formCol = own * 0.7;                       // atmosphere: its own colour, dimmer
    } else if (vRegion > 6.5) {
      formCol = mix(deep, cyan, 0.45) * 0.8;     // halo rings: the room's blue
    }
    // Speaking still warms the whole figure a little, as it does the galaxy.
    formCol = mix(formCol, vec3(1.0, 0.86, 0.6), uSpeak * uIntensity * 0.14);
    col = mix(col, formCol, vForm);
  }

  float glowMapped = vGlow / (1.0 + vGlow * 0.85);
  gl_FragColor = vec4(col * (0.35 + glowMapped * 0.62), alpha * (0.03 + glowMapped * 0.055));
}
`;
