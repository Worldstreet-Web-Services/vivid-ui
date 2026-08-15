import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import gsap from "gsap";
import { buildCore } from "@/lib/vivid/core-geometry";
import {
  CONSTELLATION,
  clearTargets,
  getTarget,
  registerTarget,
} from "@/lib/vivid/morph-targets";
import {
  alignToReference,
  fitTarget,
  generateBandedTarget,
  resampleTarget,
} from "@/lib/vivid/bands";
import { bustForm, FEMALE, MALE } from "@/lib/vivid/bust";
import { figureTarget } from "@/lib/vivid/figure";
import type { BandedForm } from "@/lib/vivid/bands";
import { decodeForm } from "@/lib/vivid/form-file";
import { towerForm } from "@/lib/vivid/rwa";
import { CORE_VERT, CORE_FRAG } from "@/lib/vivid/core-shaders";
import { AudioField } from "@/lib/vivid/audio";
import type { VividState } from "@/lib/vivid/state";

export interface PresenceHandle {
  setState(next: Exclude<VividState, "assembling">): void;
  getState(): VividState;
  setListeningStream(stream: MediaStream | null): void;
  attachTts(el: HTMLMediaElement): void;
  /**
   * Reorganises the particles into a registered form. Independent of state:
   * the Core can be listening as a car exactly as it listens as itself.
   */
  setMorphTarget(name: string, duration?: number): void;
  getMorphTarget(): string;
  /** True once a form is registered and can be morphed to without a fetch. */
  hasForm(name: string): boolean;
  /**
   * Pins the form on screen so the rotation leaves it alone. Null releases.
   * For the development controls: tuning a car by hand while the rotation
   * takes it away every fifteen seconds is not a workflow.
   */
  holdForm(name: string | null): void;
  getHeldForm(): string | null;
  /**
   * Fetches and registers a baked form, if it is not already loaded.
   *
   * Resolves false when the form does not exist or cannot be read, having
   * logged why. Callers keep showing whatever is on screen rather than
   * treating a missing car as fatal.
   */
  loadForm(name: string): Promise<boolean>;
  dispose(): void;
}

interface PresenceEvents {
  onProgress(pct: number): void;
  onState(state: VividState, intensity: number): void;
}

// Tens of thousands of points in one draw call; there is no honest version of
// the Core without a GPU context. Callers show a message instead.
export class WebGLUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("WebGL is unavailable in this browser.");
    this.name = "WebGLUnavailableError";
    this.cause = cause;
  }
}

export function createPresence(host: HTMLElement, events: PresenceEvents): PresenceHandle {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
  } catch (err) {
    throw new WebGLUnavailableError(err);
  }
  renderer.setClearColor(0x000000, 1);
  host.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  camera.position.set(0, 0.55, 8.2);
  camera.lookAt(0, 0, 0);

  const density = matchMedia("(max-width: 640px)").matches ? 0.55 : 1;
  const built = buildCore(density);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(built.position, 3));
  geometry.setAttribute("aOrbit", new THREE.BufferAttribute(built.orbit, 4));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(built.seed, 1));
  geometry.setAttribute("aTint", new THREE.BufferAttribute(built.tint, 1));
  geometry.setAttribute("aType", new THREE.BufferAttribute(built.type, 1));
  // The morph destination. Seeded with the constellation's own positions, so
  // before any form is registered the target IS where the particle already is
  // and morphing cannot move anything. setMorphTarget() swaps this array.
  const particleCount = built.count;
  geometry.setAttribute(
    "aTarget",
    new THREE.BufferAttribute(Float32Array.from(built.position), 3)
  );
  // Which part of the form a particle belongs to, and how squarely it sits on
  // the silhouette. Both are properties of the TARGET, not of the constellation,
  // so they are swapped alongside aTarget and only read once uMorph lifts.
  geometry.setAttribute("aRegion", new THREE.BufferAttribute(new Float32Array(particleCount), 1));
  geometry.setAttribute("aRim", new THREE.BufferAttribute(new Float32Array(particleCount), 1));
  clearTargets();
  registerTarget(CONSTELLATION, Float32Array.from(built.position), particleCount, null);

  // The forms.
  //
  // None of them is built at boot. Laying out the whole population for one form
  // costs around 65ms on a fast machine and several times that on a phone, and
  // four of them back to back froze the first second of the page — which is
  // exactly when the assembly animation is meant to be playing. They are built
  // on demand instead, and the one she needs first is warmed once the assembly
  // is over and the main thread is free.
  //
  // 4.4 units tall against the ~6.3 the camera sees, so the bust fills the
  // frame the way the reference does without touching the edges.
  const BUST_HEIGHT = 4.4;
  // How a baked form is placed: height in world units, the y its middle sits
  // at, and how much of the visible width it may take. A car is wide and sits
  // low in frame, and the width is what actually sizes it.
  const BAKED_PLACEMENT = { height: 2.8, centreY: 0.2, widthShare: 0.86 };

  // What the camera sees across, at its narrowest. A portrait viewport is the
  // tight case, so forms are fitted for that and simply sit with more room on a
  // wide one.
  const viewWidth = () =>
    6.3 * Math.min(1, host.clientWidth / Math.max(1, host.clientHeight)) * 0.94;

  // The reference is a contour drawing: the interior lines are most of what you
  // see, and the silhouette stroke is what makes it a figure rather than a
  // cloud. Jitter stays well under the band spacing, or the lines blur into
  // each other and it goes back to being a solid mass.
  const GENERATION = {
    count: particleCount,
    bands: 84,
    seed: 20260815,
    interiorShare: 0.42,
    atmosphereShare: 0.1,
    outlineShare: 0.16,
    jitter: 0.0012,
  };

  // Heights are chosen per form rather than shared: a tower reads as a tower by
  // standing taller than anything else, and a bar reads as a bar by lying low.
  // Fitting them all to one height would make the bar a cube and the tower a post.
  //
  // coreShare is how far the form's warmth reaches, as a share of its height. A
  // quarter of the head, so the glow reads as a face rather than lighting the
  // whole bust from inside; a bar is lit nearly throughout, because it is small
  // and the point of it is that the whole thing is gold.
  const PARAMETRIC = new Map<string, { form: BandedForm; height: number; coreShare: number }>([
    // The male bust stays for the form controls. Her form is traced from a
    // scanned bust and arrives with the baked forms.
    ["human-male", { form: bustForm(MALE), height: BUST_HEIGHT, coreShare: 0.14 }],
    ["building", { form: towerForm(), height: 5.2, coreShare: 0.1 }],
  ]);

  function buildParametric(name: string): boolean {
    if (name === "human-female") {
      // Her own generator: contour streams over a relief, not rings around a
      // stack of ellipses. Sized by height alone, so her shoulders run out of
      // the sides of the frame as her chest runs out of the bottom.
      const her = alignToReference(
        fitTarget(figureTarget(FEMALE, { count: particleCount, seed: 20260815 }), 5.6, -0.4),
        built.position
      );
      registerTarget(name, her.positions, particleCount, her.coreAnchor, her.regions, her.rim, 5.6 * 0.12);
      return true;
    }
    const entry = PARAMETRIC.get(name);
    if (!entry) return false;
    const form = alignToReference(
      fitTarget(generateBandedTarget(entry.form, GENERATION), entry.height, 0.2, viewWidth()),
      built.position
    );
    registerTarget(
      name,
      form.positions,
      particleCount,
      form.coreAnchor,
      form.regions,
      form.rim,
      entry.height * entry.coreShare
    );
    return true;
  }

  const uniforms = {
    uTime: { value: 0 },
    uAsm: { value: reduced ? 1 : 0 },
    uMorph: { value: 0 },
    uDissolve: { value: 0 },
    uCoreAnchor: { value: new THREE.Vector3(0, 0, 0) },
    uCoreRadius: { value: 1 },
    uListen: { value: 0 },
    uThink: { value: 0 },
    uSpeak: { value: 0 },
    uIntensity: { value: 0 },
    uBass: { value: 0 },
    uTreble: { value: 0 },
    uBands: { value: new Array(16).fill(0) as number[] },
    uYaw: { value: 0 },
    uPitch: { value: 0 },
    uSizeScale: { value: 1 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: CORE_VERT,
    fragmentShader: CORE_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Points(geometry, material));

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.62, 0.5);
  composer.addPass(bloom);

  // Forms are fitted to the viewport they were built for. Rotating a phone
  // changes that, and a car fitted for portrait sits small on the new width, so
  // everything but the constellation is dropped and rebuilt on next request.
  //
  // Only when the shape of the viewport actually changes: a resize event also
  // fires at boot and while the address bar hides on a phone, and neither of
  // those should throw a form away. Debounced, because a window drag fires
  // many times a second.
  let refitTimer = 0;
  let fittedFor = 0;
  const forgetFittedForms = () => {
    const aspect = host.clientWidth / Math.max(1, host.clientHeight);
    // The same portrait clamp the fit uses: past square, width no longer matters.
    const key = Math.min(1, aspect);
    if (Math.abs(key - fittedFor) < 0.02) return;
    window.clearTimeout(refitTimer);
    refitTimer = window.setTimeout(() => {
      fittedFor = key;
      const home = getTarget(CONSTELLATION);
      const shown = currentTarget;
      clearTargets();
      if (home) registerTarget(CONSTELLATION, home.positions, particleCount, null);
      // Whatever is on screen is rebuilt at once so it does not vanish.
      if (shown !== CONSTELLATION) void loadForm(shown);
    }, 250);
  };

  const resize = () => {
    if (fittedFor === 0) fittedFor = Math.min(1, host.clientWidth / Math.max(1, host.clientHeight));
    else forgetFittedForms();
    const w = host.clientWidth,
      h = host.clientHeight;
    const dpr = Math.min(devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w / 2, h / 2);
    camera.aspect = w / h;
    camera.position.z = w / h < 0.8 ? 10.5 : 8.2;
    camera.updateProjectionMatrix();
    uniforms.uSizeScale.value = dpr * 7.0;
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  // ---- pointer parallax ----
  let targetYaw = 0,
    targetPitch = 0;
  const onPointer = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    targetYaw = ((e.clientX - r.left) / r.width - 0.5) * 0.5;
    targetPitch = ((e.clientY - r.top) / r.height - 0.5) * 0.3;
  };
  host.addEventListener("pointermove", onPointer);

  // ---- state ----
  const audio = new AudioField();
  let state: VividState = reduced ? "idle" : "assembling";
  const weights = {
    listening: uniforms.uListen,
    thinking: uniforms.uThink,
    speaking: uniforms.uSpeak,
  };

  function setState(next: Exclude<VividState, "assembling">) {
    if (state === next) return;
    if (state === "listening" && next !== "listening") audio.detach();
    state = next;
    for (const [k, u] of Object.entries(weights)) {
      gsap.to(u, { value: k === next ? 1 : 0, duration: 1.1, ease: "power2.inOut" });
    }
    if (next === "listening" && !audio.hasInput()) void audio.attachMic();
    events.onState(state, audio.intensity);
  }

  // ---- assembly ----
  if (!reduced) {
    const counter = { pct: 0 };
    const report = () => events.onProgress(Math.round(counter.pct));
    const tl = gsap.timeline();
    tl.to(uniforms.uAsm, { value: 1, duration: 6.4, ease: "power2.out" }, 0);
    tl.to(counter, { pct: 38, duration: 2.2, ease: "power1.in", onUpdate: report }, 0.2);
    tl.to(counter, { pct: 41, duration: 0.8, onUpdate: report }, ">");
    tl.to(counter, { pct: 70, duration: 1.4, ease: "power1.inOut", onUpdate: report }, ">");
    tl.to(counter, { pct: 73, duration: 0.7, onUpdate: report }, ">");
    tl.to(counter, { pct: 100, duration: 1.1, ease: "power2.in", onUpdate: report }, ">");
    tl.call(() => {
      state = "idle";
      events.onState("idle", 0);
      warmHuman();
    });
  } else {
    events.onState("idle", 0);
    warmHuman();
  }

  // ---- loop ----
  let frame = 0;
  let hidden = false;
  let reportedIntensity = -1;
  const started = performance.now();
  const loop = () => {
    frame = requestAnimationFrame(loop);
    if (hidden) return;
    const t = (performance.now() - started) / 1000;
    uniforms.uTime.value = t;
    audio.update(t, state === "speaking");

    const bands = uniforms.uBands.value;
    let bass = 0,
      treble = 0;
    const bandFollow = state === "speaking" ? 0.68 : 0.4;
    for (let i = 0; i < 16; i++) {
      bands[i] += (audio.bands[i] - bands[i]) * bandFollow;
      if (i < 4) bass += bands[i] / 4;
      if (i > 11) treble += bands[i] / 4;
    }
    uniforms.uBass.value += (bass - uniforms.uBass.value) * (state === "speaking" ? 0.34 : 0.2);
    uniforms.uTreble.value +=
      (treble - uniforms.uTreble.value) * (state === "speaking" ? 0.42 : 0.3);

    const spectralPulse = Math.min(1, bass * 0.85 + treble * 0.45);
    const targetIntensity =
      state === "speaking"
        ? Math.min(1, audio.intensity * 1.08 + spectralPulse * 0.72)
        : audio.intensity * 0.35;
    const intensityFollow =
      state === "speaking"
        ? targetIntensity > uniforms.uIntensity.value
          ? 0.42
          : 0.16
        : 0.12;
    uniforms.uIntensity.value += (targetIntensity - uniforms.uIntensity.value) * intensityFollow;
    const bloomTarget =
      state === "speaking"
        ? Math.min(0.52, 0.34 + 0.11 * uniforms.uIntensity.value + 0.08 * spectralPulse)
        : 0.32;
    bloom.strength += (bloomTarget - bloom.strength) * 0.18;

    uniforms.uYaw.value += (targetYaw - uniforms.uYaw.value) * 0.04;
    uniforms.uPitch.value += (targetPitch - uniforms.uPitch.value) * 0.04;

    // The consumer buckets this into three levels, so emitting every frame was
    // a React render per frame to choose between three strings.
    if (state === "speaking" && Math.abs(audio.intensity - reportedIntensity) > 0.04) {
      reportedIntensity = audio.intensity;
      events.onState(state, audio.intensity);
    }
    composer.render();
  };
  frame = requestAnimationFrame(loop);

  const onVisibility = () => {
    hidden = document.hidden;
  };
  document.addEventListener("visibilitychange", onVisibility);

  // Swaps the destination form and tweens toward it. Writing the array rather
  // than rebuilding the geometry is what keeps particle identity: the same
  // buffer slot is the same particle, it just has somewhere new to be.
  //
  // The write costs one pass over the target array and happens once per form
  // change, not per frame.
  const targetAttr = geometry.getAttribute("aTarget") as THREE.BufferAttribute;
  const regionAttr = geometry.getAttribute("aRegion") as THREE.BufferAttribute;
  const rimAttr = geometry.getAttribute("aRim") as THREE.BufferAttribute;
  let currentTarget = CONSTELLATION;
  let heldForm: string | null = null;

  const setMorphTarget = (name: string, duration = 2.4) => {
    const next = getTarget(name);
    if (!next || name === currentTarget) return;
    currentTarget = name;

    if (name === CONSTELLATION) {
      // Home is where the particles already belong, so it is a retreat of
      // uMorph rather than a new destination to fly to — with a burst of
      // scatter over the top, peaking in the middle, so the form comes apart
      // instead of unwinding.
      gsap.to(uniforms.uMorph, { value: 0, duration, ease: "power1.in" });
      gsap.timeline()
        .to(uniforms.uDissolve, { value: 1, duration: duration * 0.42, ease: "power2.out" })
        .to(uniforms.uDissolve, { value: 0, duration: duration * 0.58, ease: "power2.inOut" });
      return;
    }

    // Land at 0 first so the tween starts from the constellation whatever was
    // on screen; without this, swapping form to form snaps.
    gsap.killTweensOf(uniforms.uMorph);
    gsap.killTweensOf(uniforms.uDissolve);
    uniforms.uMorph.value = 0;
    uniforms.uDissolve.value = 0;
    (targetAttr.array as Float32Array).set(next.positions);
    targetAttr.needsUpdate = true;
    const regions = regionAttr.array as Float32Array;
    for (let i = 0; i < regions.length; i++) regions[i] = next.regions[i];
    regionAttr.needsUpdate = true;
    (rimAttr.array as Float32Array).set(next.rim);
    rimAttr.needsUpdate = true;
    const [ax, ay, az] = next.coreAnchor ?? [0, 0, 0];
    uniforms.uCoreAnchor.value.set(ax, ay, az);
    uniforms.uCoreRadius.value = next.coreRadius;
    gsap.to(uniforms.uMorph, { value: 1, duration, ease: "power2.inOut" });
  };

  // She is fetched the moment the assembly finishes, not the moment she is
  // needed. The rotation waits fourteen seconds before its first showcase but a
  // visitor can press START at once, and the one form that must never arrive
  // late is the one she becomes when spoken to.
  function warmHuman() {
    void loadForm("human-female");
  }

  // ---- baked forms, fetched when the rotation first asks for one ----
  //
  // The cars and the router are about 2.2MB between them and most visits never
  // reach the end of the rotation, so none of it is loaded at boot. A form is
  // fetched once, registered, and kept: the second showing is instant.
  const inFlight = new Map<string, Promise<boolean>>();

  const loadForm = (name: string): Promise<boolean> => {
    if (getTarget(name)) return Promise.resolve(true);
    // Parametric forms are computed, not fetched. Same entry point either way,
    // so callers never need to know which kind a name is.
    if (name === "human-female" || PARAMETRIC.has(name)) {
      return Promise.resolve(buildParametric(name));
    }
    const already = inFlight.get(name);
    if (already) return already;

    const work = fetch(`/forms/${name}.bin`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const decoded = decodeForm(await res.arrayBuffer());
        // Baked in the form's own units standing 1 tall, so it is fitted here,
        // where the viewport is known. A car is nearly four times longer than
        // it is tall and the width clamp is what actually governs its size.
        // Baked at full density; a phone builds about half as many particles,
        // and a form whose count disagrees is refused outright.
        const place = BAKED_PLACEMENT;
        const fitted = alignToReference(
          fitTarget(
            resampleTarget(decoded, particleCount),
            place.height,
            place.centreY,
            // A car is wide enough to hit this, so it is what actually sizes
            // it. Short of the full view, so it sits in frame with room either
            // side rather than running off both edges.
            viewWidth() * place.widthShare
          ),
          built.position
        );
        registerTarget(
          name,
          fitted.positions,
          particleCount,
          fitted.coreAnchor,
          fitted.regions,
          fitted.rim
        );
        return true;
      })
      .catch((err) => {
        // A car that will not load is not worth breaking the presence over.
        console.warn(`[vivid] form "${name}" could not be loaded`, err);
        return false;
      })
      .finally(() => {
        inFlight.delete(name);
      });

    inFlight.set(name, work);
    return work;
  };

  return {
    setState,
    getState: () => state,
    setMorphTarget,
    getMorphTarget: () => currentTarget,
    hasForm: (name) => Boolean(getTarget(name)),
    loadForm,
    holdForm: (name) => {
      heldForm = name;
    },
    getHeldForm: () => heldForm,
    setListeningStream: (stream) => {
      if (stream) {
        audio.attachStream(stream);
        return;
      }
      audio.detach();
    },
    attachTts: (el) => audio.attachElement(el),
    dispose() {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointermove", onPointer);
      observer.disconnect();
      audio.detach();
      gsap.globalTimeline.clear();
      geometry.dispose();
      material.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
