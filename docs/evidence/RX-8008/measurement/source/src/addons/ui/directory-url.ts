import type { DirectoryHandle, DirectoryState, DirectoryURLBinding, DirectoryURLHost, DirectoryURLIssue, DirectoryURLOptions, DirectoryURLParameters, DirectoryURLSnapshot } from './directory-types.js';
import type { CapturedDirectory } from './directory-state.js';
import { captureState, directoryConfigurations, failDirectory, object, queryText, stateKey, text } from './directory-state.js';
import { RaveldexError } from '../../core/errors/error.js';

const owners = new WeakMap<DirectoryURLHost, Map<string, DirectoryURLBinding>>();
const connections = new WeakMap<DirectoryHandle, DirectoryURLBinding>();
type Failure = NonNullable<DirectoryURLSnapshot['error']>;
class URLRefusal extends Error {
  constructor(readonly reason: Failure) { super('Directory URL refused'); }
}
interface Segment { readonly raw: string; readonly name: string | undefined; readonly encoded: string }
interface LocationParts { readonly href: string; readonly base: string; readonly hash: string; readonly segments: readonly Segment[] }
const decode = (value: string): string => decodeURIComponent(value.replaceAll('+', ' '));
function location(host: DirectoryURLHost): LocationParts {
  const href = host.location.href;
  if (typeof href !== 'string' || href.length > 65_536) throw new URLRefusal('url-limit');
  const parsed = new URL(href);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new URLRefusal('location-refused');
  const hashIndex = href.indexOf('#'), hash = hashIndex < 0 ? '' : href.slice(hashIndex), main = hashIndex < 0 ? href : href.slice(0, hashIndex);
  const queryIndex = main.indexOf('?'), base = queryIndex < 0 ? main : main.slice(0, queryIndex);
  const raw = queryIndex < 0 ? '' : main.slice(queryIndex + 1);
  const segments = raw ? raw.split('&').map(value => {
    const at = value.indexOf('='), key = at < 0 ? value : value.slice(0, at);
    let name: string | undefined;
    try { name = decode(key); } catch { /* Opaque unrelated names are preserved. */ }
    return { raw: value, name, encoded: at < 0 ? '' : value.slice(at + 1) };
  }) : [];
  return { href, base, hash, segments };
}
function parameters(input: unknown, config: CapturedDirectory): DirectoryURLParameters {
  const p = object(input, ['query', 'page', 'filters'], 'url.parameters');
  const source = object(p.filters, config.groups.map(g => g.field), 'url.parameters.filters');
  const names = new Set<string>();
  const name = (input: unknown): string => {
    const value = text(input, 64, 'url.parameter');
    if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(value) || names.has(value)) failDirectory('url.parameter');
    names.add(value); return value;
  };
  const query = name(p.query), page = name(p.page), filters: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const group of config.groups) filters[group.field] = name(source[group.field]);
  return Object.freeze({ query, page, filters: Object.freeze(filters) });
}
function readState(parts: LocationParts, config: CapturedDirectory, p: DirectoryURLParameters, names: ReadonlySet<string>): { state: DirectoryState; issues: readonly DirectoryURLIssue[] } {
  const issues: DirectoryURLIssue[] = [], issued = new Set<string>();
  const issue = (parameter: string, reason: DirectoryURLIssue['reason']): void => {
    const key = parameter + ':' + reason;
    if (!issued.has(key)) { issued.add(key); issues.push(Object.freeze({ parameter, reason })); }
  };
  const entries = parts.segments.filter(s => s.name !== undefined && names.has(s.name));
  if (entries.reduce((sum, s) => sum + s.raw.length, 0) > 16_384) {
    return { state: captureState(config, { text: '', filters: {}, page: 1 }), issues: Object.freeze([{ parameter: p.query, reason: 'limit' }]) };
  }
  const values = (parameter: string): readonly string[] => entries.filter(s => s.name === parameter).map(s => s.encoded);
  let raw = '', page = 1;
  const queries = values(p.query);
  if (queries.length > 1) issue(p.query, 'duplicate');
  else if (queries.length) {
    try { raw = queryText(decode(queries[0]!)); } catch { issue(p.query, 'invalid'); }
  }
  const pages = values(p.page);
  if (pages.length > 1) issue(p.page, 'duplicate');
  else if (pages.length) {
    try {
      const value = decode(pages[0]!);
      if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > config.maxPage) issue(p.page, 'invalid');
      else page = Number(value);
    } catch { issue(p.page, 'invalid'); }
  }
  const filters: Record<string, readonly string[]> = Object.create(null) as Record<string, readonly string[]>;
  for (const group of config.groups) {
    const parameter = p.filters[group.field]!, selected = new Set<string>();
    for (const encoded of values(parameter)) {
      try {
        const value = text(decode(encoded), 1_024, 'url.value');
        if (!group.values.includes(value)) { issue(parameter, 'unknown'); continue; }
        if (selected.has(value)) issue(parameter, 'duplicate');
        selected.add(value);
      } catch { issue(parameter, 'invalid'); }
    }
    if (selected.size > 16) { issue(parameter, 'limit'); selected.clear(); }
    filters[group.field] = [...selected];
  }
  let state: DirectoryState;
  try { state = captureState(config, { text: raw, filters, page: issues.length ? 1 : page }); }
  catch {
    issue(config.groups.length ? p.filters[config.groups[0]!.field]! : p.query, 'limit');
    state = captureState(config, { text: raw, filters: {}, page: 1 });
  }
  return { state, issues: Object.freeze(issues) };
}
function serialize(parts: LocationParts, state: DirectoryState, config: CapturedDirectory, p: DirectoryURLParameters, names: ReadonlySet<string>): string {
  const owned: string[] = [];
  const add = (name: string, value: string): void => { owned.push(encodeURIComponent(name) + '=' + encodeURIComponent(value)); };
  if (state.text.length) add(p.query, state.text);
  if (state.page !== 1) add(p.page, String(state.page));
  for (const group of config.groups) for (const value of state.filters[group.field]!) add(p.filters[group.field]!, value);
  if (owned.join('&').length > 16_384) throw new URLRefusal('url-limit');
  const segments = parts.segments.filter(s => s.name === undefined || !names.has(s.name)).map(s => s.raw).concat(owned);
  const result = parts.base + (segments.length ? '?' + segments.join('&') : '') + parts.hash;
  if (result.length > 65_536) throw new URLRefusal('url-limit');
  return result;
}

/** Explicit named-parameter binding. Construction never reads or writes a URL. */
export function connectDirectoryURL(options: DirectoryURLOptions): DirectoryURLBinding {
  const o = object(options, ['controller', 'host', 'parameters', 'history'], 'url.options');
  const controller = o.controller as DirectoryHandle, config = directoryConfigurations.get(controller);
  if (!config || connections.has(controller)) failDirectory('url.controller');
  const host = o.host as DirectoryURLHost;
  try {
    if (!host || typeof host !== 'object' || typeof host.addEventListener !== 'function' || typeof host.removeEventListener !== 'function' ||
      !host.history || typeof host.history.pushState !== 'function' || typeof host.history.replaceState !== 'function') failDirectory('url.host');
  } catch { failDirectory('url.host', 'UNSUPPORTED_ENVIRONMENT'); }
  const p = parameters(o.parameters, config), names = new Set([p.query, p.page, ...Object.values(p.filters)]);
  const policy = o.history === undefined ? 'replace' : o.history;
  if (policy !== 'push' && policy !== 'replace') failDirectory('url.history');
  // Application host accessors/admission traps may reenter construction.
  if (directoryConfigurations.get(controller) !== config || connections.has(controller)) failDirectory('url.controller');
  const claimed = owners.get(host) ?? new Map<string, DirectoryURLBinding>();
  if ([...names].some(name => claimed.has(name))) failDirectory('url.ownership');
  let ended = false, epoch = 0, unsubscribe = (): void => {};
  let snapshot: DirectoryURLSnapshot = Object.freeze({ status: 'connected', issues: Object.freeze([]) });
  let lastState = stateKey(controller.getSnapshot().state);
  const live = (ticket: number): boolean => !ended && epoch === ticket && controller.getSnapshot().status !== 'destroyed';
  const error = (ticket: number, reason: Failure, issues = snapshot.issues): void => {
    if (live(ticket)) snapshot = Object.freeze({ status: 'error', error: reason, issues });
  };
  function mutate(next: string, mode: 'push' | 'replace', ticket: number, eligible: () => boolean): void {
    const history = host.history, action = history[mode === 'push' ? 'pushState' : 'replaceState'], state = history.state;
    // Native host accessors can be wrapped by the application. Check ownership
    // after all reads, before invoking the actual history method.
    if (live(ticket) && eligible()) Reflect.apply(action, history, [state, '', next]);
  }
  function writeState(state: DirectoryState, mode: 'push' | 'replace', keepIssues = false): void {
    if (ended || controller.getSnapshot().status === 'destroyed') return;
    const ticket = ++epoch, issues = keepIssues ? snapshot.issues : Object.freeze([]);
    let parts: LocationParts, next: string;
    try { parts = location(host); next = serialize(parts, state, config!, p, names); }
    catch (reason) { error(ticket, reason instanceof URLRefusal ? reason.reason : 'location-refused', issues); return; }
    if (!live(ticket)) return;
    try {
      if (next !== parts.href) mutate(next, mode, ticket, () => stateKey(controller.getSnapshot().state) === stateKey(state));
      if (live(ticket)) snapshot = Object.freeze({ status: 'connected', issues });
    } catch { error(ticket, 'write-refused', issues); }
  }
  const binding: DirectoryURLBinding = Object.freeze({
    getSnapshot: () => snapshot,
    read: async (): Promise<void> => {
      if (ended || controller.getSnapshot().status === 'destroyed') return;
      const ticket = ++epoch, before = controller.getSnapshot();
      let parsed: ReturnType<typeof readState>, parts: LocationParts;
      try { parts = location(host); parsed = readState(parts, config, p, names); }
      catch (reason) {
        error(ticket, reason instanceof URLRefusal ? reason.reason : 'location-refused');
        if (live(ticket) && before.status === 'idle') await controller.refresh();
        return;
      }
      if (!live(ticket)) return;
      snapshot = Object.freeze({ status: 'connected', issues: parsed.issues });
      try {
        const next = serialize(parts, parsed.state, config, p, names);
        if (live(ticket) && next !== parts.href) mutate(next, 'replace', ticket, () => controller.getSnapshot() === before);
      } catch (reason) { error(ticket, reason instanceof URLRefusal ? reason.reason : 'write-refused', parsed.issues); }
      if (!live(ticket) || controller.getSnapshot() !== before) return;
      await controller.restore(parsed.state);
    },
    write: (): void => { writeState(controller.getSnapshot().state, 'replace'); },
    destroy: (): void => {
      if (ended) return;
      ended = true; epoch++; unsubscribe();
      try { host.removeEventListener('popstate', onPop); } catch { /* Release ownership even when a foreign host is gone. */ }
      for (const name of names) if (claimed.get(name) === binding) claimed.delete(name);
      if (!claimed.size && owners.get(host) === claimed) owners.delete(host);
      if (connections.get(controller) === binding) connections.delete(controller);
      snapshot = Object.freeze({ status: 'destroyed', issues: snapshot.issues });
    },
  });
  const onPop = (): void => { void binding.read(); };
  for (const name of names) claimed.set(name, binding);
  owners.set(host, claimed); connections.set(controller, binding);
  try {
    unsubscribe = controller.subscribe(value => {
      if (value.status === 'destroyed') { binding.destroy(); return; }
      const key = stateKey(value.state);
      if (key === lastState) return;
      lastState = key;
      if (value.change !== 'restore') writeState(value.state, value.change === 'update' || value.change === 'page' ? policy : 'replace', value.change === 'recovery');
    });
    host.addEventListener('popstate', onPop);
    // A wrapped listener installer may destroy the owner before attaching.
    if (ended) host.removeEventListener('popstate', onPop);
  } catch (reason) { binding.destroy(); if (reason instanceof RaveldexError) throw reason; failDirectory('url.host', 'UNSUPPORTED_ENVIRONMENT'); }
  return binding;
}
