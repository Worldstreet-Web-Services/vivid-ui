// Two channels feed the face: what she hears and what she says.
//
// The user's microphone is INPUT; her own voice, the TTS element, is OUTPUT.
// They are analysed separately and never share a node, so listening can be
// driven by your voice at the same moment speaking is driven by hers, and the
// two can be told apart in the shader. One analyser swapped by state, which
// is what this replaced, could only ever carry one of them.
//
// Each channel keeps sixteen smoothed bands and a loudness. On top of both, a
// beat detector watches the output's low end for onsets and reports a tempo,
// so the whole presence can breathe on the rhythm of her speech rather than
// on a fixed clock.
//
// When no real source is attached, a channel falls back to a seeded drift
// that never visibly loops. If the mouth is not the sound there is no
// product, so the bands always exist.

const BANDS = 16;

class Channel {
  readonly bands = new Float32Array(BANDS);
  /** Smoothed loudness, 0..1. */
  level = 0;

  private analyser: AnalyserNode | null = null;
  private fft: Uint8Array<ArrayBuffer> | null = null;
  private source: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private ownsStream = false;

  constructor(private readonly ctx: () => AudioContext) {}

  private wire(node: AudioNode): void {
    this.release();
    const analyser = this.ctx().createAnalyser();
    analyser.fftSize = 512;
    // Lower analyser smoothing keeps speech transients visible in motion.
    analyser.smoothingTimeConstant = 0.58;
    node.connect(analyser);
    this.analyser = analyser;
    this.fft = new Uint8Array(analyser.frequencyBinCount);
    this.source = node;
  }

  attachStream(stream: MediaStream, owns: boolean): void {
    this.wire(this.ctx().createMediaStreamSource(stream));
    this.stream = stream;
    this.ownsStream = owns;
  }

  /**
   * A media element as source. The element keeps playing to the speakers,
   * which the analyser alone would silence.
   */
  attachElement(el: HTMLMediaElement): void {
    const src = this.ctx().createMediaElementSource(el);
    this.wire(src);
    src.connect(this.ctx().destination);
  }

  release(): void {
    if (this.ownsStream) this.stream?.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    this.source = null;
    this.stream = null;
    this.ownsStream = false;
    this.analyser = null;
    this.fft = null;
  }

  live(): boolean {
    return Boolean(this.analyser && this.fft);
  }

  /**
   * Reads the analyser into the bands. `active` shapes the envelope: a
   * channel that is meant to be carrying speech follows attacks harder.
   */
  update(t: number, active: boolean, phase: number): void {
    if (this.analyser && this.fft) {
      this.analyser.getByteFrequencyData(this.fft);
      const per = Math.floor(this.fft.length / BANDS);
      let sum = 0;
      const attack = active ? 0.62 : 0.35;
      const release = active ? 0.24 : 0.2;
      for (let b = 0; b < BANDS; b++) {
        let acc = 0;
        for (let i = 0; i < per; i++) acc += this.fft[b * per + i];
        const v = acc / per / 255;
        const follow = v > this.bands[b] ? attack : release;
        this.bands[b] += (v - this.bands[b]) * follow;
        sum += this.bands[b];
      }
      const target = sum / BANDS;
      const follow = target > this.level ? (active ? 0.44 : 0.22) : 0.16;
      this.level += (target - this.level) * follow;
      return;
    }
    // Seeded drift: layered incommensurate sines, per-band phase. `phase`
    // offsets the two channels so their fallbacks never move in step.
    const env = active
      ? 0.35 + 0.65 * Math.abs(Math.sin(t * 2.1 + phase) * Math.sin(t * 0.47 + 1.3 + phase))
      : 0.5;
    let sum = 0;
    for (let b = 0; b < BANDS; b++) {
      const v =
        env *
        (0.4 +
          0.6 *
            Math.abs(
              Math.sin(t * (0.9 + b * 0.13) + b * 2.1 + phase) * Math.sin(t * 0.31 + b * 0.7 + phase)
            )) *
        (1 - b / 22);
      this.bands[b] += (v - this.bands[b]) * 0.15;
      sum += this.bands[b];
    }
    this.level += ((active ? sum / BANDS : 0.25) - this.level) * 0.1;
  }
}

/**
 * Onsets in a signal's low end, and the tempo they imply.
 *
 * An onset is the low band rising sharply above its own recent average. Their
 * spacing, smoothed, is the tempo; a pulse phase then runs at that tempo so
 * anything breathing on it lands on the beat. Speech is not music, but it has
 * a cadence, and the presence answering to it is what makes her feel like she
 * is speaking rather than being animated while sound plays.
 */
export class BeatDetector {
  /** Seconds between beats, smoothed. 0 until two onsets have been seen. */
  interval = 0;
  /** 0..1, wrapping once per beat. */
  phase = 0;
  /** 1 on the frame an onset lands, decaying to 0. */
  onset = 0;

  private average = 0;
  private lastOnsetAt = -1;
  private lastT = 0;
  // An onset has to be a rise FROM BELOW. After one fires, the signal must
  // fall back toward the average before another may; otherwise a level that
  // steps up and stays there reads as a run of beats while the slow average
  // catches up, and a held loud note is not a beat.
  private armed = true;

  update(t: number, low: number): void {
    const dt = Math.max(0, t - this.lastT);
    this.lastT = t;
    this.onset = Math.max(0, this.onset - dt * 6);

    // A slow average of the low end, so an onset is judged against what has
    // been normal lately rather than against silence.
    this.average += (low - this.average) * 0.05;
    const rise = low - this.average;
    if (rise < 0.03) this.armed = true;
    // Refractory: no two onsets closer than 180ms, or one syllable counts twice.
    if (
      this.armed &&
      rise > 0.09 &&
      low > 0.12 &&
      (this.lastOnsetAt < 0 || t - this.lastOnsetAt > 0.18)
    ) {
      this.armed = false;
      if (this.lastOnsetAt >= 0) {
        const gap = t - this.lastOnsetAt;
        // Only plausible speech-and-music tempi. Anything else is noise.
        if (gap > 0.2 && gap < 1.5) {
          this.interval = this.interval > 0 ? this.interval + (gap - this.interval) * 0.3 : gap;
        }
      }
      this.lastOnsetAt = t;
      this.onset = 1;
      // The beat lands at phase zero, exactly: the advance below is for the
      // frames between beats, not the frame of one.
      this.phase = 0;
    } else if (this.interval > 0) {
      this.phase = (this.phase + dt / this.interval) % 1;
    }
    // A tempo nobody has confirmed for a while is forgotten.
    if (this.lastOnsetAt >= 0 && t - this.lastOnsetAt > 3) this.interval = 0;
  }
}

export class AudioField {
  private ctx: AudioContext | null = null;

  /** What she hears: the microphone. */
  readonly input: Channel;
  /** What she says: the TTS element. */
  readonly output: Channel;
  readonly beat = new BeatDetector();

  constructor() {
    const ctx = () => this.ensureCtx();
    this.input = new Channel(ctx);
    this.output = new Channel(ctx);
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  async attachMic(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.input.attachStream(stream, true);
      return true;
    } catch {
      return false;
    }
  }

  attachStream(stream: MediaStream): void {
    this.input.attachStream(stream, false);
  }

  attachElement(el: HTMLMediaElement): void {
    this.output.attachElement(el);
  }

  /** Releases the microphone. Her own voice stays wired. */
  detach(): void {
    this.input.release();
  }

  hasInput(): boolean {
    return this.input.live();
  }

  /**
   * Whichever channel the state is about, for callers that want one number.
   * Listening is about the input; everything else is about her.
   */
  get intensity(): number {
    return this.listening ? this.input.level : this.output.level;
  }

  /** The output's bands, which is what the face has always been driven by. */
  get bands(): Float32Array {
    return this.output.bands;
  }

  private listening = false;

  update(t: number, state: { listening: boolean; speaking: boolean }): void {
    this.listening = state.listening;
    this.input.update(t, state.listening, 0);
    this.output.update(t, state.speaking, 2.7);
    // The beat rides on her voice's low end.
    const low = (this.output.bands[0] + this.output.bands[1] + this.output.bands[2]) / 3;
    this.beat.update(t, state.speaking ? low : 0);
  }
}
