import { INTERVALS, PRESETS, INSTRUMENTS, normalizeSettings, createQuestion, noteName, isBlackKey, intervalBy, stringPositions, suggestedPositions, newSession, recordResult } from './music.js';
import { InstrumentAudio } from './audio.js';
import { SAMPLE_INSTRUMENTS } from './samples.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'ekd-ear-training-v1';
let settings;
try { settings = normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
catch { settings = normalizeSettings(); }
const audio = new InstrumentAudio();
audio.setVolume(settings.volume);
let session = newSession();
let question = null;
let phase = 'ready'; // ready, asking, answered, summary
let missed = false;
let attempted = new Set();
let playing = false;
let audioToken = 0;
let autoTimer = null;
let animationTimers = [];
let playbackFailed = false;

function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Private browsing may disable storage. */ }
}
function presetFor(intervals) {
  return Object.keys(PRESETS).find(key => JSON.stringify(PRESETS[key]) === JSON.stringify(intervals)) || 'custom';
}
function feedback(message, kind = '') {
  $('feedback').textContent = message;
  $('feedback').className = `feedback ${kind}`;
}
function clearAuto() {
  clearTimeout(autoTimer);
  autoTimer = null;
}
function stopPlayback() {
  audioToken++;
  audio.stop();
  for (const timer of animationTimers) clearTimeout(timer);
  animationTimers = [];
  document.querySelectorAll('.sounding').forEach(el => el.classList.remove('sounding'));
  playing = false;
}
function updateSettingsDescription() {
  const modes = { ascending: 'ascending', descending: 'descending', mixed: 'mixed', harmonic: 'together' };
  $('settings-description').textContent = `${settings.intervals.length} intervals · ${settings.rootNote === null ? 'varied' : noteName(settings.rootNote)} · ${modes[settings.mode]}`;
  $('apply-settings').textContent = phase === 'asking' || phase === 'answered' ? 'Apply & restart session' : 'Apply settings';
}
function fillSettings() {
  $('preset').value = presetFor(settings.intervals);
  for (const id of ['mode', 'count', 'speed']) $(id).value = String(settings[id]);
  $('root-note').value = settings.rootNote === null ? 'varied' : String(settings.rootNote);
  $('auto-next').checked = settings.autoNext;
  $('volume').value = settings.volume * 100;
  $('interval-options').replaceChildren(...INTERVALS.map(interval => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = interval.semitones;
    checkbox.name = 'interval';
    checkbox.checked = settings.intervals.includes(interval.semitones);
    label.append(checkbox, document.createTextNode(interval.name));
    return label;
  }));
  updateSettingsDescription();
}
function renderAnswers() {
  $('answers').replaceChildren(...settings.intervals.map((semitones, index) => {
    const interval = intervalBy(semitones);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'answer';
    button.dataset.interval = semitones;
    button.disabled = phase !== 'asking' || playing || attempted.has(semitones);
    const name = document.createElement('strong');
    name.textContent = interval.name;
    const short = document.createElement('span');
    short.className = 'interval-short';
    short.textContent = interval.short;
    const shortcut = document.createElement('kbd');
    shortcut.textContent = index < 9 ? index + 1 : ['0', '-', '='][index - 9];
    shortcut.setAttribute('aria-hidden', 'true');
    button.append(name, short, shortcut);
    if (attempted.has(semitones)) {
      button.classList.add('wrong');
      button.setAttribute('aria-label', `${interval.name}, incorrect, try another interval`);
    }
    if (phase === 'answered' && semitones === question.semitones) {
      button.classList.add('correct');
      button.setAttribute('aria-label', `${interval.name}, correct answer`);
    }
    button.addEventListener('click', () => answer(semitones));
    return button;
  }));
  $('answer-shortcut-hint').textContent = settings.intervals.length <= 9
    ? `Keys 1–${settings.intervals.length}`
    : 'Keys 1–9, 0, -, =';
}
function renderProgress() {
  const percent = settings.count ? session.answered / settings.count * 100 : 0;
  $('progress-fill').style.width = `${percent}%`;
  const progress = document.querySelector('.progress-track');
  if (settings.count) {
    progress.setAttribute('aria-valuemax', settings.count);
    progress.setAttribute('aria-valuenow', session.answered);
    progress.setAttribute('aria-valuetext', `${session.answered} of ${settings.count} questions completed`);
  } else {
    progress.removeAttribute('aria-valuenow');
    progress.removeAttribute('aria-valuemax');
    progress.setAttribute('aria-valuetext', `${session.answered} questions completed, unlimited session`);
  }
  $('score').textContent = `${session.correct}/${session.answered} first try`;
  $('streak').textContent = `${session.streak} streak`;
  if (phase === 'ready') $('question-count').textContent = 'Ready';
  else if (phase === 'summary') $('question-count').textContent = `${session.answered} questions completed`;
  else $('question-count').textContent = `Question ${session.answered + (phase === 'asking' ? 1 : 0)}${settings.count ? ` of ${settings.count}` : ''}`;
}
function renderControls() {
  $('preview-instrument').disabled = phase === 'asking' || playing;
  $('primary-label').textContent = phase === 'ready' ? 'Start practice' : phase === 'asking' ? (playing ? 'Playing…' : 'Hear again') : settings.count && session.answered >= settings.count ? 'See results' : 'Next interval';
  $('primary').disabled = phase === 'asking' && playing;
  $('replay').disabled = !question || playing;
  $('reveal').disabled = phase !== 'asking' || playing;
  $('replay-slow').hidden = phase !== 'answered' && !(phase === 'summary' && question);
  $('replay-slow').disabled = playing;
  $('end-session').hidden = phase === 'ready' || phase === 'summary';
  $('settings-note').textContent = phase === 'asking' || phase === 'answered' ? 'Changes restart this session.' : 'Saved on this device.';
  updateSettingsDescription();
}
function noteRole(midi) {
  if (!question || (phase !== 'answered' && phase !== 'summary')) return -1;
  return question.notes.indexOf(midi);
}
async function activateNote(midi) {
  if (phase === 'asking') return;
  clearAuto();
  stopPlayback();
  const token = audioToken;
  playing = true;
  renderControls();
  $('sample-status').textContent = `Loading ${SAMPLE_INSTRUMENTS[settings.instrument].name.toLowerCase()} recording…`;
  try {
    const result = await audio.playNote(midi, settings.instrument);
    if (token !== audioToken || !result) return;
    $('sample-status').textContent = '';
    animateNote(midi, result.delay * 1000, token, result.duration * 1000);
    animationTimers.push(setTimeout(() => {
      if (token !== audioToken) return;
      playing = false;
      renderControls();
    }, (result.delay + result.duration) * 1000));
  } catch (error) {
    if (token !== audioToken) return;
    playing = false;
    $('sample-status').textContent = error.message;
    renderControls();
  }
}
function renderPiano() {
  const piano = document.createElement('div');
  piano.className = 'piano';
  piano.setAttribute('role', 'group');
  piano.setAttribute('aria-label', 'Two-octave piano, C3 to C5');
  const whites = [];
  const blacks = [];
  let whiteCount = 0;
  for (let midi = 48; midi <= 72; midi++) {
    const black = isBlackKey(midi);
    const role = noteRole(midi);
    const key = document.createElement('button');
    key.type = 'button';
    key.className = `piano-key${black ? ' black' : ''}${role === 0 ? ' note-first' : role === 1 ? ' note-second' : ''}`;
    key.dataset.midi = midi;
    key.disabled = phase === 'asking';
    key.setAttribute('aria-label', `${noteName(midi)}${role >= 0 ? `, ${question.mode === 'harmonic' ? (role === 0 ? 'lower' : 'upper') : (role === 0 ? 'first' : 'second')} note` : ''}`);
    const label = document.createElement('span');
    label.className = 'key-name';
    label.textContent = role >= 0 || !black ? noteName(midi) : '';
    key.append(label);
    if (role >= 0) {
      const marker = document.createElement('span');
      marker.className = 'key-marker';
      marker.textContent = role + 1;
      marker.setAttribute('aria-hidden', 'true');
      key.append(marker);
    }
    key.addEventListener('click', () => activateNote(midi));
    if (black) {
      key.style.left = `${whiteCount / 15 * 100 - 2.1}%`;
      blacks.push(key);
    } else {
      whiteCount++;
      whites.push(key);
    }
  }
  piano.append(...whites, ...blacks);
  $('instrument').replaceChildren(piano);
}
const SVG_NS = 'http://www.w3.org/2000/svg';
function svgElement(tag, attrs, text) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  if (text != null) element.textContent = text;
  return element;
}
function renderStrings() {
  const config = INSTRUMENTS[settings.instrument];
  const wrap = document.createElement('div');
  wrap.className = 'fretboard-scroll';
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', `${config.name} ${config.fretless ? 'fingerboard' : 'fretboard'}, scroll horizontally on small screens`);
  const svg = svgElement('svg', { viewBox: '0 0 840 215', class: 'fretboard', role: 'group', 'aria-label': `${config.name} in standard tuning, open strings through ${config.fretless ? '12 semitone positions' : 'fret 12'}` });
  const left = 76, right = 818, top = 40, bottom = 167;
  const x = fret => left + (right - left) * (1 - 2 ** (-fret / 12)) * 2;
  const y = string => bottom - string / (config.tuning.length - 1) * (bottom - top);
  const markerX = position => position.fret === 0 ? left - 27 : config.fretless ? x(position.fret) : (x(position.fret) + x(position.fret - 1)) / 2;
  const visible = question && (phase === 'answered' || phase === 'summary');
  const path = visible ? suggestedPositions(settings.instrument, question.notes) : [];
  svg.append(svgElement('rect', { x: left, y: top - 16, width: right - left, height: bottom - top + 32, rx: 2, class: 'board' }));
  for (let fret = 0; fret <= 12; fret++) {
    svg.append(svgElement('line', { x1: x(fret), x2: x(fret), y1: top - 16, y2: bottom + 16, class: fret === 0 ? 'nut' : `fret${config.fretless ? ' guide' : ''}` }));
    const labelX = fret === 0 ? left - 27 : (x(fret) + x(fret - 1)) / 2;
    svg.append(svgElement('text', { x: labelX, y: bottom + 37, 'text-anchor': 'middle', class: 'fret-label' }, fret));
  }
  if (!config.fretless) {
    for (const fret of [3, 5, 7, 9, 12]) {
      const dotX = (x(fret) + x(fret - 1)) / 2;
      const midY = (top + bottom) / 2;
      for (const offset of fret === 12 ? [-18, 18] : [0]) svg.append(svgElement('circle', { cx: dotX, cy: midY + offset, r: 4, class: 'position-dot' }));
    }
  }
  config.tuning.forEach((open, string) => {
    svg.append(svgElement('text', { x: 28, y: y(string) + 4, 'text-anchor': 'middle', class: 'string-label' }, noteName(open)));
    for (const offset of config.doubled ? [-2, 2] : [0]) svg.append(svgElement('line', { x1: left - 35, x2: right, y1: y(string) + offset, y2: y(string) + offset, class: 'string', 'stroke-width': config.doubled ? 1 : 1 + (config.tuning.length - 1 - string) * .22 }));
  });
  if (visible) {
    if (path.length === 2) svg.append(svgElement('line', { x1: markerX(path[0]), y1: y(path[0].string), x2: markerX(path[1]), y2: y(path[1].string), class: 'suggested-path', 'aria-hidden': 'true' }));
    question.notes.forEach((midi, role) => {
      for (const position of stringPositions(settings.instrument, midi)) {
        // On a fretless instrument the finger stops the string at the pitch
        // position itself. Fretted instruments show the finger behind the fret.
        const cx = markerX(position);
        const cy = y(position.string);
        const primary = path[role]?.string === position.string && path[role]?.fret === position.fret;
        const marker = svgElement('g', { class: `note-position ${role === 0 ? 'note-first' : 'note-second'}${primary ? ' primary-position' : ' alternate-position'}`, role: 'button', tabindex: '0', 'aria-label': `Play ${noteName(midi)}, note ${role + 1}, ${noteName(config.tuning[position.string])} string, ${position.fret === 0 ? 'open' : `${config.fretless ? 'semitone' : 'fret'} ${position.fret}`}`, 'data-midi': midi, 'data-primary': String(primary) });
        marker.append(svgElement('circle', { cx, cy, r: 15 }), svgElement('text', { x: cx, y: cy + 1 }, `${role + 1}`));
        marker.addEventListener('click', () => activateNote(midi));
        marker.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateNote(midi); }
        });
        svg.append(marker);
      }
    });
  }
  wrap.append(svg);
  $('instrument').replaceChildren(wrap);
}
function renderInstrument() {
  const instrument = settings.instrument;
  const recording = SAMPLE_INSTRUMENTS[instrument];
  $('sample-source').href = recording.source;
  $('sample-source').title = recording.credit;
  $('sample-source').setAttribute('aria-label', `${recording.name} recording source: ${recording.credit}`);
  $('sample-source').replaceChildren(document.createTextNode('Audio source '));
  const sourceArrow = document.createElement('span');
  sourceArrow.setAttribute('aria-hidden', 'true');
  sourceArrow.textContent = '↗';
  $('sample-source').append(sourceArrow);
  document.querySelectorAll('[data-instrument]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.instrument === instrument)));
  $('instrument-title').textContent = instrument[0].toUpperCase() + instrument.slice(1);
  const visible = question && (phase === 'answered' || phase === 'summary');
  $('note-legend').hidden = !visible;
  $('demonstration').hidden = !visible;
  if (visible) {
    const together = question.mode === 'harmonic';
    $('first-note').textContent = `${together ? 'Lower' : 'First'}: ${noteName(question.notes[0])}`;
    $('second-note').textContent = `${together ? 'Upper' : 'Second'}: ${noteName(question.notes[1])}`;
    const path = suggestedPositions(instrument, question.notes);
    for (const [index, id] of ['demo-first', 'demo-second'].entries()) {
      const button = $(id);
      button.dataset.midi = question.notes[index];
      button.textContent = `${together ? (index === 0 ? 'Lower' : 'Upper') : (index === 0 ? '1' : '2')} · ${noteName(question.notes[index])}`;
    }
    $('demo-direction').textContent = together ? '+' : '→';
    $('demo-interval').textContent = `${intervalBy(question.semitones).name} · ${question.semitones} semitones`;
    $('fingering-guide').textContent = instrument === 'piano' ? 'Select either note to hear it again.'
      : path.map(position => `${noteName(INSTRUMENTS[instrument].tuning[position.string])} string · ${position.fret === 0 ? 'open' : `${INSTRUMENTS[instrument].fretless ? 'position' : 'fret'} ${position.fret}`}`).join(' → ');
    $('visual-explanation').textContent = `${question.notes.map(noteName).join(together ? ' + ' : ' → ')} · ${question.semitones} semitone${question.semitones === 1 ? '' : 's'}`;
  } else {
    $('visual-explanation').textContent = 'Notes appear after you answer.';
  }
  $('instrument-note').textContent = {
    piano: 'C3–C5',
    guitar: 'E–A–D–G–B–E',
    violin: 'G–D–A–E',
    mandolin: 'G–D–A–E · paired strings',
  }[instrument];
  if (instrument === 'piano') renderPiano(); else renderStrings();
}
function render() {
  $('quiz').hidden = phase === 'summary';
  $('summary').hidden = phase !== 'summary';
  renderProgress();
  renderControls();
  renderAnswers();
  renderInstrument();
}
function animateNote(midi, delay, token, duration = 650) {
  const selector = `.piano-key[data-midi="${midi}"], .note-step[data-midi="${midi}"], .note-position[data-midi="${midi}"][data-primary="true"]`;
  animationTimers.push(setTimeout(() => {
    if (token !== audioToken) return;
    document.querySelectorAll(selector).forEach(el => el.classList.add('sounding'));
  }, delay));
  animationTimers.push(setTimeout(() => {
    if (token !== audioToken) return;
    document.querySelectorAll(selector).forEach(el => el.classList.remove('sounding'));
  }, delay + duration));
}
async function playQuestion(speed = settings.speed) {
  if (!question) return;
  stopPlayback();
  const token = audioToken;
  const currentQuestion = question;
  playing = true;
  renderControls();
  renderAnswers();
  $('sample-status').textContent = `Loading ${SAMPLE_INSTRUMENTS[settings.instrument].name.toLowerCase()} recordings…`;
  try {
    const result = await audio.play(currentQuestion, speed, settings.instrument);
    if (token !== audioToken || !result) return;
    playbackFailed = false;
    $('sample-status').textContent = '';
    if (phase === 'asking') feedback('Name the interval.');
    if (phase === 'answered' || phase === 'summary') {
      animateNote(currentQuestion.notes[0], result.delay * 1000, token, result.durations[0] * 1000);
      animateNote(currentQuestion.notes[1], (result.delay + result.gap) * 1000, token, result.durations[1] * 1000);
    }
    animationTimers.push(setTimeout(() => {
      if (token !== audioToken) return;
      playing = false;
      renderControls();
      renderAnswers();
      if (phase === 'answered' && settings.autoNext) autoTimer = setTimeout(nextQuestion, 4000);
    }, result.duration * 1000));
  } catch (error) {
    if (token !== audioToken) return;
    playing = false;
    playbackFailed = true;
    feedback(error.message, 'missed');
    $('sample-status').textContent = error.message;
    renderControls();
    renderAnswers();
  }
}
function nextQuestion() {
  clearAuto();
  stopPlayback();
  if (settings.count && session.answered >= settings.count) { finishSession(); return; }
  question = createQuestion(settings, question);
  missed = false;
  attempted = new Set();
  playbackFailed = false;
  phase = 'asking';
  feedback('Listen to the two notes…');
  render();
  playQuestion();
}
function startSession() {
  clearAuto();
  stopPlayback();
  session = newSession();
  question = null;
  nextQuestion();
}
function answer(semitones, reveal = false) {
  if (phase !== 'asking' || playing || (!reveal && attempted.has(semitones))) return;
  if (playbackFailed && !reveal) { feedback('Press Replay to hear the interval before answering.', 'missed'); return; }
  if (!reveal && semitones !== question.semitones) {
    missed = true;
    session.streak = 0;
    attempted.add(semitones);
    feedback(`${intervalBy(semitones).name} · try again`, 'missed');
    renderAnswers();
    renderProgress();
    return;
  }
  phase = 'answered';
  recordResult(session, question.semitones, !missed && !reveal);
  const name = intervalBy(question.semitones).name;
  const mode = { ascending: 'ascending', descending: 'descending', harmonic: 'together' }[question.mode];
  feedback(reveal ? `${name} · ${mode}` : `Correct · ${name.toLowerCase()} (${mode})`, reveal ? '' : 'success');
  render();
  playQuestion('slow');
}
function finishSession() {
  clearAuto();
  stopPlayback();
  // An unfinished question is excluded from the score and never revealed by End.
  if (phase === 'asking') question = null;
  phase = 'summary';
  const percent = session.answered ? Math.round(session.correct / session.answered * 100) : 0;
  $('summary-copy').textContent = session.answered ? `${session.correct} of ${session.answered} correct on the first try (${percent}%). Best streak: ${session.bestStreak}.` : 'No questions completed yet. Start again whenever you’re ready.';
  $('results-body').replaceChildren(...Object.entries(session.byInterval).map(([semitones, result]) => {
    const row = document.createElement('tr');
    for (const content of [intervalBy(Number(semitones)).name, `${result.correct} / ${result.answered}`, `${Math.round(result.correct / result.answered * 100)}%`]) {
      const cell = document.createElement('td'); cell.textContent = content; row.append(cell);
    }
    return row;
  }));
  $('practice-missed').hidden = !Object.values(session.byInterval).some(result => result.correct < result.answered);
  render();
  $('restart').focus({ preventScroll: true });
}

$('primary').addEventListener('click', () => {
  if (phase === 'ready') startSession();
  else if (phase === 'asking') { clearAuto(); playQuestion(); }
  else if (phase === 'answered') nextQuestion();
});
$('replay').addEventListener('click', () => { clearAuto(); playQuestion(); });
$('replay-slow').addEventListener('click', () => { clearAuto(); playQuestion('slow'); });
$('reveal').addEventListener('click', () => answer(question?.semitones, true));
$('end-session').addEventListener('click', finishSession);
$('restart').addEventListener('click', startSession);
$('practice-missed').addEventListener('click', () => {
  settings.intervals = Object.entries(session.byInterval).filter(([, result]) => result.correct < result.answered).map(([semitones]) => Number(semitones));
  saveSettings(); fillSettings(); startSession();
});
$('volume').addEventListener('input', event => {
  settings.volume = Number(event.target.value) / 100;
  audio.setVolume(settings.volume);
  saveSettings();
});
$('preview-instrument').addEventListener('click', () => activateNote(60));
$('preset').addEventListener('change', () => {
  const preset = PRESETS[$('preset').value];
  if (preset) document.querySelectorAll('input[name="interval"]').forEach(input => { input.checked = preset.includes(Number(input.value)); });
});
$('interval-options').addEventListener('change', () => {
  const intervals = [...document.querySelectorAll('input[name="interval"]:checked')].map(input => Number(input.value));
  $('preset').value = presetFor(intervals);
});
$('settings').addEventListener('toggle', () => { if ($('settings').open) clearAuto(); });
$('settings-form').addEventListener('submit', event => {
  event.preventDefault();
  const intervals = [...document.querySelectorAll('input[name="interval"]:checked')].map(input => Number(input.value));
  if (intervals.length === 0) {
    $('settings-error').textContent = 'Choose at least one interval.';
    $('settings-error').hidden = false;
    return;
  }
  $('settings-error').hidden = true;
  const active = phase === 'asking' || phase === 'answered';
  settings = normalizeSettings({ ...settings, intervals, mode: $('mode').value, count: Number($('count').value), speed: $('speed').value, rootNote: $('root-note').value === 'varied' ? null : Number($('root-note').value), autoNext: $('auto-next').checked });
  saveSettings();
  clearAuto();
  $('settings').open = false;
  if (active) startSession();
  else {
    stopPlayback(); phase = 'ready'; question = null; session = newSession();
    feedback('Settings updated. Start practice to hear your first interval.'); render();
  }
});
document.querySelectorAll('[data-instrument]').forEach(button => button.addEventListener('click', () => {
  clearAuto();
  stopPlayback();
  settings.instrument = button.dataset.instrument;
  saveSettings();
  renderInstrument();
  renderControls();
  if (question) playQuestion(phase === 'asking' ? settings.speed : 'slow');
  else $('sample-status').textContent = '';
}));
for (const id of ['demo-first', 'demo-second']) $(id).addEventListener('click', () => activateNote(Number($(id).dataset.midi)));

document.addEventListener('keydown', event => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const target = event.target;
  if (target instanceof Element && target.closest('input, select, textarea, [contenteditable="true"]')) return;
  if ((event.code === 'Space' || event.key === 'Enter') && target instanceof Element && target.closest('button, summary, [role="button"]')) return;
  if (event.code === 'Space') {
    event.preventDefault();
    if (phase === 'summary') startSession(); else if (!$('primary').disabled) $('primary').click();
  } else if (event.key.toLowerCase() === 'r' && question && !playing) {
    event.preventDefault(); clearAuto(); playQuestion();
  } else {
    const index = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='].indexOf(event.key);
    if (index >= 0 && phase === 'asking' && settings.intervals[index] != null) { event.preventDefault(); answer(settings.intervals[index]); }
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearAuto(); stopPlayback(); renderControls(); renderAnswers(); } });
window.addEventListener('pagehide', () => { clearAuto(); stopPlayback(); });
$('sample-status').textContent = '';
fillSettings();
render();
