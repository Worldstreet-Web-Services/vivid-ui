"use client";

import { useEffect, useRef, useState } from "react";
import { createPresence, WebGLUnavailableError, type PresenceHandle } from "@/lib/vivid/scene";
import {
  ASSEMBLING,
  GREETING,
  INTENSITY,
  LANGUAGES,
  LANGUAGE_NAMES,
  STATE_LINE,
  type Language,
  type VividState,
} from "@/lib/vivid/state";
import { LanguageSelect } from "@/components/ui/language-select";
import { StateReadout } from "@/components/hud/state-readout";
import { StatusStrip } from "@/components/hud/status-strip";
import { TalkRing } from "@/components/hud/talk-ring";
import { ViewportFrame } from "@/components/hud/viewport-frame";

const GLYPHS = "!<>-_\\/[]{}=+*^?#";
const WS_ENDPOINTS = [
  process.env.NEXT_PUBLIC_VIVID_WS_URL,
  "wss://qwxeep3sudzk43-8002.proxy.runpod.net/ws",
  "wss://8e07lkd5a2eyga-8002.proxy.runpod.net/ws",
].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
const TARGET_SAMPLE_RATE = 16000;
const AUDIO_BUFFER_SIZE = 2048;
const VOICE_LANG_BY_UI: Record<Language, string> = {
  EN: "en",
  YO: "yo",
  IG: "ig",
  HA: "ha",
  PCM: "pcm",
};

// Scrambles toward the target and always resolves to clean text (brief §1.7).
function useScramble(target: string) {
  const [text, setText] = useState(target);
  const raf = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 420);
      setText(
        target
          .split("")
          .map((ch, i) =>
            i / target.length < p || ch === " "
              ? ch
              : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
          )
          .join(""),
      );
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);
  return text;
}

export function PresenceCanvas() {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<PresenceHandle>(null);
  const [assembling, setAssembling] = useState(true);
  const [pct, setPct] = useState(0);
  const [state, setState] = useState<VividState>("assembling");
  const [intensity, setIntensity] = useState(0);
  const [lang, setLang] = useState<Language>("EN");
  const [connected, setConnected] = useState(false);
  // Read by the presence callback, which is created once and would otherwise
  // close over the first render's value.
  const connectedRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [networkStatus, setNetworkStatus] = useState("connecting...");
  const root = useRef<HTMLElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const recordingRef = useRef(false);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const startRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const stopRecordingRef = useRef<(() => void) | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const currentAudioUrlRef = useRef<string | null>(null);
  const playingQueuedAudioRef = useRef(false);

  useEffect(() => {
    if (!host.current) return;
    try {
      const presence = createPresence(host.current, {
        onProgress: setPct,
        onState: (s, i) => {
          setState(s);
          setIntensity(i);
          if (s !== "assembling") setAssembling(false);
          // Assembly has just finished and she has gone idle by default. If
          // the socket has not opened yet she is not actually ready, so she
          // shows that instead of looking present with no line behind her.
          if (s === "idle" && !connectedRef.current) presence.setState("connecting");
        },
      });
      handle.current = presence;
      if (ttsAudioRef.current) presence.attachTts(ttsAudioRef.current);
      return presence.dispose;
    } catch (err) {
      if (err instanceof WebGLUnavailableError) {
        // Updating the DOM from an effect, rather than cascading a re-render.
        root.current?.setAttribute("data-gpu", "off");
        return;
      }
      throw err;
    }
  }, []);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);
  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  useEffect(() => {
    let disposed = false;

    const clearAudioQueue = () => {
      if (currentAudioUrlRef.current) {
        URL.revokeObjectURL(currentAudioUrlRef.current);
        currentAudioUrlRef.current = null;
      }
      for (const url of audioQueueRef.current) URL.revokeObjectURL(url);
      audioQueueRef.current = [];
      playingQueuedAudioRef.current = false;
    };

    const stopTtsPlayback = () => {
      const audio = ttsAudioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.removeAttribute("src");
      }
    };

    const setVoiceIdle = () => {
      setNetworkStatus("ready");
      handle.current?.setState("idle");
    };

    const playNextQueuedAudio = () => {
      const audio = ttsAudioRef.current;
      if (!audio) return;
      const nextUrl = audioQueueRef.current.shift();
      if (!nextUrl) {
        playingQueuedAudioRef.current = false;
        setVoiceIdle();
        return;
      }

      playingQueuedAudioRef.current = true;
      currentAudioUrlRef.current = nextUrl;
      audio.src = nextUrl;
      handle.current?.setState("speaking");
      setNetworkStatus("🔊 speaking");
      void audio.play().catch(() => {
        handle.current?.setState("idle");
        setNetworkStatus("tap anywhere to allow audio");
        playingQueuedAudioRef.current = false;
      });
    };

    const enqueueWavBuffer = (buffer: ArrayBuffer) => {
      console.log("[vivid/ws] server audio frame", { bytes: buffer.byteLength });
      const blobUrl = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
      audioQueueRef.current.push(blobUrl);
      if (!playingQueuedAudioRef.current) playNextQueuedAudio();
    };

    // She shows the connection now: waking while the socket finds the voice
    // service, here once it has, and the lost line if it keeps failing. Only
    // once she has assembled, though: assembly is its own moment and outranks
    // the socket.
    let failures = 0;
    const showConnection = (s: "connecting" | "idle" | "error") => {
      const presence = handle.current;
      if (!presence || presence.getState() === "assembling") return;
      // Never interrupt her while she is being spoken to or speaking.
      const busy = presence.getState();
      if (busy === "listening" || busy === "thinking" || busy === "speaking") return;
      presence.setState(s);
    };

    const connect = (endpointIndex: number) => {
      const wsUrl = WS_ENDPOINTS[endpointIndex % WS_ENDPOINTS.length];
      const wsHost = (() => {
        try {
          return new URL(wsUrl).host;
        } catch {
          return wsUrl;
        }
      })();
      console.info("[vivid/ws] connecting", wsHost);
      setNetworkStatus("connecting…");
      // Three straight failures across the endpoints and the line is lost;
      // until then she is waking. She keeps retrying either way.
      showConnection(failures >= 3 ? "error" : "connecting");
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        failures = 0;
        setConnected(true);
        setNetworkStatus("ready");
        showConnection("idle");
      };

      ws.onclose = () => {
        if (disposed) return;
        failures += 1;
        setConnected(false);
        console.info("[vivid/ws] reconnecting", wsHost);
        setNetworkStatus("reconnecting…");
        // Keep any in-flight speech playing; a socket reconnect should not cut
        // off audio already received and queued locally.
        if (recordingRef.current) {
          recordingRef.current = false;
          setRecording(false);
          releaseCapture();
          handle.current?.setState("idle");
        }
        reconnectRef.current = window.setTimeout(() => {
          connect(endpointIndex + 1);
        }, 2000);
      };

      ws.onerror = () => {
        if (disposed) return;
        console.warn("[vivid/ws] connection error", wsHost);
        setNetworkStatus("connection error");
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          enqueueWavBuffer(event.data);
          return;
        }

        if (event.data instanceof Blob) {
          void event.data.arrayBuffer().then((buffer) => {
            enqueueWavBuffer(buffer);
          });
          return;
        }

        const rawText = String(event.data);

        const payload = JSON.parse(rawText) as
          | {
              type: "transcript";
              text?: string;
            }
          | {
              type: "translation_en";
              text?: string;
              suspect?: boolean;
              reason?: string;
            }
          | {
              type: "reply_en";
              text?: string;
            }
          | {
              type: "reply";
              text?: string;
              fallback?: boolean;
              language?: string;
            }
          | {
              type: "reply_chunk";
              text?: string;
              language?: string;
            }
          | {
              type: "reply_done";
              text?: string;
              language?: string;
            }
          | {
              type: "reset_ok";
            }
          | {
              type: "tts_error";
            }
          | {
              type: "error";
              msg: string;
            };
        console.log("[vivid/ws] server payload", payload);

        if (payload.type === "transcript") {
          setNetworkStatus("translating...");
          return;
        }

        if (payload.type === "translation_en") {
          setNetworkStatus("thinking...");
          return;
        }

        if (payload.type === "reply_en") {
          setNetworkStatus("translating back...");
          return;
        }

        if (payload.type === "reply") {
          setNetworkStatus("thinking...");
          handle.current?.setState("thinking");
          return;
        }

        if (payload.type === "reply_chunk") {
          setNetworkStatus("thinking...");
          handle.current?.setState("thinking");
          return;
        }

        if (payload.type === "reply_done") {
          setNetworkStatus("thinking...");
          handle.current?.setState("thinking");
          return;
        }

        if (payload.type === "reset_ok") {
          stopTtsPlayback();
          clearAudioQueue();
          setNetworkStatus("new chat - ready");
          handle.current?.setState("idle");
          return;
        }

        if (payload.type === "tts_error") {
          setNetworkStatus("voice unavailable (text only)");
          handle.current?.setState("idle");
          return;
        }

        if (payload.type === "error") {
          setNetworkStatus(`error: ${payload.msg}`);
          handle.current?.setState("idle");
        }
      };
    };

    connect(0);

    return () => {
      disposed = true;
      stopTtsPlayback();
      clearAudioQueue();
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const audio = new Audio();
    ttsAudioRef.current = audio;
    if (handle.current) handle.current.attachTts(audio);
    const settleIdleIfPlaybackFinished = () => {
      if (audioQueueRef.current.length > 0) return;
      if (!audio.paused) return;
      if (playingQueuedAudioRef.current) return;
      setNetworkStatus("ready");
      handle.current?.setState("idle");
    };
    const onEnded = () => {
      if (currentAudioUrlRef.current) {
        URL.revokeObjectURL(currentAudioUrlRef.current);
        currentAudioUrlRef.current = null;
      }
      const queue = audioQueueRef.current;
      if (queue.length > 0) {
        playingQueuedAudioRef.current = false;
        const next = queue.shift();
        if (!next) {
          setNetworkStatus("ready");
          handle.current?.setState("idle");
          return;
        }
        playingQueuedAudioRef.current = true;
        currentAudioUrlRef.current = next;
        audio.src = next;
        handle.current?.setState("speaking");
        setNetworkStatus("🔊 speaking");
        void audio.play().catch(() => {
          handle.current?.setState("idle");
          setNetworkStatus("tap anywhere to allow audio");
          playingQueuedAudioRef.current = false;
        });
        return;
      }

      playingQueuedAudioRef.current = false;
      settleIdleIfPlaybackFinished();
    };
    const onPause = () => {
      // Fallback: some environments miss `ended`; pause+empty queue means done.
      window.setTimeout(settleIdleIfPlaybackFinished, 60);
    };
    const onError = () => {
      if (currentAudioUrlRef.current) {
        URL.revokeObjectURL(currentAudioUrlRef.current);
        currentAudioUrlRef.current = null;
      }
      playingQueuedAudioRef.current = false;
      setNetworkStatus("voice unavailable (text only)");
      handle.current?.setState("idle");
    };
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);
    return () => {
      audio.pause();
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
      if (currentAudioUrlRef.current) URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
      for (const url of audioQueueRef.current) URL.revokeObjectURL(url);
      audioQueueRef.current = [];
      playingQueuedAudioRef.current = false;
      ttsAudioRef.current = null;
    };
  }, []);

  function releaseCapture() {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());

    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;

    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    handle.current?.setListeningStream(null);
  }

  const startRecording = async () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setNetworkStatus("not connected yet");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNetworkStatus("mic permission denied");
      return;
    }

    streamRef.current = stream;
    handle.current?.setListeningStream(stream);
    handle.current?.setState("listening");

    ws.send(
      JSON.stringify({
        type: "start",
        lang: VOICE_LANG_BY_UI[lang],
      }),
    );

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;

    const source = audioCtx.createMediaStreamSource(stream);
    sourceRef.current = source;

    const processor = audioCtx.createScriptProcessor(AUDIO_BUFFER_SIZE, 1, 1);
    processorRef.current = processor;

    const inputRate = audioCtx.sampleRate;
    processor.onaudioprocess = (event) => {
      const socket = wsRef.current;
      if (!recordingRef.current || !socket || socket.readyState !== WebSocket.OPEN) return;

      const input = event.inputBuffer.getChannelData(0);
      const outputLength = Math.round((input.length * TARGET_SAMPLE_RATE) / inputRate);
      const pcm = new Int16Array(outputLength);

      for (let i = 0; i < outputLength; i += 1) {
        const position = (i * inputRate) / TARGET_SAMPLE_RATE;
        const i0 = Math.floor(position);
        const i1 = Math.min(i0 + 1, input.length - 1);
        const sample = input[i0] + (input[i1] - input[i0]) * (position - i0);
        pcm[i] = Math.max(-1, Math.min(1, sample)) * 0x7fff;
      }

      socket.send(pcm.buffer);
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);

    recordingRef.current = true;
    setRecording(true);
    setNetworkStatus("recording... speak now");
  };

  const stopRecording = () => {
    if (!recordingRef.current) return;

    recordingRef.current = false;
    setRecording(false);
    releaseCapture();
    handle.current?.setState("thinking");

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "stop" }));
    }

    setNetworkStatus("transcribing...");
  };

  startRecordingRef.current = startRecording;
  stopRecordingRef.current = stopRecording;

  const resetConversation = () => {
    if (recordingRef.current) {
      recordingRef.current = false;
      setRecording(false);
      releaseCapture();
    }

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ttsAudioRef.current?.pause();
      ttsAudioRef.current?.removeAttribute("src");
      ws.send(JSON.stringify({ type: "reset" }));
      setNetworkStatus("new chat...");
      if (currentAudioUrlRef.current) URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
      for (const url of audioQueueRef.current) URL.revokeObjectURL(url);
      audioQueueRef.current = [];
      playingQueuedAudioRef.current = false;
      return;
    }

    setNetworkStatus("not connected yet");
  };

  useEffect(() => {
    const isInteractiveTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return true;
      return Boolean(target.closest("button,[role='button'],[role='option'],[role='listbox']"));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      if (event.repeat) return;
      if (isInteractiveTarget(event.target)) return;

      event.preventDefault();
      if (assembling || !connected) return;

      if (recordingRef.current) {
        stopRecordingRef.current?.();
        return;
      }
      void startRecordingRef.current?.();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [assembling, connected]);

  useEffect(() => {
    return () => {
      recordingRef.current = false;
      setRecording(false);
      ttsAudioRef.current?.pause();
      releaseCapture();
    };
  }, []);

  const settled = assembling ? null : (state as Exclude<VividState, "assembling">);
  const status = useScramble(
    assembling ? `${ASSEMBLING[lang]}... ${pct}%` : STATE_LINE[lang][settled ?? "idle"],
  );
  const loudness = intensity > 0.55 ? "high" : intensity > 0.3 ? "med" : "low";

  return (
    <main ref={root} className="group fixed inset-0 bg-black font-hud select-none data-[gpu=off]:grid data-[gpu=off]:place-items-center">
      <div className="pointer-events-none absolute inset-0 hidden place-items-center px-8 text-center group-data-[gpu=off]:grid">
        <div className="max-w-[46ch] space-y-4">
          <p className="text-[13px] tracking-[0.3em] text-silver-bright">VIVID NEEDS A GPU</p>
          <p className="text-[11px] leading-relaxed tracking-[0.16em] text-silver-bright/55">
            Graphics acceleration is switched off in this browser, so her form cannot be drawn.
            Enable it in settings, relaunch, and she will assemble.
          </p>
        </div>
      </div>

      <div ref={host} className="absolute inset-0 group-data-[gpu=off]:hidden" />

      {/* The frame the instrument lives in: the first thing drawn at boot. */}
      <div className="group-data-[gpu=off]:hidden">
        <ViewportFrame />
      </div>

      {/* her name, and what she is */}
      <div
        className="hud-motion absolute left-10 top-9 sm:left-12 sm:top-10 group-data-[gpu=off]:hidden"
        style={{ animation: "hud-panel-in 0.55s 350ms both" }}
      >
        {/* Pulses while she assembles, the boot wordmark; holds once she is here. */}
        <p
          className="font-display text-[13px] font-semibold sm:text-[15px] tracking-[0.5em] sm:tracking-[0.62em] text-silver-bright"
          style={{
            textShadow: "0 0 18px rgba(238,241,245,0.35)",
            animation: assembling ? "hud-boot-pulse 1.4s ease-in-out infinite" : "none",
          }}
        >
          VIVID
        </p>
        <p className="mt-2 max-w-[19ch] sm:max-w-none text-[8px] sm:text-[9px] leading-relaxed tracking-[0.18em] sm:tracking-[0.24em] text-silver-bright/40">
          SHE SPEAKS {LANGUAGES.map((l) => LANGUAGE_NAMES[l].toUpperCase()).join(" · ")}
        </p>
      </div>

      {/* she greets in whichever language is active */}
      <p
        className="pointer-events-none absolute left-1/2 top-[calc(50%+30vmin)] sm:top-[calc(50%+26vmin)] -translate-x-1/2 text-center text-[14px] tracking-[0.3em] whitespace-nowrap text-silver-bright/80 group-data-[gpu=off]:hidden transition-opacity duration-1000"
        style={{ opacity: !assembling && state === "idle" ? 1 : 0, textShadow: "0 0 16px rgba(238,241,245,0.3)" }}
      >
        {GREETING[lang]}
      </p>

      {/* the crosshair marking the event horizon */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[13px] leading-none text-silver-bright/45 group-data-[gpu=off]:hidden"
        style={{ opacity: assembling ? 0 : 1, transition: "opacity 1.2s" }}
      >
        +
      </div>
      <button
        type="button"
        aria-label={recording ? "Stop recording" : "Start recording"}
        onClick={() => {
          if (assembling || !connected) return;
          if (recording) {
            stopRecording();
            return;
          }
          void startRecording();
        }}
        disabled={assembling || !connected}
        className="absolute left-1/2 top-1/2 z-10 h-[42vmin] w-[42vmin] max-h-[23rem] max-w-[23rem] min-h-[11rem] min-w-[11rem] -translate-x-1/2 -translate-y-1/2 rounded-full group-data-[gpu=off]:hidden disabled:cursor-not-allowed"
      />

      {/* the emitter star, visible only during assembly */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[82%] group-data-[gpu=off]:hidden h-60 w-60 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-700"
        style={{
          opacity: assembling ? 1 : 0,
          background:
            "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(245,222,138,0.55) 4%, rgba(212,167,58,0.28) 14%, rgba(0,0,0,0) 60%)",
        }}
      />


      {/* What she is doing, as an instrument: a traced frame that re-arrives
          on every change, and a live meter of the level the state is about. */}
      <div className="absolute right-5 top-5 sm:right-8 sm:top-1/2 sm:-translate-y-1/2 group-data-[gpu=off]:hidden">
        <StateReadout
          handle={handle}
          state={state}
          line={status}
          loudness={!assembling && state === "speaking" ? INTENSITY[lang][loudness] : null}
        />
      </div>
      {/* Reset: a bracketed control, in the corner. */}
      {assembling ? null : (
      <button
        type="button"
        aria-label="Reset conversation context"
        onClick={resetConversation}
        disabled={assembling || !connected}
        className="hud-motion absolute right-10 top-9 z-20 flex h-7 w-7 items-center justify-center text-[12px] leading-none text-silver-bright/85 transition-colors hover:text-warm-white disabled:cursor-not-allowed disabled:opacity-40 sm:right-12 sm:top-10"
        style={{ animation: "hud-panel-in 0.55s 320ms both" }}
      >
        <span aria-hidden className="pointer-events-none absolute top-0 left-0 h-2 w-2 border-t border-l border-silver-bright/60" />
        <span aria-hidden className="pointer-events-none absolute right-0 bottom-0 h-2 w-2 border-r border-b border-silver-bright/60" />
        ↺
      </button>
      )}

      {/* The bottom of the instrument: the rail, then the ring beneath it, in
          one column with a fixed gap so they cannot touch whatever their
          sizes. The rail is always shown, because it is where the connection
          is reported while she assembles; the ring arrives once she has. */}
      <div className="absolute inset-x-0 bottom-[max(2.25rem,env(safe-area-inset-bottom))] sm:bottom-10 flex flex-col items-center justify-center gap-4 px-4 group-data-[gpu=off]:hidden">
        <StatusStrip
          state={state}
          connected={connected}
          status={networkStatus}
          language={LANGUAGE_NAMES[lang]}
          className="max-w-[90vw]"
        />
        {assembling ? (
          // Holds the ring's height so the rail does not drop when the ring
          // arrives.
          <div aria-hidden className="h-[76px]" />
        ) : (
          <TalkRing
            handle={handle}
            recording={recording}
            disabled={!connected}
            onPress={() => (recording ? stopRecording() : void startRecording())}
            startLabel="START"
            stopLabel="STOP"
          />
        )}
      </div>

      {/* The language, pinned to the corner. */}
      {assembling ? null : (
        <LanguageSelect
          value={lang}
          onChange={setLang}
          className="absolute bottom-[max(2.25rem,env(safe-area-inset-bottom))] right-10 group-data-[gpu=off]:hidden sm:right-12 sm:bottom-10"
        />
      )}

    </main>
  );
}
