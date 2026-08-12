# VIVID — end-to-end build brief

You are building the web presence of **VIVID**, a voice AI with a female
identity. The four attached videos are the reference. The goal is an exact
reproduction of what they show, re-proportioned female, then refined past it.
The reference product is a black-box demo; these videos are the only source of
truth, so every detail in this brief was extracted from them frame by frame.
Treat this document as the specification and the videos as the visual ground
truth.

Vivid speaks **English, Yorùbá, Igbo, Hausa and Pidgin**.

There are two screens. Build them in this order:

1. **The Presence** — a full-viewport particle bust. This is the identity and
   90 percent of the work. It must be right before anything else is attempted.
2. **The Hub** — a command dashboard with a particle core and agent nodes.

---

## Part 1 — THE PRESENCE

A single full-viewport canvas. True black. One figure: a bust from crown to
mid-chest, centred, occupying roughly the middle 40 percent of the viewport
width. No nav, no copy, no logo. Three pieces of chrome only: an `EXIT` chip
top-left, a status line mid-right, a language chip bottom-right.

### 1.1 What the figure is

A **3D point cloud** rendered as glowing dots, structured as horizontal
contour rings — the latitude lines of a three-dimensional bust. Not a 2D
drawing, not an outline, not a mesh render. In the reference the head turns in
3D and the contour lines wrap real facial topology: they bulge over the brow
and cheekbones, tighten around the neck cylinder, and cascade over the
shoulders. This is only achievable if the points genuinely live in 3D.

**Construct the bust parametrically in code** (no external model file):

- Build a signed-distance function of a female bust: a rounded skull ellipsoid,
  a tapering jaw blended beneath it, a slim neck cylinder, and a shoulder mass
  made of two blended capsules sweeping down and outward.
- Slice it with ~60 horizontal planes from crown to chest. For each plane,
  extract the contour ring and place **beads** along it: individual points,
  1 to 2 px, with slightly irregular spacing so the chains never look machined.
- Ring spacing is tighter over the skull (~40 rings on the head alone) and
  opens slightly down the chest.
- Store per point: 3D position on the form, ring index, angle around the ring,
  distance-to-silhouette weight, and a personal random seed.

Render with additive blending and a soft radial falloff per point, then a
strong bloom pass. **Bloom is not optional**; the entire look collapses
without it.

### 1.2 The edge — the most important paragraph in this brief

**There is no stroke and no outline anywhere.** The bright silhouette edge is
emergent:

- points whose ring position faces the viewer at a grazing angle (the
  silhouette from the current camera angle) render **brighter and slightly
  larger** — this is the 3D equivalent of endpoints stacking up
- bloom spreads that accumulated brightness into a rim of light
- just outside the silhouette, a scatter of loose particles drifts outward,
  thinning over 20 to 30 px: dense core, separated dots, isolated specks, black

From a distance it reads as a luminous edge. Up close it must dissolve into
individual pieces of light. Test: if any part of the silhouette can be traced
as an unbroken line, it is wrong.

### 1.3 The anatomy of light — every component seen in the videos

- **The face.** From brow to just below where a mouth would sit, the same
  contour rings turn warm — amber through gold — and gain **wave
  displacement**: each ring ripples like a waveform. The colour hands over
  line by line across the boundary, never at a hard edge. At the centre of the
  wave the crests go near-white. This region is not a separate object; it is a
  recoloured, displaced part of the one field. The voice is the face.
- **Ears.** At the widest point of the head the contour lines curl into two
  small **spiral knots**, one per side, slightly brighter than their
  neighbours. Small; suggestions, not lamps.
- **Crown strands.** Off the whole top of the skull, fine **vertical
  filaments** rise about 15 percent of head height and fade — parallel,
  slightly wavy, like hair rendered as spray. Points detach and drift up along
  them. This is a large part of why she reads alive, and for Vivid it is also
  the hair: make it fuller, longer and slower-moving than the reference.
- **Throat filaments.** Three or four **bright gold branching strands** run
  from under the jaw down the throat, branch over the sternum like roots or
  lightning, with side branches toward the collarbones. Distinct from the
  contour field, warmer and sharper. They pulse a beat behind the voice.
- **Chest arcs.** Below the collarbones the contour lines curl into large
  **nested concentric arcs** on each side of the chest, like ripples frozen
  into the form. The torso interior is dimmer — deep blue points, sparse — so
  the bright rim and arcs carry the form.
- **Field motes.** A few hundred 1 to 2 px dim particles drifting slowly in
  the black around her. Texture, not bokeh: never large soft circles.
- **Listening rings.** In LISTENING, faint **dotted concentric rings** radiate
  from behind the head across the whole canvas — a dozen of them, expanding
  slowly outward and fading, like sonar. They vanish in other states.

### 1.4 Motion — she is never still

- **Breathing.** The whole cloud swells and settles on a slow cycle, subtle,
  shoulders more than head.
- **Head tracking.** The bust yaws and pitches a few degrees toward the cursor
  (or touch), with soft easing and a slow return to centre when idle. The
  contour rings must visibly wrap the rotating 3D form — this is where the 3D
  construction pays off. On fast movement, brief **horizontal glitch slices**
  displace a few bands of the head sideways for a frame or two, then heal.
- **Idle drift.** Every point carries a little curl-noise wander around its
  home position, so the surface shimmers.
- **Per-point flicker.** Individual points vary brightness on their own seeds,
  a candle-field effect, most visible on the rim.

### 1.5 The female identity

The reference figure is male: broad jaw, thick neck, square shoulders. Vivid
is not. Get femaleness from **silhouette, ratio and rhythm** — no lashes, no
lips, no makeup, no jewellery, no decoration.

All units in head heights (HH), crown to chin:

| Measurement                   | Vivid   | Reference (male) | Note                              |
| ----------------------------- | ------- | ---------------- | --------------------------------- |
| Head width at cheekbones      | 0.68 HH | 0.75 HH          | Widest point is the cheekbones    |
| Jaw width at the angle        | 0.55 HH | 0.68 HH          | One continuous curve, no corners  |
| Chin width                    | 0.20 HH | 0.30 HH          | Tapered and rounded               |
| **Neck length**               | 0.46 HH | 0.33 HH          | **The strongest cue. Give it room** |
| Neck width                    | 0.30 HH | 0.42 HH          | Tapers slightly upward            |
| **Shoulder span**             | 1.65 HH | 2.15 HH          | **Second strongest**              |
| Shoulder slope                | 24°     | 15°              | Sloping, never square             |

Tuning order when it looks wrong: reads masculine → lengthen the neck first;
reads childlike → widen the shoulders, never shrink the skull; jaw shows a
corner → re-curve it, a two-segment jaw reads male instantly. Her breathing is
slower and shallower than you would give a male figure; the crown strands are
her hair — fuller and softer than the reference's spray.

### 1.6 Colour

- `#000000` ground
- `#0A2A44` deep navy, dim interior points
- `#00A8E8` → `#00C8FF` cyan base of the field
- `#7DF3FF` bright cyan, silhouette and crown
- `#FF6A00` → `#FFB03A` amber and gold, the face and throat filaments
- `#FFF4C2` near-white gold, wave crests and the filament cores

Amber exists only in the face and the throat filaments. Nothing else on the
page is warm. Cyan and amber meet only by the line-by-line handover on the
face boundary.

### 1.7 States

`ASSEMBLING → IDLE ↔ LISTENING ↔ THINKING ↔ SPEAKING`

Status line, mid-right, tiny uppercase letterspaced monospace in cyan:

- `STATUS: IDLE`
- `STATUS: LISTENING`
- `STATUS: THINKING`
- `STATUS: SPEAKING  INTENSITY: LOW|MED|HIGH` — intensity from live loudness

Transitions scramble the characters for ~400ms then **always resolve to clean
text**. Never rest on garbage.

Per state:

- **IDLE** — face nearly flat, amber dimmed, slow breath. Rings off.
- **LISTENING** — mic drives a low undulation; dotted rings radiate; rim
  brightens slightly.
- **THINKING** — the face lines desynchronise and drift at different phases,
  restless, low amplitude; occasional single glitch slice; throat filaments
  dim.
- **SPEAKING** — the output audio drives everything: per-band amplitudes map
  to face lines (low bands to the lower lines), crests flare toward
  `#FFF4C2`, the amber region widens with intensity until at HIGH it fills
  nearly the whole face, bloom swells, throat filaments surge a beat behind,
  and the whole figure leans a degree or two into the speech.

**Audio is real.** A Web Audio `AnalyserNode` on the actual TTS output, FFT
bands mapped to lines. Microphone (with permission) in LISTENING. With no
audio, a seeded noise field that never visibly loops. A canned CSS-style loop
is a hard failure — if the mouth is not the sound, there is no product.

### 1.8 The assembly — first load only, ~8 seconds

1. **0.0s** Black. A white-hot star with a wide blue halo, low centre —
   at the point where the sternum will be.
2. **0.3s** It emits: particles stream out in an arc, fast then decelerating.
   `EXIT` fades in. `ASSEMBLING... 0%` starts counting, mid-right.
3. **0.5–5.0s** The stream spirals counter-clockwise into a loose nebula the
   size of the figure. Settling is **directional**: one side of the bust
   resolves first — finished contour rings, bright rim — while the other side
   is still raw dust streaming in the wind. The boundary between settled and
   unsettled sweeps across the figure. The counter stalls near 38, again near
   70, then finishes fast.
4. **5.0–6.5s** Remaining points fly home, each easing in on its own delay —
   crystallisation, not a snap.
5. **6.5–7.5s** The face warms line by line from the centre out; the throat
   filaments ignite downward from the jaw; the crown strands begin to rise.
6. **7.5s** Counter becomes `STATUS: IDLE` via the scramble. The emitter star
   fades out completely and must never be visible again.

`prefers-reduced-motion`: skip to her formed, keep the waveform and breath.

### 1.9 Chrome

- **EXIT** top-left: cyan text in a thin rounded-rect border; border brightens
  on hover, no scale, no bounce. It navigates to the Hub.
- **Status line** mid-right as specified.
- **Language chip** bottom-right: `EN`, cycling through `EN · YO · IG · HA ·
  PCM` on click. The active language governs her greeting and voice.

---

## Part 2 — THE HUB

The reference's second screen, rebuilt for Vivid. A deep blue command room —
this one is **not** black: a radial navy field, `#04182E` centre to `#020B18`
edges, crossed by slow-drifting fine light wisps (long faint curves, barely
brighter than the ground).

- **The core.** Centre screen: a ring of molten gold light, interior filled
  with a dense churn of thousands of tiny cyan particles slowly orbiting. The
  ring breathes. On voice activity its glow pulses with the same analyser that
  drives the Presence face. Clicking it opens the Presence. Under it, the hint
  `TAP THE CORE · CLICK AN AGENT` in small letterspaced caps.
- **Agent nodes.** Small circles radiating outward on thin circuit lines with
  right-angle elbows, each labelled: Strategist, Researcher, Chief of Staff,
  Finance, Editor, Memory, Design, Engineering, Social, CRM, Ops, Marketing,
  Sales, Developer, Analytics. Outer ring, dimmer: Drive, Email, Calendar.
  Two node colours: gold for acting agents, cyan for passive ones. Hover
  brightens the node and its line; click pulses a signal along the line to the
  core.
- **Top-left stack:** large clock (24h), date, weather line, then
  `GOOD EVENING, <NAME>` — greeting localised to the active language
  (`E kaasan`, `Ndeewo`, `Ina kwana`, `How far` — use correct phrasing per
  time of day), an ON THIS DAY fact line, and a system line
  `VIVID · LOCAL · VOICE — all systems nominal` with green dots.
- **Top-centre:** live chip `● LISTENING · TAP TO STOP` while the mic is open.
- **Bottom-centre:** a small live waveform bar with the state word under it,
  flanked by `CHAT` and `VOICE ON` pills and the language chip.
- Everything sits on a very subtle grid; text is the same letterspaced
  monospace family as the Presence chrome.

---

## Part 3 — Build notes

- **Stack:** Three.js (WebGL2) with custom point shaders; GSAP for the master
  assembly timeline and state transitions; Web Audio API for analysis. If
  Three.js is unavailable in the environment, write raw WebGL2 — the design
  depends on tens of thousands of points in one draw call and cannot be built
  from DOM elements, SVG, or 2D canvas strokes.
- All animation of points happens on the GPU: attributes carry home position,
  seed, ring index, weight; uniforms carry time, state, assembly progress,
  audio bands (as a small data texture), head rotation, breath phase.
- **Bloom:** render the bright pass to a framebuffer, blur (dual-pass), add
  back. Prefer this over more particles every time.
- One page, two views, crossfading through black. No external network
  requests; inline fonts and everything else.
- 60fps on a mid-range laptop: scale point counts by device pixel ratio and
  viewport; pause the loop when the tab is hidden.
- On phones the Presence crops to head and shoulders; the Hub stacks the
  top-left stack above the core.

## Part 4 — Do not

- No stroked outline on the figure, anywhere, ever.
- No eyes, nose, mouth, or any facial feature. The waveform is the face.
- No separate amber shape layered over the face; it is the same field
  recoloured.
- No purple, no magenta, no blue-to-purple gradients.
- No large soft background circles; motes are 1 to 2 px.
- No emitter star visible after assembly.
- No status text resting on scrambled characters.
- No canned looping animation standing in for audio reactivity.
- No photographic or AI-generated imagery anywhere; everything is points.
