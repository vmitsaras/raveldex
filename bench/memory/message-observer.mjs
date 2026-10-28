// Task-only protocol observation. Payloads and native envelopes are forwarded unchanged.
export function observeMessages(native, realm) {
  if (!['main', 'worker'].includes(realm)) throw Error('Unknown realm');
  const rows = [], listeners = new Map();
  const post = native.postMessage.bind(native);
  const add = native.addEventListener.bind(native), remove = native.removeEventListener.bind(native);
  let sequence = 0, dropped = 0;
  function note(data, direction, edge, token) {
    if (rows.length >= 1024) { dropped++; return; }
    rows.push({ sequence: ++sequence, token, realm, direction, edge,
      protocol: Number.isSafeInteger(data?.protocol) ? data.protocol : null,
      session: typeof data?.session === 'string' ? data.session : null,
      id: Number.isSafeInteger(data?.id) ? data.id : null,
      operation: typeof data?.operation === 'string' ? data.operation : null,
      kind: typeof data?.kind === 'string' ? data.kind : null });
    performance.mark(`rx:message:${realm}:${direction}:${token}:${edge}`);
  }
  let token = 0;
  const endpoint = {
    postMessage(...args) {
      const current = ++token;
      note(args[0], 'send', 'begin', current);
      try { return post(...args); }
      finally { note(args[0], 'send', 'end', current); }
    },
    addEventListener(type, listener, ...options) {
      if (type !== 'message' || listener === null) return add(type, listener, ...options);
      if (options.length) throw Error('Only option-free adapter listeners are supported');
      let wrapped = listeners.get(listener);
      if (!wrapped) {
        wrapped = function (event) {
          const data = event.data, current = ++token;
          note(data, 'read', 'begin', current);
          try {
            return typeof listener === 'function' ? listener.call(this, event) : listener.handleEvent(event);
          } finally { note(data, 'read', 'end', current); }
        };
        listeners.set(listener, wrapped);
      }
      return add(type, wrapped);
    },
    removeEventListener(type, listener, ...options) {
      const wrapped = type === 'message' ? listeners.get(listener) : undefined;
      if (type === 'message') listeners.delete(listener);
      return remove(type, wrapped ?? listener, ...options);
    },
    terminate() { return native.terminate?.(); },
  };
  return { endpoint, snapshot: () => ({ realm, dropped, messageListeners: listeners.size,
    rows: rows.map(row => ({ ...row })) }) };
}
