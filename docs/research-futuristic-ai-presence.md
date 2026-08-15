# Research: how JARVIS-style AI presences are designed and built

15 August 2026. Background for taking Vivid's constellation "futuristic". The
form transformations (cars, building, figure) are being removed; the presence
returns to the constellation alone, and this is the survey of how the best
work in this space is done, so the next step is informed rather than
improvised.

Four sources, in order of authority: the people who designed the actual
JARVIS screens; the technical craft of hologram and audio-reactive rendering;
the modern "AI presence" genre as it stands in 2026; and open codebases, read
rather than skimmed. Then what it means for Vivid.

---

## 1. What the JARVIS designers actually said

The film HUDs were made by a handful of studios (The Orphanage on Iron Man 1;
Perception, Cantina Creative and Jayse Hansen across Iron Man 2, 3 and The
Avengers). Their own accounts converge on a small number of principles, and
they are not the ones people assume.

### "You are designing a character"

Jon Favreau's brief to the Iron Man 1 team, from the oral history:

> "You are designing a character. We've got this amazing voice talent and we
> have this character that nobody sees."

and on the interface as a conversation:

> "Sometimes RDJ is asking a question to J.A.R.V.I.S. and other times
> J.A.R.V.I.S. is asking a question of RDJ... Look into his eyes. If you look
> into his eyes you will know."

Perception's John LePore, independently:

> "not just making UI that follows the personality traits of the person that's
> using it, but the UI itself is the personality."

**This is the single most important finding.** JARVIS was never a dashboard.
It was the visible half of a dialogue, and its whole design was in service of
making an unseen intelligence feel present. Vivid's brief ("she is here")
is exactly this. Everything else is technique.

### Every element earns its place

Dav Rauch, The Orphanage:

> "If it doesn't do something that would be real for somebody flying around
> in this suit then we are taking it out."

Jayse Hansen went further and built a physical "HUD Bible", every element with
a stated purpose. Favreau, newly holding an iPhone, pushed toward its
plainness: "There's nothing fancy about this phone, but what's fancy is that
it works." The busy, ring-laden, hexagon-strewn look people call "JARVIS
style" is the *fan* reading of it, not what the designers were doing.

### Colour: cyan is passé, and was in 2008

The Mark II HUD was cyan and dense. For the Mark III the team moved to
**white with coloured accents for hierarchy**, explicitly because "cyan is
passé" and "nobody had really been dealing with white graphics". Iron
Monger's HUD was monochrome red in OCR-A on purpose, to read as stolen and
crude. Colour was a *characterisation* decision each time.

### Depth, damping, and the eyes

Three technical principles from the same team:

- **Z-space.** "You needed to let the Z-axis space really work." Graphics
  live at several depths around the head, not on one plane, and parallax
  between the planes is what sells it.
- **Damped follow.** The HUD is not locked to the head; it is "matched" to
  it, lagging slightly, and *lagging more under stress*, so the system reads
  as having weight and as being taxed.
- **Reflection in the eyes.** They projected the graphics onto his eyeballs.
  The interface touches the character; it is not a layer over him.

### "Alpha events" and the story beat

Every shot had one graphic that carried the story ("leave it up on the
screen" and the power meter stays). The interface changed state *because
something happened*, and the audience read the change. Idle motion existed,
but the memorable moments are transitions with a cause.

### Blade Runner 2049: the other pole

Territory Studio built the opposite of clean cyan for BR2049: "warping,
ghosting and colour degradation… glitches and surface textures to suggest an
out of date technology that has seen a long and rough life", and set aside CG
tools for physical ones. Worth knowing as the counter-position: *futuristic*
does not have to mean *pristine*, and texture and imperfection can read as
more real than polish.

Sources: [Heads up: the oral history of Iron Man's original HUD (vfxblog)](https://vfxblog.com/ironman/) ·
[Jayse Hansen interview (TNW)](https://thenextweb.com/news/jayse-hansen-on-creating-tools-the-avengers-use-to-fight-evil-touch-interfaces-and-project-glass) ·
[Perception profile (Engadget)](https://www.engadget.com/2015-12-14-perception-ui-design.html) ·
[Territory Studio, Blade Runner 2049](https://territorystudio.com/project/blade-runner-2049/) ·
[HUDS+GUIS FUI archive](https://www.hudsandguis.com/fui)

---

## 2. The technical craft, from code that exists

### The hologram recipe (fresnel + scanlines + noise + flicker)

The canonical Three.js version is Anderson Mancini's
[`HolographicMaterial`](https://github.com/ektogamat/threejs-vanilla-holographic-material)
(106 stars). Read in full; the whole look is four terms in one fragment
shader:

```glsl
// fresnel: bright where the surface turns away from the viewer
float fresnel = dot(viewDir, normal) * (1.6 - fresnelOpacity/2.);
fresnel = clamp(fresnelAmount - fresnel, 0., fresnelOpacity);

// travelling scanlines in screen space, modulated so they breathe
float scan = 10. + 20. * sin(time*speed*20.8 - uv.y*60.*scanlineSize);
scan *= smoothstep(1.3*cos(time*speed + uv.y*scanlineSize), 0.78, 0.9);
scan *= max(0.25, sin(time*speed));

// per-pixel colour noise, tiny, so it never reads as clean vector
color += vec4(r*scan, b*scan, r, 1.) / 84.;

// signal flicker: mostly 1.0, occasionally dips
float blink = clamp(fract(cos(time*speed*.02) * 43758.5453), 0.6 - speed, 1.0);
```

Additive blending, no depth write, double-sided. Three.js Journey's hologram
lesson teaches the same structure (stripes from model position via `fract`,
fresnel from view·normal, a vertex glitch from time-based noise).

What makes it read as a hologram rather than a transparent mesh, in the words
of everyone who has written it up: **the fresnel**. Edges bright, faces dark.
Vivid's `aRim` brightness on the constellation is already this principle.

### The audio-reactive particle recipe (curl noise, gated by displacement)

The most-starred audio-reactive particle system on GitHub
([tgcnzn/Interactive-Particles-Music-Visualizer](https://github.com/tgcnzn/Interactive-Particles-Music-Visualizer),
88 stars) has one idea worth stealing outright. Its vertex shader:

```glsl
vec3 target = position + normal*.1 + curl(pos * frequency) * amplitude;
float d = length(position - target) / maxDistance;
newpos = mix(position, target, pow(d, 4.));   // <- the trick
gl_PointSize = size + pow(d,3.) * offsetSize * (1./-mvPosition.z);
```

`pow(d, 4)` means only the *most* displaced particles actually move: the body
of the form stays coherent while wisps peel off it. Size grows with
displacement, so the peeling particles are also the biggest and brightest.
That is exactly the "energy shedding off a stable core" behaviour Vivid's
crown plume was reaching for by hand.

Its audio mapping is also the right shape: bands split into low / mid / high,
each driving a *different* uniform (highs → amplitude, mids → offset gain,
lows → time speed), plus beat-synced GSAP tweens on rotation with elastic
easing. Not one loudness number driving everything.

### The hologram *motion* grammar

The best-starred JARVIS HUD ([eadmin2/jarvis_ai](https://github.com/eadmin2/jarvis_ai),
127 stars) is a single 885-line HTML file, and its CSS keyframes are a
complete vocabulary of how holographic panels move. Read as a sequence:

| Beat | What happens | How |
|---|---|---|
| **Approach** | Panel flies in from far Z, blurred and over-bright, overshoots, settles | `translateZ(-800px) rotateX(35°) scale(.3) blur(10px) brightness(2.2)` → `none`, `cubic-bezier(.34,1.56,.64,1)` |
| **Trace** | Frame draws itself | `stroke-dasharray` / `stroke-dashoffset` → 0 |
| **Corners** | Corner brackets snap on | `steps(2)` opacity |
| **Body in** | Content flickers up in steps, not a fade | `steps(3)` at 0 → .35 → .85 → 1 |
| **Scan** | One bright line sweeps down once | `linear-gradient` background-position, 0.42s |
| **Settle** | Hex texture fades out | opacity → 0 |
| **Idle** | Slow breathe: 3px lift + glow swell, 4s | translateY + box-shadow |
| **Dismiss** | Desaturate, blur, recede into Z | `saturate(0) brightness(1.6)` → `blur(14px) translateZ(-900px) scale(.25)` |

The order matters. Arrive → structure → content → sweep → rest, and dismiss
is the reverse with a colour drain first. Boot is `panelIn` with a stuttered
opacity curve (0 → .45 → .95 → .35 → 1), i.e. a *flicker-on*, not a fade-on.

Also worth noting from that codebase: state maps to **tempo**. Its scan line
runs at 4s idle, 1.5s thinking, 2.5s responding. Thinking is the *fastest*
state, responding is measured, idle is slow. The same convention appears in
[openclaw-jarvis-ui](https://github.com/jincocodev/openclaw-jarvis-ui).

Sources: [ektogamat/threejs-vanilla-holographic-material](https://github.com/ektogamat/threejs-vanilla-holographic-material) ·
[Three.js Journey hologram shader](https://threejs-journey.com/lessons/hologram-shader) ·
[Codrops dual-scene X-ray (fresnel + scanlines)](https://tympanus.net/codrops/2026/03/23/building-a-dual-scene-fluid-x-ray-reveal-effect-in-three-js/) ·
[tgcnzn/Interactive-Particles-Music-Visualizer](https://github.com/tgcnzn/Interactive-Particles-Music-Visualizer) ·
[eadmin2/jarvis_ai](https://github.com/eadmin2/jarvis_ai)

---

## 3. The modern "AI presence" genre, 2026

Since 2023 a real design genre has formed around representing a voice AI that
has no body. It has converged hard, and an audience now *reads* these
conventions instantly.

### The orb, and its taxonomy

[VoiceOrbs](https://voiceorbs.vercel.app/) (MIT, [amunozdev/voiceorbs](https://github.com/amunozdev/voiceorbs))
is a live catalogue of fifteen of them, and is effectively a taxonomy of the
genre. The techniques, from cheapest to richest:

- **Pure CSS**: conic-gradient halos, expanding rings, equalizer bars,
  glassmorphism with a specular highlight, aurora veils.
- **SVG filters**: gooey blob with boiling edges (`feTurbulence` +
  `feDisplacementMap`).
- **Canvas 2D**: a particle sphere that scatters into a ring while connecting;
  a waveform traced in polar coordinates; a starfield-in-glass "galaxy".
- **Shaders**: a mesh-gradient "plasma"; a single-pass iridescent flow; a
  liquid-metal "mercury"; and one true WebGL/R3F orb, "Nebula", with
  simplex-noise displacement and fresnel.

Every one of them implements the same **six states**:
`idle · connecting · listening · thinking · speaking · error`, and reacts to
microphone level. That set is now the industry contract.

### The state model everyone converged on

[alexanderqchen/orb-ui](https://github.com/alexanderqchen/orb-ui) is a React
library with adapters for **every** major voice backend (ElevenLabs, LiveKit,
Pipecat, OpenAI Realtime, Gemini Live, Vapi). Its signal type is the
clearest statement of the standard:

```ts
type OrbState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error'
interface OrbSignal {
  state: OrbState
  volume?: number
  inputVolume?: number    // the user's voice
  outputVolume?: number   // the AI's voice
}
```

Two things there that Vivid does not have: a **connecting** state (the
socket is connecting for a real, visible stretch of time), and **separate
input and output volume**. When she is listening the energy should come from
*your* voice; when she speaks, from hers. One `intensity` number cannot tell
those apart.

### Where the big products are

- **Apple**: the iOS 18 Siri became a glowing light that wraps the screen
  edge and pulses while listening; the iOS 27 redesign (reported May 2026)
  moves it to a **dark colour scheme**. Apple is stepping *away* from bright
  glow.
- **OpenAI**: the voice-mode blob, a soft noise-displaced sphere; developer
  forums are full of requests for it to be *more* expressive, not less.
- The recurring community complaint about all of them: they show *activity*
  but not *attention*. They pulse the same whether or not you are being
  understood.

Sources: [VoiceOrbs](https://voiceorbs.vercel.app/) ·
[orb-ui](https://github.com/alexanderqchen/orb-ui) ·
[MacRumors, iOS 27 Siri dark scheme](https://www.macrumors.com/2026/05/26/ios-27-siri-dark-colors/) ·
[Apple Intelligence Siri glow recreated (dev.to)](https://dev.to/vector4wang/i-recreated-iphones-apple-intelligence-edge-glow-effect-on-mac-57f5) ·
[Spline + OpenAI voice assistant walkthrough](https://www.jackredley.design/articles/how-to-create-an-ai-voice-assistant-using-spline-and-openai)

---

## 4. Codebases, ranked by what they are worth reading for

Cloned and read, not judged by README. Stars as of today.

| Repo | Stars | Read it for |
|---|---|---|
| [eadmin2/jarvis_ai](https://github.com/eadmin2/jarvis_ai) | 127 | The complete hologram **motion grammar** (§2). CSS-only, one file. |
| [ektogamat/threejs-vanilla-holographic-material](https://github.com/ektogamat/threejs-vanilla-holographic-material) | 106 | The **hologram shader** in ~40 lines. |
| [tgcnzn/Interactive-Particles-Music-Visualizer](https://github.com/tgcnzn/Interactive-Particles-Music-Visualizer) | 88 | `pow(d,4)`-gated **curl displacement**; low/mid/high → separate uniforms; beat-synced tweens. |
| [ishaan1013/jarvis](https://github.com/ishaan1013/jarvis) | 55 | Gesture-controlled hologram, R3F; useful for the pointer-parallax feel. |
| [alexanderqchen/orb-ui](https://github.com/alexanderqchen/orb-ui) | 33 | The **state and volume contract** the whole industry uses. |
| [jincocodev/openclaw-jarvis-ui](https://github.com/jincocodev/openclaw-jarvis-ui) | 29 | State → **tempo** mapping; a Three.js orb wired to agent state. |
| [amunozdev/voiceorbs](https://github.com/amunozdev/voiceorbs) | 18 | Fifteen orb implementations side by side; the **Nebula** one is R3F + GLSL. |
| [MuhammadFahru/jarvis-hud](https://github.com/MuhammadFahru/jarvis-hud) | 0 | Three.js globe + MediaPipe over a webcam; the AR framing. |
| [cam-hm/jarvis](https://github.com/cam-hm/jarvis), [harsh-raj00/my-jarvis](https://github.com/harsh-raj00/my-jarvis) | 1–6 | Arc-reactor centrepiece pattern; not much beyond that. |

The honest picture: the GitHub "jarvis" space is hobbyist, and most of it is
the same three ideas (rings, a globe, an arc reactor) with different
backends. The craft lives in the three repos at the top and in the film
designers' accounts.

---

## 5. What this means for Vivid

Vivid already has most of the *technique* the good work uses: a GPU point
cloud, additive blending, bloom, a rim/fresnel term, an audio field, GSAP
state tweens, pointer parallax, a state machine. What the survey argues for
is not more technique. It is these:

**1. She is a character in a conversation, not a display.**
This is the finding every serious source agrees on and the one the fan
projects miss. The design question for every effect is: *what is she doing,
and to whom?* Not "does this look advanced".

**2. Show attention, not just activity.**
The genre's known weakness. Listening should visibly *turn toward the
speaker*: input volume drives the listening state, and the form should
orient, lean, tighten. Thinking should read as *working* (fastest tempo,
inward), speaking as *addressing* (outward, driven by her own voice).
Vivid's `VividState` is `assembling | idle | listening | thinking |
speaking`; the industry contract adds `connecting` and `error`, and the
socket really does spend visible seconds connecting and reconnecting today,
with only a status line to show for it.

**3. Adopt the hologram motion grammar for transitions.**
Approach from depth, structure before content, one scan sweep, then rest;
dismiss by draining colour then receding. State changes should be *events*
with that shape, not crossfades. The assembly sequence already has a stutter
curve; the state transitions do not.

**4. Steal `pow(d,4)`.**
Gate every displacement by its own magnitude so the core stays coherent and
only the outliers fly. It is one line and it is the difference between "a
cloud that jiggles" and "energy shedding off a stable presence".

**5. Split the audio by *source*, and add a beat.**
Checked against the code: the shader already receives `uBands[16]`, `uBass`
and `uTreble`, so the frequency split exists. What does not is the *source*
split. `AudioField` holds one input at a time, the mic **or** the TTS
element, swapped by state, so "her voice" and "your voice" are the same
channel and can never drive different things at once. Two analysers, two
volumes (`inputVolume`, `outputVolume` in the industry contract), and the
listening and speaking states each fed by the right one. Then a beat / onset
detector to give the whole form a tempo, which nothing produces today.

**6. Colour is characterisation, and cyan-everywhere is the cliché.**
The Iron Man team abandoned it in 2008; Apple is going dark in 2026. Vivid's
constellation already has a five-hue ramp; the futuristic move is *restraint*
on top of it, white and near-white for the moments that matter, one accent
for one meaning, and the state hues (cyan / violet / gold) kept as the only
places colour *changes*.

**7. Depth is the medium.**
Several planes, parallax between them, damped follow with more lag under
load. The constellation is one plane today. Even a faint second layer at
another depth, moving at a different rate, would do more than any new effect.

**8. Imperfection reads as real.**
Signal flicker, per-pixel noise, an occasional dropped frame in the scan.
BR2049 went all the way to degradation. A presence that is *too* clean reads
as a screensaver.

Nothing here requires a form library, a mesh, or a photograph. It is all the
constellation, behaving.
