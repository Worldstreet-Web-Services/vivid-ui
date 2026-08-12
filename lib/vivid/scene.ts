import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import gsap from "gsap";
import { buildCore } from "@/lib/vivid/core-geometry";
import { CORE_VERT, CORE_FRAG } from "@/lib/vivid/core-shaders";
import { AudioField } from "@/lib/vivid/audio";
import type { VividState } from "@/lib/vivid/state";

export interface PresenceHandle {
  setState(next: Exclude<VividState, "assembling">): void;
  getState(): VividState;
  attachTts(el: HTMLMediaElement): void;
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

  const uniforms = {
    uTime: { value: 0 },
    uAsm: { value: reduced ? 1 : 0 },
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

  const resize = () => {
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
    if (next === "listening") void audio.attachMic();
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
    });
  } else {
    events.onState("idle", 0);
  }

  // ---- loop ----
  let frame = 0;
  let hidden = false;
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
    for (let i = 0; i < 16; i++) {
      bands[i] += (audio.bands[i] - bands[i]) * 0.4;
      if (i < 4) bass += bands[i] / 4;
      if (i > 11) treble += bands[i] / 4;
    }
    uniforms.uBass.value += (bass - uniforms.uBass.value) * 0.2;
    uniforms.uTreble.value += (treble - uniforms.uTreble.value) * 0.3;
    uniforms.uIntensity.value =
      state === "speaking" ? audio.intensity : audio.intensity * 0.35;

    uniforms.uYaw.value += (targetYaw - uniforms.uYaw.value) * 0.04;
    uniforms.uPitch.value += (targetPitch - uniforms.uPitch.value) * 0.04;

    if (state === "speaking") events.onState(state, audio.intensity);
    composer.render();
  };
  frame = requestAnimationFrame(loop);

  const onVisibility = () => {
    hidden = document.hidden;
  };
  document.addEventListener("visibilitychange", onVisibility);

  return {
    setState,
    getState: () => state,
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
