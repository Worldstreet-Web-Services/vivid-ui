// One analyser feeds the face. Real sources (mic, TTS element or stream) when
// available; otherwise a seeded drift that never visibly loops. If the mouth
// is not the sound, there is no product — so the bands always exist.

export class AudioField {
  readonly bands = new Float32Array(16);
  intensity = 0;

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private fft: Uint8Array<ArrayBuffer> | null = null;
  private micStream: MediaStream | null = null;

  private ensureCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private wire(node: AudioNode) {
    const ctx = this.ensureCtx();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.75;
    this.fft = new Uint8Array(this.analyser.frequencyBinCount);
    node.connect(this.analyser);
  }

  async attachMic(): Promise<boolean> {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.wire(this.ensureCtx().createMediaStreamSource(this.micStream));
      return true;
    } catch {
      return false;
    }
  }

  // The TTS playback element goes here once the voice service exists.
  attachElement(el: HTMLMediaElement) {
    const src = this.ensureCtx().createMediaElementSource(el);
    this.wire(src);
    src.connect(this.ensureCtx().destination);
  }

  detach() {
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.analyser = null;
    this.fft = null;
  }

  // speaking=true drives the noise fallback with a speech-like envelope
  update(t: number, speaking: boolean) {
    if (this.analyser && this.fft) {
      this.analyser.getByteFrequencyData(this.fft);
      const per = Math.floor(this.fft.length / 16);
      let sum = 0;
      for (let b = 0; b < 16; b++) {
        let acc = 0;
        for (let i = 0; i < per; i++) acc += this.fft[b * per + i];
        const v = acc / per / 255;
        this.bands[b] += (v - this.bands[b]) * 0.35;
        sum += this.bands[b];
      }
      this.intensity += (sum / 16 - this.intensity) * 0.2;
      return;
    }
    // seeded drift: layered incommensurate sines, per-band phase
    const env = speaking
      ? 0.35 + 0.65 * Math.abs(Math.sin(t * 2.1) * Math.sin(t * 0.47 + 1.3))
      : 0.5;
    let sum = 0;
    for (let b = 0; b < 16; b++) {
      const v =
        env *
        (0.4 +
          0.6 *
            Math.abs(
              Math.sin(t * (0.9 + b * 0.13) + b * 2.1) *
                Math.sin(t * 0.31 + b * 0.7),
            )) *
        (1 - b / 22);
      this.bands[b] += (v - this.bands[b]) * 0.15;
      sum += this.bands[b];
    }
    this.intensity += ((speaking ? sum / 16 : 0.25) - this.intensity) * 0.1;
  }
}
