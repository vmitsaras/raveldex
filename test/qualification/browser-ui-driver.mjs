import './browser-ui-entry.mjs';

await window.createFixture();
const status = document.getElementById('fixture-status');
status.textContent = 'Installed fixture UI ready.';
for (const [id, action, message] of [
  ['inject-error', () => { window.harness.state.failNext = true; }, 'The next search will display a deliberately injected WORK_LIMIT_EXCEEDED.'],
  ['destroy-ui', () => { window.harness.destroy(); }, 'UI destroyed; authored fallback restored. Borrowed engine remains usable.'],
  ['remount-ui', () => { window.harness.remount(); }, 'UI remounted over the same borrowed engine.'],
]) {
  document.getElementById(id).addEventListener('click', () => { action(); status.textContent = message; });
}
