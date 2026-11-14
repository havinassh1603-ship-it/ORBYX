/**
 * Synthesised sound effects (WebAudio, no audio files). Starts on the first user gesture.
 */
import type { Settings } from "../persist/profile";

type SfxName =
  | "click"
  | "hover"
  | "commit"
  | "error"
  | "door"
  | "step"
  | "alarm"
  | "open"
  | "close"
  | "success"
  | "partial"
  | "fail"
  | "launch"
  | "tick";

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private ambNodes: AudioNode[] = [];
  private noiseBuf: AudioBuffer | null = null;
  private settings: Settings | null = null;

  apply(s: Settings) {
    this.settings = s;
    if (!this.ctx || !this.master || !this.sfxBus || !this.ambBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.masterVolume, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfx ? 1 : 0, t, 0.05);
    this.ambBus.gain.setTargetAtTime(s.ambience ? 1 : 0, t, 0.2);
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.ambBus = this.ctx.createGain();
    this.ambBus.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.settings) this.apply(this.settings);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, at = 0, slideTo?: number) {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, gain: number, f0: number, f1: number, at = 0, q = 1) {
    if (!this.ctx || !this.sfxBus || !this.noiseBuf) return;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  play(name: SfxName) {
    if (!this.ctx) return;
    switch (name) {
      case "click":
        this.tone(880, 0.06, "sine", 0.12);
        break;
      case "hover":
        this.tone(1500, 0.03, "sine", 0.03);
        break;
      case "open":
        this.noise(0.18, 0.06, 600, 2400, 0, 0.8);
        this.tone(520, 0.12, "sine", 0.06, 0.02, 780);
        break;
      case "close":
        this.noise(0.15, 0.05, 2200, 500, 0, 0.8);
        break;
      case "commit":
        this.tone(660, 0.14, "triangle", 0.14);
        this.tone(990, 0.22, "triangle", 0.12, 0.09);
        break;
      case "error":
        this.tone(160, 0.16, "square", 0.05);
        break;
      case "door":
        this.noise(0.32, 0.07, 300, 1400, 0, 1.2);
        break;
      case "step":
        this.noise(0.05, 0.025, 900, 400, 0, 2);
        break;
      case "alarm":
        this.tone(880, 0.16, "square", 0.05);
        this.tone(660, 0.16, "square", 0.05, 0.2);
        break;
      case "tick":
        this.tone(1200, 0.03, "square", 0.025);
        break;
      case "success":
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, "triangle", 0.1, i * 0.11));
        break;
      case "partial":
        [523, 659, 587].forEach((f, i) => this.tone(f, 0.35, "triangle", 0.09, i * 0.13));
        break;
      case "fail":
        [392, 330, 262].forEach((f, i) => this.tone(f, 0.45, "sawtooth", 0.05, i * 0.18));
        break;
      case "launch":
        this.noise(3.2, 0.22, 120, 900, 0, 0.5);
        this.noise(2.6, 0.12, 60, 200, 0.2, 0.7);
        break;
    }
  }

  startAmbience() {
    if (!this.ctx || !this.ambBus || this.ambNodes.length) return;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.value = 0.035;
    lp.connect(g).connect(this.ambBus);
    for (const f of [55, 82.4, 110.3]) {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = Math.random() * 8 - 4;
      o.connect(lp);
      o.start();
      this.ambNodes.push(o);
    }
    this.ambNodes.push(lp, g);
  }

  stopAmbience() {
    for (const n of this.ambNodes) {
      if (n instanceof OscillatorNode) n.stop();
      n.disconnect();
    }
    this.ambNodes = [];
  }
}

export const sfx = new SoundEngine();
