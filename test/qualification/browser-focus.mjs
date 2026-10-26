// Test-only DOM observation over the original UI driver. Never changes focus,
// cancels an event or writes to the UI's busy/live-region policy.
import './browser-ui-driver.mjs';

const root = document.getElementById('fixture-root');
const start = document.getElementById('focus-start');
const stop = document.getElementById('focus-stop');
const output = document.getElementById('focus-trace');
const state = document.getElementById('focus-recording-state');
const MAX_ROWS = 300, MAX_TEXT = 256;
const bounded = value => typeof value === 'string' ? { text: value.slice(0, MAX_TEXT), codeUnits: value.length } : null;
const target = node => node instanceof Element ? { tag: node.tagName.toLowerCase(), id: node.id,
  hooks: node.getAttributeNames().filter(name => name.startsWith('data-raveldex-')) } : null;
let recording = false, rows = [], droppedRows = 0, droppedDeferredSamples = 0, cancelledDeferredSamples = 0;
let sequence = 0, startedAt, startedMs, session, generation = 0;
const timers = new Set();
function current() {
  return { focus: target(document.activeElement), query: bounded(root.querySelector('[data-raveldex-input]')?.value),
    status: bounded(root.querySelector('[data-raveldex-status]')?.textContent),
    busy: root.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') ?? null,
    dialogOpen: root.querySelector('dialog')?.open ?? false };
}
function record(kind, details = {}) {
  if (!recording) return;
  rows.push({ sequence: ++sequence, elapsedMs: performance.now() - startedMs, kind, ...details, current: current() });
  if (rows.length > MAX_ROWS) { rows.shift(); droppedRows++; }
}
function snapshot() {
  return { kind: 'raveldex-rx4002-focus-observation-v1', startedAt, recording, session,
    environment: { url: location.href, userAgent: navigator.userAgent, language: navigator.language, devicePixelRatio },
    limits: { rows: MAX_ROWS, textCodeUnits: MAX_TEXT }, droppedRows, droppedDeferredSamples, cancelledDeferredSamples,
    scope: 'Opt-in DOM focus/event/status observations in the unchanged fixture root. Later-task samples follow event dispatch; they do not prove causality. No speech, VoiceOver cursor or physical-input proof. Trusted events can also be automated. Only test query text should be entered.',
    current: current(), rows: structuredClone(rows) };
}
function cancelTimers() { cancelledDeferredSamples += timers.size; for (const timer of timers) clearTimeout(timer); timers.clear(); }
for (const type of ['click', 'keydown', 'focusin', 'focusout']) {
  document.addEventListener(type, event => {
    // Native modal traversal can leave document.activeElement at body between
    // Tab stops. Include that boundary while this fixture's dialog is open.
    const modalBoundary = root.querySelector('dialog')?.open && event.target === document.body;
    if (!recording || (!root.contains(event.target) && !modalBoundary)) return;
    if (type === 'keydown' && !['Tab', 'Enter', ' ', 'Escape'].includes(event.key)) return;
    const details = { event: type, isTrusted: event.isTrusted, target: target(event.target),
      relatedTarget: target(event.relatedTarget), key: event.key ?? null, shiftKey: event.shiftKey ?? null,
      ctrlKey: event.ctrlKey ?? null, altKey: event.altKey ?? null, metaKey: event.metaKey ?? null,
      defaultPrevented: event.defaultPrevented, eventTimeStamp: event.timeStamp };
    record('event-capture', details);
    // Capture-phase keydown is before native Tab traversal. Sample in a later
    // task as well; bounded pending timers cannot flood the page when capped.
    if (type === 'keydown' || type === 'click') {
      if (timers.size >= MAX_ROWS) { droppedDeferredSamples++; return; }
      const run = generation;
      const timer = setTimeout(() => { timers.delete(timer); if (run === generation) record('after-event-task', details); }, 0);
      timers.add(timer);
    }
  }, true);
}
new MutationObserver(() => record('presentation')).observe(root, { subtree: true, childList: true,
  characterData: true, attributes: true, attributeFilter: ['aria-busy', 'open'] });
start.addEventListener('click', event => {
  cancelTimers(); generation++; rows = []; sequence = 0; droppedRows = 0; droppedDeferredSamples = 0; cancelledDeferredSamples = 0;
  startedAt = new Date().toISOString(); startedMs = performance.now(); output.value = ''; recording = true;
  record('start', { isTrusted: event.isTrusted }); state.textContent = 'Recording DOM observations. Trace stays on this page.';
});
stop.addEventListener('click', event => {
  record('stop', { isTrusted: event.isTrusted }); recording = false; cancelTimers(); generation++;
  output.value = JSON.stringify(snapshot(), null, 2); state.textContent = 'Stopped. DOM trace is available below.';
});
try {
  const response = await fetch('/matrix/session');
  if (!response.ok) throw new Error('Focus observation package identity is unavailable.');
  const identity = await response.json();
  if (![identity.packageSha256, identity.manifestSha256].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
    || typeof identity.sessionId !== 'string' || !identity.sessionId || identity.sessionId.length > 128)
    throw new Error('Focus observation package identity is invalid.');
  session = { packageSha256: identity.packageSha256, manifestSha256: identity.manifestSha256, sessionId: identity.sessionId };
  document.getElementById('focus-identity').textContent = `Installed package SHA-256: ${session.packageSha256}`;
  start.disabled = false; stop.disabled = false;
  window.focusProbe = Object.freeze({ snapshot });
} catch (error) {
  state.textContent = 'Focus observation setup failed. Reload to retry.';
  throw error;
}
