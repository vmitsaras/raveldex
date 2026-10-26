// Test-only, opt-in observation. No event cancellation, synthetic input or UI policy changes.
import './browser-ui-entry.mjs';

const root = document.getElementById('fixture-root');
const start = document.getElementById('input-start');
const stop = document.getElementById('input-stop');
const output = document.getElementById('input-trace');
const status = document.getElementById('input-recording-status');
const source = document.getElementById('input-source');
const MAX_ROWS = 300, MAX_TEXT = 256;
const bounded = value => typeof value === 'string' ? { text: value.slice(0, MAX_TEXT), codeUnits: value.length } : null;
let recording = false, rows = [], droppedRows = 0, sequence = 0, startedAt, startedMs, observedComposing = false, session, identity;
const target = element => element instanceof Element ? { tag: element.tagName.toLowerCase(),
  id: element.id, hooks: element.getAttributeNames().filter(name => name.startsWith('data-raveldex-')) } : null;
function current() {
  const input = root.querySelector('[data-raveldex-input]');
  return { value: bounded(input?.value), selectionStart: input?.selectionStart ?? null, selectionEnd: input?.selectionEnd ?? null,
    focus: target(document.activeElement), status: bounded(root.querySelector('[data-raveldex-status]')?.textContent),
    busy: root.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') ?? null,
    observedComposing, calls: window.harness?.state.calls.length ?? 0 };
}
function record(kind, details = {}) {
  if (!recording) return;
  rows.push({ sequence: ++sequence, elapsedMs: performance.now() - startedMs, kind, ...details, current: current() });
  if (rows.length > MAX_ROWS) { rows.shift(); droppedRows++; }
}
function snapshot() {
  return { kind: 'raveldex-rx4002-input-observation-v1', startedAt, recording, session,
    environment: { userAgent: navigator.userAgent, language: navigator.language, devicePixelRatio: window.devicePixelRatio },
    limits: { rows: MAX_ROWS, textCodeUnits: MAX_TEXT }, droppedRows,
    scope: 'Only this fixture search field and form are observed after Start recording. Trusted flags do not prove physical input: browser automation can also create trusted events. OS input source is operator-reported. No speech or VoiceOver cursor is captured.',
    current: current(), rows: structuredClone(rows) };
}
const events = ['compositionstart', 'compositionupdate', 'compositionend', 'beforeinput', 'input', 'keydown', 'submit', 'focusin', 'focusout'];
const eventDetails = new WeakMap();
for (const type of events) {
document.addEventListener(type, event => {
  const input = root.querySelector('[data-raveldex-input]');
  if (!recording || !input || event.target !== (type === 'submit' ? input.form : input)) return;
  // Only composition-related keys and Return are logged; unrelated controls/text are excluded.
  if (type === 'keydown' && !['Enter', 'Process', 'Dead'].includes(event.key) && event.keyCode !== 229) return;
  if (type === 'compositionstart') observedComposing = true;
  if (type === 'compositionend') observedComposing = false;
  const details = { event: type, isTrusted: event.isTrusted, eventTimeStamp: event.timeStamp,
    data: bounded(event.data), inputType: event.inputType ?? null, isComposing: event.isComposing ?? null,
    key: event.key ?? null, keyCode: event.keyCode ?? null, defaultPrevented: event.defaultPrevented,
    target: target(event.target) };
  record('event-capture', details);
  eventDetails.set(event, details);
}, true);
// This propagation point follows the UI's input/form handlers. A stopped event
// may have only a capture row; no later observation is invented for it.
document.addEventListener(type, event => {
  const details = eventDetails.get(event);
  if (details) record('event-bubble-after-ui', { ...details, defaultPrevented: event.defaultPrevented });
});
}
new MutationObserver(() => record('presentation')).observe(root, { subtree: true, childList: true,
  characterData: true, attributes: true, attributeFilter: ['aria-busy'] });

start.addEventListener('click', event => {
  rows = []; droppedRows = 0; sequence = 0; observedComposing = false;
  startedAt = new Date().toISOString(); startedMs = performance.now();
  session = { ...identity, inputSource: bounded(source.value) };
  output.value = ''; recording = true;
  record('start', { isTrusted: event.isTrusted });
  status.textContent = 'Recording input in the search field. Use only test text.';
});
stop.addEventListener('click', event => {
  record('stop', { isTrusted: event.isTrusted }); recording = false;
  output.value = JSON.stringify(snapshot(), null, 2);
  status.textContent = 'Recording stopped. Input trace is ready below.';
});

try {
  const response = await fetch('/matrix/session');
  if (!response.ok) throw new Error('Input observation package identity is unavailable.');
  const saved = await response.json();
  if (![saved.packageSha256, saved.manifestSha256].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
    || typeof saved.sessionId !== 'string' || !saved.sessionId || saved.sessionId.length > 128)
    throw new Error('Input observation package identity is invalid.');
  identity = { sessionId: saved.sessionId, manifestSha256: saved.manifestSha256, packageSha256: saved.packageSha256 };
  await window.createFixture({}, { observeSearch(call, index) {
    record('search-call', { callIndex: index, phase: call.options.extensions?.facets ? 'main'
      : call.options.extensions?.snippets ? 'snippets' : 'other', query: bounded(JSON.stringify(call.query)) });
  } });
  document.getElementById('fixture-status').textContent = 'Installed fixture UI ready.';
  document.getElementById('input-identity').textContent = `Installed package SHA-256: ${identity.packageSha256}`;
  start.disabled = false; stop.disabled = false;
  window.inputProbe = Object.freeze({ snapshot });
} catch (error) {
  recording = false; start.disabled = true; stop.disabled = true;
  status.textContent = 'Input observation setup failed. Reload to retry.';
  document.getElementById('fixture-status').textContent = 'Input observation is unavailable.';
  throw error;
}
