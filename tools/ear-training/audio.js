import { sampleFor } from './samples.js';

export const TEMPOS = Object.freeze({ slow: 1.15, normal: .8, fast: .5 });

export class InstrumentAudio {
  constructor() {
    this.context = null;
    this.voices = new Set();
    this.buffers = new Map();
    this.volume = .8;
    this.generation = 0;
  }

  async ready() {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) throw new Error('This browser does not support audio. Try a current version of Safari, Chrome, or Firefox.');
    if (!this.context || this.context.state === 'closed') {
      this.context = new Context();
      this.buffers.clear();
      this.output = this.context.createGain();
      this.output.gain.value = this.volume * .85;
      this.output.connect(this.context.destination);
    }
    if (this.context.state !== 'running') await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Audio is paused by your browser. Press Replay to try again.');
  }

  setVolume(volume) {
    this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : .8;
    if (this.context && this.output) this.output.gain.setTargetAtTime(this.volume * .85, this.context.currentTime, .025);
  }

  async recording(instrument, midi) {
    const sample = sampleFor(instrument, midi);
    if (!this.buffers.has(sample.url)) {
      const pending = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch(sample.url, { signal: controller.signal });
          if (!response.ok) throw new Error('Recording download failed.');
          return await this.context.decodeAudioData(await response.arrayBuffer());
        } finally {
          clearTimeout(timeout);
        }
      })().catch(() => {
        this.buffers.delete(sample.url);
        throw new Error('Couldn’t load the instrument recording. Check your connection and press Replay to try again.');
      });
      this.buffers.set(sample.url, pending);
    }
    return { buffer: await this.buffers.get(sample.url), rate: sample.rate };
  }

  stop() {
    this.generation++;
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const voice of this.voices) {
      voice.envelope.gain.cancelScheduledValues(now);
      voice.envelope.gain.setTargetAtTime(0, now, .008);
      try { voice.source.stop(now + .04); } catch { /* Already ended. */ }
    }
    this.voices.clear();
  }

  tone(recording, start, level = 1) {
    const { buffer, rate } = recording;
    // Keep most of the recorded decay so plucked and struck notes stay natural.
    const duration = Math.min(buffer.duration / rate, 2.4);
    const source = this.context.createBufferSource();
    const envelope = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(level, start + .004);
    envelope.gain.setValueAtTime(level, start + Math.max(.005, duration - .16));
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(envelope);
    envelope.connect(this.output);
    const voice = { source, envelope };
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect();
      envelope.disconnect();
      this.voices.delete(voice);
    };
    source.start(start);
    source.stop(start + duration + .01);
    return duration;
  }

  async play(question, speed = 'normal', instrument = 'piano') {
    this.stop();
    const generation = this.generation;
    await this.ready();
    const recordings = await Promise.all(question.notes.map(midi => this.recording(instrument, midi)));
    if (generation !== this.generation) return null;
    const gap = question.mode === 'harmonic' ? 0 : TEMPOS[speed] ?? TEMPOS.normal;
    const start = this.context.currentTime + .06;
    const durations = recordings.map((recording, index) => this.tone(recording, start + index * gap, Math.SQRT1_2));
    const delay = .06 + (this.context.baseLatency || 0) + (this.context.outputLatency || 0);
    return { gap, delay, durations, duration: delay + Math.max(durations[0], gap + durations[1]) };
  }

  async playNote(midi, instrument = 'piano') {
    this.stop();
    const generation = this.generation;
    await this.ready();
    const recording = await this.recording(instrument, midi);
    if (generation !== this.generation) return null;
    const duration = this.tone(recording, this.context.currentTime + .03, .9);
    return { delay: .03 + (this.context.baseLatency || 0) + (this.context.outputLatency || 0), duration };
  }
}
