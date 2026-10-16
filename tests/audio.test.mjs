import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { InstrumentAudio } from '../tools/ear-training/audio.js';
import { SAMPLE_INSTRUMENTS, sampleFor } from '../tools/ear-training/samples.js';

const samples = new URL('../tools/ear-training/samples/', import.meta.url);
const provenance = JSON.parse(readFileSync(new URL('sources.json', samples)));

test('every playable pitch maps to a bundled, verified CC0 recording of the correct instrument', () => {
  for (const [instrument, config] of Object.entries(SAMPLE_INSTRUMENTS)) {
    for (const midi of config.notes) {
      const recording = sampleFor(instrument, midi);
      const bytes = readFileSync(new URL(recording.url));
      const record = provenance.recordings.find(r => r.instrument === instrument && r.midi === midi);
      assert.ok(record, `${instrument} ${midi} has provenance`);
      assert.equal(record.license, 'CC0-1.0');
      assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
      assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
      assert.equal(bytes.readUInt16LE(20), 1); // Uncompressed PCM.
      assert.equal(bytes.readUInt16LE(22), 1); // Mono.
      assert.equal(bytes.readUInt32LE(24), 22050);
      assert.equal(bytes.readUInt16LE(34), 16);
      assert.equal(recording.rate, 1);
      let peak = 0;
      for (let offset = 44; offset < bytes.length; offset += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(offset)));
      assert.ok(peak > 10000 && peak < 32700, `${instrument} ${midi} is audible with no clipped samples`);
    }
    for (let midi = instrument === 'piano' ? 48 : 55; midi <= 72; midi++) {
      const sample = sampleFor(instrument, midi);
      assert.ok(Math.abs(sample.root - midi) <= (instrument === 'mandolin' ? 5 : 2));
      assert.ok(sample.url.includes(`/samples/${instrument}/`));
      assert.ok(Math.abs(sample.root + 12 * Math.log2(sample.rate) - midi) < 1e-10);
    }
  }
  assert.equal(provenance.recordings.length, 45);
});

test('recorded middle C is physically near 261.63 Hz on each instrument, including piano octave conventions', () => {
  for (const instrument of Object.keys(SAMPLE_INSTRUMENTS)) {
    const bytes = readFileSync(new URL(`${instrument}/60.wav`, samples));
    const rate = bytes.readUInt32LE(24);
    const start = Math.round(rate * .065), end = Math.round(rate * .36);
    const y = Array.from({ length: end - start }, (_, i) => bytes.readInt16LE(44 + (start + i) * 2) / 32768
      * (.5 - .5 * Math.cos(2 * Math.PI * i / (end - start - 1))));
    // Compare possible fundamentals across two octaves so an octave mistake fails.
    const candidates = [];
    for (let lag = Math.floor(rate / 540); lag <= Math.ceil(rate / 125); lag++) {
      let correlation = 0;
      for (let i = 0; i < y.length - lag; i++) correlation += y[i] * y[i + lag];
      candidates.push({ lag, correlation });
    }
    const expectedLag = rate / 261.625565;
    const local = candidates.filter(c => Math.abs(c.lag - expectedLag) < 3).sort((a,b) => b.correlation - a.correlation)[0];
    const octave = candidates.filter(c => Math.abs(c.lag - expectedLag / 2) < 2).sort((a,b) => b.correlation - a.correlation)[0];
    assert.ok(local.correlation > octave.correlation * 1.05, `${instrument} must play C4, not C5`);
    const previous = candidates.find(c => c.lag === local.lag - 1).correlation;
    const next = candidates.find(c => c.lag === local.lag + 1).correlation;
    const adjustment = .5 * (previous - next) / (previous - 2 * local.correlation + next);
    const frequency = rate / (local.lag + adjustment);
    assert.ok(Math.abs(1200 * Math.log2(frequency / 261.625565)) < 12, `${instrument} middle C should be in tune`);
  }
});

class Param {
  constructor() { this.value = 0; this.calls = []; }
  setValueAtTime(...args) { this.calls.push(['set', ...args]); }
  linearRampToValueAtTime(...args) { this.calls.push(['ramp', ...args]); }
  setTargetAtTime(...args) { this.calls.push(['target', ...args]); }
  cancelScheduledValues(...args) { this.calls.push(['cancel', ...args]); }
}
class Node {
  constructor() { this.gain = new Param(); }
  connect() {}
  disconnect() { this.disconnected = true; }
}
class Context {
  constructor() { this.currentTime = 10; this.state = 'running'; this.sources = []; this.baseLatency = .01; this.outputLatency = .02; }
  createGain() { return new Node(); }
  createDynamicsCompressor() {
    const node = new Node();
    for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) node[key] = new Param();
    return node;
  }
  createBufferSource() {
    const node = new Node();
    node.playbackRate = new Param();
    node.start = time => { node.started = time; };
    node.stop = time => { node.stopped = time; };
    this.sources.push(node);
    return node;
  }
  async decodeAudioData(bytes) { return { duration: new DataView(bytes).getUint32(40, true) / 44100 }; }
}
function setup(t, fetcher = async url => {
  const bytes = readFileSync(new URL(url));
  return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}) {
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = Context;
  t.after(() => { if (previous === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = previous; });
  t.mock.method(globalThis, 'fetch', fetcher);
  return new InstrumentAudio();
}

test('each instrument uses recorded buffers; melodic and harmonic timing match the demonstration', async t => {
  const audio = setup(t);
  for (const instrument of Object.keys(SAMPLE_INSTRUMENTS)) {
    const before = audio.context?.sources.length ?? 0;
    const result = await audio.play({ notes: [60, 67], mode: 'ascending' }, 'slow', instrument);
    const [first, second] = audio.context.sources.slice(before);
    assert.equal(first.playbackRate.value, 1);
    assert.ok(Math.abs(second.started - first.started - result.gap) < 1e-10);
    assert.equal(result.gap, 1.15);
    assert.equal(result.delay, .09);
    assert.ok(result.duration >= result.gap + result.durations[1]);
  }
  const result = await audio.play({ notes: [60, 64], mode: 'harmonic' }, 'slow', 'violin');
  const last = audio.context.sources.slice(-2);
  assert.equal(result.gap, 0);
  assert.equal(last[0].started, last[1].started);
});

test('switching or stopping during a sample download cancels stale notes', async t => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const audio = setup(t, async () => { await pending; return { ok: true, arrayBuffer: async () => new ArrayBuffer(44) }; });
  const playback = audio.play({ notes: [60, 67], mode: 'ascending' }, 'normal', 'piano');
  await new Promise(resolve => setImmediate(resolve));
  audio.stop();
  release();
  assert.equal(await playback, null);
  assert.equal(audio.context.sources.length, 0);
});

test('failed recording downloads retry and volume settings are clamped', async t => {
  let attempts = 0;
  const bytes = readFileSync(new URL('piano/60.wav', samples));
  const audio = setup(t, async () => {
    attempts++;
    if (attempts === 1) return { ok: false };
    return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  });
  await assert.rejects(audio.playNote(60), /Couldn’t load/);
  assert.ok(await audio.playNote(60));
  assert.equal(attempts, 2);
  audio.setVolume(5); assert.equal(audio.volume, 1);
  audio.setVolume(-5); assert.equal(audio.volume, 0);
  audio.setVolume(NaN); assert.equal(audio.volume, .8);
});
