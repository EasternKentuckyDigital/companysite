export const INTERVALS = Object.freeze([
  { semitones: 1, short: "m2", name: "Minor 2nd" },
  { semitones: 2, short: "M2", name: "Major 2nd" },
  { semitones: 3, short: "m3", name: "Minor 3rd" },
  { semitones: 4, short: "M3", name: "Major 3rd" },
  { semitones: 5, short: "P4", name: "Perfect 4th" },
  { semitones: 6, short: "TT", name: "Tritone" },
  { semitones: 7, short: "P5", name: "Perfect 5th" },
  { semitones: 8, short: "m6", name: "Minor 6th" },
  { semitones: 9, short: "M6", name: "Major 6th" },
  { semitones: 10, short: "m7", name: "Minor 7th" },
  { semitones: 11, short: "M7", name: "Major 7th" },
  { semitones: 12, short: "P8", name: "Octave" },
]);
export const PRESETS = Object.freeze({ beginner: [3, 4, 7, 12], core: [2, 3, 4, 5, 7, 9, 12], all: INTERVALS.map(i => i.semitones) });
export const INSTRUMENTS = Object.freeze({
  piano: { name: "Piano", low: 48, high: 72 },
  guitar: { name: "Guitar", tuning: [40, 45, 50, 55, 59, 64], frets: 12 },
  violin: { name: "Violin", tuning: [55, 62, 69, 76], frets: 12, fretless: true },
  mandolin: { name: "Mandolin", tuning: [55, 62, 69, 76], frets: 12, doubled: true },
});
export const DEFAULT_SETTINGS = Object.freeze({
  intervals: PRESETS.beginner, mode: "ascending", count: 20, speed: "normal",
  rootNote: 60, autoNext: false, instrument: "piano", volume: 0.8,
});
const PITCH_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
export const noteName = midi => `${PITCH_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
export const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
export const isBlackKey = midi => [1, 3, 6, 8, 10].includes(midi % 12);
export const intervalBy = semitones => INTERVALS.find(i => i.semitones === semitones);

export function normalizeSettings(input = {}) {
  if (!input || typeof input !== "object") input = {};
  const intervals = Array.isArray(input.intervals)
    ? [...new Set(input.intervals.filter(n => Number.isInteger(n) && n >= 1 && n <= 12))].sort((a, b) => a - b) : [];
  return {
    intervals: intervals.length ? intervals : [...PRESETS.beginner],
    mode: ["ascending", "descending", "mixed", "harmonic"].includes(input.mode) ? input.mode : "ascending",
    count: [0, 10, 20, 50].includes(input.count) ? input.count : 20,
    speed: ["slow", "normal", "fast"].includes(input.speed) ? input.speed : "normal",
    rootNote: input.rootNote === null ? null
      : Number.isInteger(input.rootNote) && input.rootNote >= 55 && input.rootNote <= 60 ? input.rootNote
      : input.fixedRoot === true ? 55 : 60,
    autoNext: input.autoNext === true,
    instrument: Object.hasOwn(INSTRUMENTS, input.instrument) ? input.instrument : "piano",
    volume: typeof input.volume === "number" && Number.isFinite(input.volume) ? Math.max(0, Math.min(1, input.volume)) : 0.8,
  };
}

// G3–C5 is playable on all four views without changing the pitches heard.
// Choose the interval first so intervals have equal probability regardless of range.
export function createQuestion(settings, previous = null, random = Math.random) {
  const options = normalizeSettings(settings);
  const semitones = options.intervals[Math.floor(random() * options.intervals.length)];
  const mode = options.mode === "mixed" ? (random() < 0.5 ? "ascending" : "descending") : options.mode;
  const candidates = [];
  for (let low = 55; low <= 72 - semitones; low++) {
    if (options.rootNote !== null && low !== options.rootNote) continue;
    const notes = mode === "descending" ? [low + semitones, low] : [low, low + semitones];
    candidates.push({ semitones, mode, notes });
  }
  const alternatives = candidates.filter(q => !previous || q.mode !== previous.mode || q.notes.some((n, i) => n !== previous.notes[i]));
  const pool = alternatives.length ? alternatives : candidates;
  return pool[Math.floor(random() * pool.length)];
}

export function stringPositions(instrument, midi) {
  const config = INSTRUMENTS[instrument];
  if (!config?.tuning) return [];
  return config.tuning.flatMap((open, string) => {
    const fret = midi - open;
    return fret >= 0 && fret <= config.frets ? [{ string, fret, midi }] : [];
  });
}

// Favor one string when practical, then short shifts and nearby strings.
// Other valid positions remain visible as alternatives, rather than competing paths.
export function suggestedPositions(instrument, notes) {
  if (!Array.isArray(notes) || notes.length !== 2) return [];
  const pairs = stringPositions(instrument, notes[0]).flatMap(first =>
    stringPositions(instrument, notes[1]).map(second => [first, second]));
  const score = ([first, second]) => Math.abs(first.fret - second.fret) * 2
    + Math.abs(first.string - second.string) * 3
    + Math.max(first.fret, second.fret) * .2
    - (first.string === second.string ? 12 : 0);
  return pairs.sort((a, b) => score(a) - score(b))[0] ?? [];
}

export function newSession() {
  return { answered: 0, correct: 0, streak: 0, bestStreak: 0, byInterval: {} };
}

// Score each question exactly once, and count only first-try answers as correct.
export function recordResult(session, semitones, firstTry) {
  const result = session.byInterval[semitones] ?? { answered: 0, correct: 0 };
  result.answered++;
  result.correct += Number(firstTry);
  session.byInterval[semitones] = result;
  session.answered++;
  session.correct += Number(firstTry);
  session.streak = firstTry ? session.streak + 1 : 0;
  session.bestStreak = Math.max(session.bestStreak, session.streak);
}
