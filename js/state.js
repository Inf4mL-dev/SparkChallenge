const STATE_KEY = 'rr_state_v1';
const PING_KEY = 'rr_ping';
const mem = {};

export function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (e) {
    if (Object.prototype.hasOwnProperty.call(mem, key)) {
      try { return JSON.parse(mem[key]); } catch (e2) { /* fall through */ }
    }
    return fallback;
  }
}

export function writeStore(key, value) {
  const raw = JSON.stringify(value);
  mem[key] = raw;
  try {
    localStorage.setItem(key, raw);
    localStorage.setItem(PING_KEY, String(Date.now()));
  } catch (e) {
    /* storage unavailable: memory fallback already holds the value */
  }
}

function initialState() {
  return {
    source: { src: null, agent: null },
    input: { ghanaCard: '', phone: '' },
    verification: { status: 'idle', clientId: null, name: null, maskedPhone: null, reason: null },
    lookup: { status: 'idle', policies: [] },
    selectedPolicyId: null,
    discrepancy: null,
    corrections: {},
    renewal: null,
    documents: [],
    share: { channel: null, destination: null, sentAt: null, messageId: null }
  };
}

const subscribers = new Set();
let state = (function load() {
  const init = initialState();
  const saved = readStore(STATE_KEY, null);
  return saved && typeof saved === 'object' ? { ...init, ...saved } : init;
})();

function notify() {
  subscribers.forEach((fn) => {
    try { fn(state); } catch (e) { console.error(e); }
  });
}

export function getState() {
  return state;
}

export function setState(patch) {
  state = { ...state, ...patch };
  writeStore(STATE_KEY, state);
  notify();
}

export function subscribe(fn) {
  subscribers.add(fn);
  return function unsubscribe() { subscribers.delete(fn); };
}

export function resetState() {
  state = initialState();
  writeStore(STATE_KEY, state);
  notify();
}
