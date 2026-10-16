import test from 'node:test';
import assert from 'node:assert/strict';
import { INTERVALS, INSTRUMENTS, normalizeSettings, createQuestion, stringPositions, suggestedPositions, noteName, frequency, isBlackKey, newSession, recordResult } from '../tools/ear-training/music.js';

test('all interval, direction, and root combinations produce exact pitches playable on every instrument', () => {
  for (const interval of INTERVALS) for (const mode of ['ascending', 'descending', 'mixed', 'harmonic']) for (const rootNote of [null, 55, 56, 57, 58, 59, 60]) {
    for (let seed = 0; seed < 40; seed++) {
      let step = seed;
      const random = () => ((step++ * 137 + 53) % 997) / 997;
      const question = createQuestion({ intervals: [interval.semitones], mode, rootNote }, null, random);
      assert.equal(Math.abs(question.notes[1] - question.notes[0]), interval.semitones);
      assert.equal(question.semitones, interval.semitones);
      if (question.mode === 'descending') assert.ok(question.notes[0] > question.notes[1]);
      else assert.ok(question.notes[0] < question.notes[1]);
      if (rootNote !== null) assert.equal(Math.min(...question.notes), rootNote);
      for (const midi of question.notes) {
        assert.ok(midi >= INSTRUMENTS.piano.low && midi <= INSTRUMENTS.piano.high);
        for (const instrument of ['guitar', 'violin', 'mandolin']) {
          const positions = stringPositions(instrument, midi);
          assert.ok(positions.length > 0, `${noteName(midi)} must be playable on ${instrument}`);
          for (const position of positions) assert.equal(INSTRUMENTS[instrument].tuning[position.string] + position.fret, midi);
        }
      }
    }
  }
});

test('generation avoids repeating the exact notes and direction when alternatives exist', () => {
  const settings = { intervals: [7], mode: 'ascending', rootNote: null };
  const first = createQuestion(settings, null, () => 0);
  const second = createQuestion(settings, first, () => 0);
  assert.notDeepEqual(first.notes, second.notes);
  const fixed = { ...settings, rootNote: 55 };
  assert.deepEqual(createQuestion(fixed, createQuestion(fixed), () => 0).notes, [55, 62]);
});

test('intervals are selected independently of the number of possible starting notes', () => {
  for (let index = 0; index < 12; index++) {
    const question = createQuestion({ intervals: INTERVALS.map(i => i.semitones) }, null, () => (index + 0.5) / 12);
    assert.equal(question.semitones, index + 1);
  }
});

test('stored settings tolerate invalid JSON values and do not permit invalid notes or instruments', () => {
  for (const invalid of [null, false, 'bad', [], {}, { intervals: [], volume: NaN }, { instrument: '__proto__' }]) {
    const settings = normalizeSettings(invalid);
    assert.ok(settings.intervals.length > 0);
    assert.ok(Object.hasOwn(INSTRUMENTS, settings.instrument));
    assert.ok(Number.isFinite(settings.volume));
    assert.ok(createQuestion(settings));
  }
  const settings = normalizeSettings({ intervals: [12, 3, 3, 0, 13, '7', 2.5], volume: -5, count: -3, fixedRoot: 'false' });
  assert.deepEqual(settings.intervals, [3, 12]);
  assert.equal(settings.volume, 0);
  assert.equal(settings.count, 20);
  assert.equal(settings.rootNote, 60);
});

test('middle C and 80 percent volume are defaults, selected roots persist, and old fixed roots migrate', () => {
  assert.equal(normalizeSettings().rootNote, 60);
  assert.equal(normalizeSettings().volume, .8);
  for (const rootNote of [null, 55, 56, 57, 58, 59, 60]) assert.equal(normalizeSettings({ rootNote }).rootNote, rootNote);
  for (const rootNote of [false, '60', 40, 61, NaN, Infinity]) assert.equal(normalizeSettings({ rootNote }).rootNote, 60);
  assert.equal(normalizeSettings({ fixedRoot: true }).rootNote, 55);
  assert.equal(normalizeSettings({ fixedRoot: false }).rootNote, 60);
  for (const interval of INTERVALS) assert.equal(createQuestion({ intervals: [interval.semitones] }).notes[0], 60);
});

test('suggested string paths are playable and follow playback order in both directions', () => {
  for (const instrument of ['guitar', 'violin', 'mandolin']) for (const interval of INTERVALS) for (const mode of ['ascending', 'descending']) {
    const question = createQuestion({ intervals: [interval.semitones], mode });
    const path = suggestedPositions(instrument, question.notes);
    assert.equal(path.length, 2);
    path.forEach((position, i) => {
      assert.equal(position.midi, question.notes[i]);
      assert.equal(INSTRUMENTS[instrument].tuning[position.string] + position.fret, question.notes[i]);
      assert.ok(position.fret >= 0 && position.fret <= 12);
    });
  }
});

test('pitch names and tuning use scientific pitch notation and A4 = 440 Hz', () => {
  assert.equal(noteName(48), 'C3');
  assert.equal(noteName(60), 'C4');
  assert.equal(noteName(61), 'C♯4');
  assert.equal(noteName(72), 'C5');
  assert.equal(frequency(69), 440);
  assert.equal(frequency(81), 880);
  assert.equal(Array.from({ length: 25 }, (_, i) => i + 48).filter(isBlackKey).length, 10);
  assert.deepEqual(stringPositions('guitar', 64).map(p => [p.string, p.fret]), [[2, 14], [3, 9], [4, 5], [5, 0]].filter(([, fret]) => fret <= 12));
  assert.deepEqual(stringPositions('violin', 55), [{ string: 0, fret: 0, midi: 55 }]);
  assert.deepEqual(stringPositions('violin', 54), []);
});

test('scoring distinguishes first-try accuracy from retries and revealed answers', () => {
  const session = newSession();
  recordResult(session, 7, true);
  recordResult(session, 7, true);
  recordResult(session, 3, false);
  recordResult(session, 12, false);
  recordResult(session, 4, true);
  assert.equal(session.answered, 5);
  assert.equal(session.correct, 3);
  assert.equal(session.streak, 1);
  assert.equal(session.bestStreak, 2);
  assert.deepEqual(session.byInterval[7], { answered: 2, correct: 2 });
  assert.deepEqual(session.byInterval[3], { answered: 1, correct: 0 });
});
