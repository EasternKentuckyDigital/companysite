import { INTERVALS, PRESETS, INSTRUMENTS, normalizeSettings, createQuestion, noteName, isBlackKey, intervalBy, stringPositions, newSession, recordResult } from './music.js';
import { PianoAudio } from './audio.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'ekd-ear-training-v1';
let settings;
try { settings = normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
catch { settings = normalizeSettings(); }
const audio = new PianoAudio();
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
const playedTimers = new Set();

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
  const modes = { ascending: 'ascending', descending: 'descending', mixed: 'both directions', harmonic: 'together' };
  $('settings-description').textContent = `${settings.intervals.length} intervals · ${modes[settings.mode]} · ${settings.count ? `${settings.count} questions` : 'unlimited'}`;
  $('apply-settings').textContent = phase === 'asking' || phase === 'answered' ? 'Apply & restart session' : 'Apply settings';
}
function fillSettings() {
  $('preset').value = presetFor(settings.intervals);
  for (const id of ['mode', 'count', 'speed']) $(id).value = String(settings[id]);
  $('fixed-root').checked = settings.fixedRoot;
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
    button.disabled = phase !== 'asking' || attempted.has(semitones);
    const name = document.createElement('strong');
    name.textContent = interval.name;
    const short = document.createElement('span');
    short.className = 'interval-short';
    short.textContent = interval.short;
    const shortcut = document.createElement('kbd');
    shortcut.textContent = index < 9 ? index + 1 : ['0', '−', '='][index - 9];
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
  $('last-shortcut').textContent = settings.intervals.length <= 9 ? settings.intervals.length : '=';
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
  $('score').textContent = `${session.correct} / ${session.answered} first try`;
  $('streak').textContent = `${session.streak} streak`;
  if (phase === 'ready') $('question-count').textContent = 'Ready when you are';
  else if (phase === 'summary') $('question-count').textContent = `${session.answered} questions completed`;
  else $('question-count').textContent = `Question ${session.answered + (phase === 'asking' ? 1 : 0)}${settings.count ? ` of ${settings.count}` : ''}`;
}
function renderControls() {
  $('primary-label').textContent = phase === 'ready' ? 'Start practice' : phase === 'asking' ? (playing ? 'Playing…' : 'Hear again') : settings.count && session.answered >= settings.count ? 'See results' : 'Next interval';
  $('primary').disabled = phase === 'asking' && playing;
  $('replay').disabled = !question || playing;
  $('reveal').disabled = phase !== 'asking';
  $('replay-slow').hidden = phase !== 'answered' && !(phase === 'summary' && question);
  $('end-session').hidden = phase === 'ready' || phase === 'summary';
  $('settings-note').textContent = phase === 'asking' || phase === 'answered' ? 'Applying changes starts a new session.' : 'Settings are saved in this browser.';
  updateSettingsDescription();
}
function noteRole(midi) {
  if (!question || (phase !== 'answered' && phase !== 'summary')) return -1;
  return question.notes.indexOf(midi);
}
function activateNote(midi) {
  clearAuto();
  stopPlayback();
  renderControls();
  audio.playNote(midi).catch(error => feedback(error.message, 'missed'));
  const elements = document.querySelectorAll(`[data-midi="${midi}"]`);
  elements.forEach(el => el.classList.add('sounding'));
  const timer = setTimeout(() => {
    elements.forEach(el => el.classList.remove('sounding'));
    playedTimers.delete(timer);
  }, 500);
  playedTimers.add(timer);
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
  if (question && (phase === 'answered' || phase === 'summary')) {
    question.notes.forEach((midi, role) => {
      for (const position of stringPositions(settings.instrument, midi)) {
        // On a fretless instrument the finger stops the string at the pitch
        // position itself. Fretted instruments show the finger behind the fret.
        const cx = position.fret === 0 ? left - 27 : config.fretless ? x(position.fret) : (x(position.fret) + x(position.fret - 1)) / 2;
        const cy = y(position.string);
        const marker = svgElement('g', { class: `note-position ${role === 0 ? 'note-first' : 'note-second'}`, role: 'button', tabindex: '0', 'aria-label': `Play ${noteName(midi)}, note ${role + 1}, ${noteName(config.tuning[position.string])} string, ${position.fret === 0 ? 'open' : `${config.fretless ? 'semitone' : 'fret'} ${position.fret}`}`, 'data-midi': midi });
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
  document.querySelectorAll('[data-instrument]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.instrument === instrument)));
  $('instrument-title').textContent = `On the ${instrument}`;
  const visible = question && (phase === 'answered' || phase === 'summary');
  $('note-legend').hidden = !visible;
  if (visible) {
    const together = question.mode === 'harmonic';
    $('first-note').textContent = `${together ? 'Lower' : 'First'}: ${noteName(question.notes[0])}`;
    $('second-note').textContent = `${together ? 'Upper' : 'Second'}: ${noteName(question.notes[1])}`;
    $('visual-explanation').textContent = `${question.notes.map(noteName).join(together ? ' + ' : ' → ')} · ${question.semitones} semitone${question.semitones === 1 ? '' : 's'}`;
  } else {
    $('visual-explanation').textContent = 'The notes appear after a correct answer or reveal.';
  }
  $('instrument-note').textContent = {
    piano: 'Two octaves · C3–C5 · 25 keys',
    guitar: 'Standard E–A–D–G–B–E · 12 frets · high E at top',
    violin: 'G–D–A–E · dashed semitone guides, no frets',
    mandolin: 'G–D–A–E · four pairs of strings · 12 frets',
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
function animateNote(midi, delay, token) {
  animationTimers.push(setTimeout(() => {
    if (token !== audioToken) return;
    document.querySelectorAll(`[data-midi="${midi}"]`).forEach(el => el.classList.add('sounding'));
  }, delay));
  animationTimers.push(setTimeout(() => {
    if (token !== audioToken) return;
    document.querySelectorAll(`[data-midi="${midi}"]`).forEach(el => el.classList.remove('sounding'));
  }, delay + 500));
}
async function playQuestion(speed = settings.speed) {
  if (!question) return;
  stopPlayback();
  const token = audioToken;
  const currentQuestion = question;
  playing = true;
  renderControls();
  try {
    const result = await audio.play(currentQuestion, speed);
    if (token !== audioToken || !result) return;
    playbackFailed = false;
    if (phase === 'asking') feedback('Which interval did you hear?');
    if (phase === 'answered' || phase === 'summary') {
      animateNote(currentQuestion.notes[0], 35, token);
      animateNote(currentQuestion.notes[1], result.gap * 1000 + 35, token);
    }
    animationTimers.push(setTimeout(() => {
      if (token !== audioToken) return;
      playing = false;
      renderControls();
    }, result.duration * 1000));
  } catch (error) {
    if (token !== audioToken) return;
    playing = false;
    playbackFailed = true;
    feedback(error.message, 'missed');
    renderControls();
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
  if (phase !== 'asking' || (!reveal && attempted.has(semitones))) return;
  if (playbackFailed && !reveal) { feedback('Press Replay to hear the interval before answering.', 'missed'); return; }
  if (!reveal && semitones !== question.semitones) {
    missed = true;
    session.streak = 0;
    attempted.add(semitones);
    feedback(`${intervalBy(semitones).name} — try again. You can replay the notes.`, 'missed');
    renderAnswers();
    renderProgress();
    return;
  }
  phase = 'answered';
  recordResult(session, question.semitones, !missed && !reveal);
  const name = intervalBy(question.semitones).name;
  const mode = { ascending: 'ascending', descending: 'descending', harmonic: 'together' }[question.mode];
  feedback(reveal ? `${name} (${mode}). Listen again and compare the notes below.` : `${missed ? 'That’s it' : 'Correct'} — ${name.toLowerCase()} (${mode}).`, reveal ? '' : 'success');
  render();
  // Completing a question never hides its visualization immediately.
  if (settings.autoNext) autoTimer = setTimeout(nextQuestion, 4000);
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
  settings = normalizeSettings({ ...settings, intervals, mode: $('mode').value, count: Number($('count').value), speed: $('speed').value, fixedRoot: $('fixed-root').checked, autoNext: $('auto-next').checked });
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
  settings.instrument = button.dataset.instrument;
  clearAuto();
  saveSettings();
  renderInstrument();
}));
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('theme-toggle').setAttribute('aria-checked', String(theme === 'dark'));
  $('theme-toggle').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
}
$('theme-toggle').addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('theme', theme); } catch { /* The current visit still changes theme. */ }
  applyTheme(theme);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
  let stored; try { stored = localStorage.getItem('theme'); } catch { /* Use the system theme. */ }
  if (!['light', 'dark'].includes(stored)) applyTheme(event.matches ? 'dark' : 'light');
});
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
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearAuto(); stopPlayback(); renderControls(); } });
window.addEventListener('pagehide', () => { clearAuto(); stopPlayback(); for (const timer of playedTimers) clearTimeout(timer); });
applyTheme(document.documentElement.dataset.theme || 'light');
fillSettings();
render();
