import { frequency } from "./music.js";

export const TEMPOS = Object.freeze({ slow: 0.95, normal: 0.65, fast: 0.4 });

export class PianoAudio {
  constructor() {
    this.context = null;
    this.voices = new Set();
    this.volume = 0.6;
    this.generation = 0;
  }

  async ready() {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) throw new Error("This browser does not support audio. Try a current version of Safari, Chrome, or Firefox.");
    if (!this.context || this.context.state === "closed") {
      this.context = new Context();
      this.output = this.context.createGain();
      // Leave headroom for two simultaneous notes and their overtones.
      this.output.gain.value = this.volume * 0.24;
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.ratio.value = 4;
      this.output.connect(this.compressor);
      this.compressor.connect(this.context.destination);
    }
    if (this.context.state !== "running") await this.context.resume();
    if (this.context.state !== "running") throw new Error("Audio is paused by your browser. Press Replay to try again.");
  }

  setVolume(volume) {
    this.volume = volume;
    if (this.context && this.output) this.output.gain.setTargetAtTime(volume * 0.24, this.context.currentTime, 0.025);
  }

  stop() {
    this.generation++;
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const voice of this.voices) {
      voice.envelope.gain.cancelScheduledValues(now);
      voice.envelope.gain.setTargetAtTime(0, now, 0.012);
      for (const oscillator of voice.oscillators) {
        try { oscillator.stop(now + 0.06); } catch { /* Voice has already ended. */ }
      }
    }
    this.voices.clear();
  }

  tone(midi, start, duration = 1.45) {
    const context = this.context;
    const envelope = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(6500, start);
    filter.frequency.exponentialRampToValueAtTime(1500, start + duration);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(0.8, start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.16, start + duration * 0.28);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    filter.connect(envelope);
    envelope.connect(this.output);
    const voice = { envelope, oscillators: [] };
    this.voices.add(voice);
    // Decaying harmonics give the reference notes a soft piano-like attack.
    for (const [partial, amplitude] of [[1, 1], [2, 0.35], [3, 0.16], [4, 0.07]]) {
      const oscillator = context.createOscillator();
      const partialGain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency(midi) * partial;
      partialGain.gain.setValueAtTime(amplitude, start);
      partialGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, amplitude * 0.04), start + duration);
      oscillator.connect(partialGain);
      partialGain.connect(filter);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
      oscillator.onended = () => {
        oscillator.disconnect();
        partialGain.disconnect();
        if (voice.oscillators.every(o => o === oscillator || o._ended)) {
          filter.disconnect();
          envelope.disconnect();
          this.voices.delete(voice);
        }
        oscillator._ended = true;
      };
      voice.oscillators.push(oscillator);
    }
  }

  async play(question, speed = "normal") {
    this.stop();
    const generation = this.generation;
    await this.ready();
    if (generation !== this.generation) return null;
    const gap = question.mode === "harmonic" ? 0 : TEMPOS[speed] ?? TEMPOS.normal;
    const start = this.context.currentTime + 0.035;
    this.tone(question.notes[0], start);
    this.tone(question.notes[1], start + gap);
    return { gap, duration: gap + 1.5 };
  }

  async playNote(midi) {
    this.stop();
    const generation = this.generation;
    await this.ready();
    if (generation !== this.generation) return;
    this.tone(midi, this.context.currentTime + 0.015, 1.1);
  }
}
