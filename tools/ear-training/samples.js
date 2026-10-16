export const SAMPLE_INSTRUMENTS = Object.freeze({
  piano: { name: 'Piano', notes: [48, 52, 54, 56, 58, 60, 64, 66, 68, 70, 72] },
  guitar: { name: 'Classical guitar', notes: [48, 52, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 69, 70, 71, 72] },
  violin: { name: 'Violin', notes: [55, 57, 60, 64, 67, 69, 72] },
  mandolin: { name: 'Mandolin', notes: [60, 62, 64, 65, 67, 69, 71, 72] },
});

export function sampleFor(instrument, midi) {
  const config = SAMPLE_INSTRUMENTS[instrument];
  if (!config || !Number.isInteger(midi) || midi < 48 || midi > 72) throw new Error('No recording for that instrument or note.');
  const root = config.notes.reduce((best, note) => Math.abs(note - midi) < Math.abs(best - midi) ? note : best);
  return { url: new URL(`./samples/${instrument}/${root}.wav`, import.meta.url).href, root, rate: 2 ** ((midi - root) / 12) };
}
