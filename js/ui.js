const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, val] of Object.entries(attrs)) {
      if (val === null || val === undefined || val === false) continue;
      if (key === 'class') el.className = val;
      else if (key === 'dataset') Object.assign(el.dataset, val);
      else if (key === 'style' && typeof val === 'string') el.style.cssText = val;
      else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
      else if (key === 'value') el.value = val;
      else if (val === true) el.setAttribute(key, '');
      else el.setAttribute(key, String(val));
    }
  }
  const append = (child) => {
    if (child === null || child === undefined || child === false || child === true) return;
    if (Array.isArray(child)) child.forEach(append);
    else if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  };
  children.forEach(append);
  return el;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n) => String(n).padStart(2, '0');

function groupedAmount(amount) {
  const n = Number(amount) || 0;
  const [whole, dec] = Math.abs(n).toFixed(2).split('.');
  return { neg: n < 0, text: whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec };
}

// On-screen money: GH₵1,234.56 (2 decimals, thousands separators).
export function formatMoney(amount, currency = 'GHS') {
  const g = groupedAmount(amount);
  const sym = currency === 'GHS' ? 'GH₵' : currency + ' ';
  return (g.neg ? '-' : '') + sym + g.text;
}

// PDF money: the built-in PDF font cannot draw the cedi sign, so documents keep the ISO code.
export function formatMoneyPlain(amount, currency = 'GHS') {
  const g = groupedAmount(amount);
  return currency + ' ' + (g.neg ? '-' : '') + g.text;
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return d + ' ' + MONTHS[m - 1] + ' ' + y;
}

export function formatDateTime(epochMs) {
  if (!epochMs) return '';
  const d = new Date(epochMs);
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ', ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  return p2(Math.floor(total / 60)) + ':' + p2(total % 60);
}

export function maskPhone(phone) {
  let s = String(phone || '').replace(/[^\d+]/g, '');
  if (s.startsWith('+233')) s = '0' + s.slice(4);
  else if (s.startsWith('233') && s.length === 12) s = '0' + s.slice(3);
  s = s.replace(/\D/g, '');
  if (s.length < 7) return s;
  return s.slice(0, 3) + ' *** ' + s.slice(-4);
}

export function maskGhanaCard(card) {
  const m = /^GHA-(\d{9})-(\d)$/i.exec(String(card || '').trim());
  if (!m) return String(card || '');
  return 'GHA-*****' + m[1].slice(5) + '-' + m[2];
}

export function toast(message, kind = 'info') {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = h('div', { id: 'toast-root', 'aria-live': 'polite' });
    document.body.appendChild(root);
  }
  const name = kind === 'success' ? 'check' : kind === 'error' ? 'alert' : 'info';
  const el = h('div', { class: 'toast', role: kind === 'error' ? 'alert' : 'status', dataset: { kind } },
    icon(name, 20), h('span', {}, message));
  root.appendChild(el);
  const life = kind === 'error' ? 6000 : 3800;
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 200);
  }, life);
}

const ICONS = {
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  spinner: [['path', { d: 'M21 12a9 9 0 1 1-6.2-8.55' }]],
  download: [['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }], ['polyline', { points: '7 10 12 15 17 10' }], ['line', { x1: 12, y1: 15, x2: 12, y2: 3 }]],
  whatsapp: [['path', { d: 'M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.6-5.4A8.4 8.4 0 1 1 21 11.5z' }], ['path', { d: 'M9 8.5c.2 3 2.5 5.3 5.5 5.5l1-1.2-1.8-.9-.8.8a4 4 0 0 1-2-2l.8-.8-.9-1.8z' }]],
  mail: [['rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }], ['polyline', { points: '3 7 12 13 21 7' }]],
  sms: [['path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }], ['line', { x1: 8, y1: 8, x2: 16, y2: 8 }], ['line', { x1: 8, y1: 12, x2: 13, y2: 12 }]],
  shield: [['path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }], ['polyline', { points: '9 12 11 14 15 10' }]],
  car: [['path', { d: 'M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11' }], ['rect', { x: 2, y: 11, width: 20, height: 6, rx: 2 }], ['circle', { cx: 7, cy: 17, r: 1.5 }], ['circle', { cx: 17, cy: 17, r: 1.5 }]],
  alert: [['path', { d: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z' }], ['line', { x1: 12, y1: 9, x2: 12, y2: 13 }], ['line', { x1: 12, y1: 17, x2: 12.01, y2: 17 }]],
  lock: [['rect', { x: 3, y: 11, width: 18, height: 11, rx: 2 }], ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }]],
  qr: [['rect', { x: 3, y: 3, width: 7, height: 7 }], ['rect', { x: 14, y: 3, width: 7, height: 7 }], ['rect', { x: 3, y: 14, width: 7, height: 7 }], ['path', { d: 'M14 14h3v3M21 14v3M14 21h3M21 21v.01' }]],
  phone: [['rect', { x: 6, y: 2, width: 12, height: 20, rx: 2 }], ['line', { x1: 12, y1: 18, x2: 12.01, y2: 18 }]],
  file: [['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }], ['polyline', { points: '14 2 14 8 20 8' }], ['line', { x1: 8, y1: 13, x2: 16, y2: 13 }], ['line', { x1: 8, y1: 17, x2: 16, y2: 17 }]],
  clock: [['circle', { cx: 12, cy: 12, r: 10 }], ['polyline', { points: '12 6 12 12 16 14' }]],
  'arrow-right': [['line', { x1: 5, y1: 12, x2: 19, y2: 12 }], ['polyline', { points: '12 5 19 12 12 19' }]],
  refresh: [['polyline', { points: '23 4 23 10 17 10' }], ['path', { d: 'M20.5 15a9 9 0 1 1-2.1-9.4L23 10' }]],
  user: [['path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }], ['circle', { cx: 12, cy: 7, r: 4 }]],
  info: [['circle', { cx: 12, cy: 12, r: 10 }], ['line', { x1: 12, y1: 16, x2: 12, y2: 12 }], ['line', { x1: 12, y1: 8, x2: 12.01, y2: 8 }]],
  close: [['line', { x1: 18, y1: 6, x2: 6, y2: 18 }], ['line', { x1: 6, y1: 6, x2: 18, y2: 18 }]],
  sun: [['circle', { cx: 12, cy: 12, r: 4 }], ['path', { d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41' }]],
  moon: [['path', { d: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z' }]],
  home: [['path', { d: 'M3 10.5 12 3l9 7.5' }], ['path', { d: 'M5 9.5V21h14V9.5' }], ['path', { d: 'M10 21v-6h4v6' }]],
  'arrow-left': [['line', { x1: 19, y1: 12, x2: 5, y2: 12 }], ['polyline', { points: '12 19 5 12 12 5' }]],
  building: [['rect', { x: 4, y: 2, width: 16, height: 20, rx: 2 }], ['path', { d: 'M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01' }]]
};

export function icon(name, size = 24) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', name === 'spinner' ? 'icon icon-spin' : 'icon');
  (ICONS[name] || ICONS.alert).forEach(([tag, attrs]) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.appendChild(el);
  });
  return svg;
}

function statusIcon(state) {
  if (state === 'running') return icon('spinner', 20);
  if (state === 'done') return icon('check', 20);
  if (state === 'error') return icon('alert', 20);
  return h('span', { class: 'status-line-dot' });
}

export function statusLine(label, state = 'pending') {
  const el = h('div', { class: 'status-line', role: 'status', 'aria-live': 'polite' });
  updateStatusLine(el, label, state);
  return el;
}

export function updateStatusLine(el, label, state) {
  el.dataset.state = state;
  el.replaceChildren(
    h('span', { class: 'status-line-icon' }, statusIcon(state)),
    h('span', { class: 'status-line-label' }, label)
  );
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ---------- buttons: loading and done states (button upgrade, rule 24, rule 26) ---------- */
export function setButtonState(btn, state, label) {
  if (!btn._idle) btn._idle = [...btn.childNodes].map((n) => n.cloneNode(true));
  if (state === 'idle') {
    delete btn.dataset.state;
    btn.removeAttribute('aria-busy');
    btn.replaceChildren(...btn._idle.map((n) => n.cloneNode(true)));
    btn.disabled = false;
    return;
  }
  btn.dataset.state = state;
  btn.disabled = true;
  if (state === 'loading') btn.setAttribute('aria-busy', 'true');
  btn.replaceChildren(icon(state === 'loading' ? 'spinner' : 'check', 20), label ? h('span', {}, label) : null);
}

/* ---------- validation: blur first, live after an error, confirm success (validation rules) ---------- */
export function fieldControl(input) {
  const ok = h('span', { class: 'field-ok', hidden: true }, icon('check', 20), h('span', { class: 'sr-only' }, 'Valid'));
  return { wrap: h('div', { class: 'field-control' }, input, ok), ok };
}

export function makeError(id) {
  return h('p', { class: 'field-error', id, role: 'alert', hidden: true });
}

/**
 * check(value) returns '' when valid, or the message to show.
 * Pristine: nothing shows. Typing: nothing shows. Blur: validate. Invalid: re-check on every edit. Valid: subtle check.
 */
export function attachValidation(input, { check, errorEl, okEl, optional = false, isEmpty = (v) => !v.trim() }) {
  let invalid = false;
  function render(message, empty) {
    invalid = !!message;
    errorEl.replaceChildren();
    if (message) errorEl.append(icon('alert', 16), h('span', {}, message));
    errorEl.hidden = !message;
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    okEl.hidden = !!message || empty;
  }
  function validate() {
    const raw = input.value;
    if (optional && isEmpty(raw)) { render('', true); return true; }
    const message = check(raw);
    render(message, false);
    return !message;
  }
  input.addEventListener('blur', () => { if (!isEmpty(input.value)) validate(); });
  input.addEventListener('input', () => {
    if (invalid) validate();
    else okEl.hidden = true;
  });
  return { validate, reset: () => render('', true) };
}

/* ---------- dialog: native <dialog>, three ways to close (rule 22) ---------- */
export function dialog({ title, description, body, actions, wide = false, onClose }) {
  const titleId = 'dlg-title-' + Math.random().toString(36).slice(2, 8);
  const dlg = h('dialog', { class: 'dlg' + (wide ? ' dlg-wide' : ''), 'aria-labelledby': titleId });
  const closeBtn = h('button', { class: 'dlg-close', type: 'button', 'aria-label': 'Close' }, icon('close', 24));
  dlg.append(
    h('div', { class: 'dlg-head' }, h('h2', { class: 'dlg-title', id: titleId }, title), closeBtn),
    h('div', { class: 'dlg-body' }, description ? h('p', {}, description) : null, body || null),
    actions ? h('div', { class: 'dlg-actions' }, ...actions) : null
  );
  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    dlg.remove();
    if (onClose) onClose();
  }
  function close() {
    if (!dlg.open) return finish();
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { dlg.close(); return; }
    dlg.classList.add('is-closing');
    setTimeout(() => { if (dlg.open) dlg.close(); }, 200);
  }
  closeBtn.addEventListener('click', close);
  dlg.addEventListener('close', finish);
  dlg.addEventListener('click', (e) => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) close();
  });
  document.body.appendChild(dlg);
  dlg.showModal();
  return { el: dlg, close };
}

/** Resolves true only when the person confirms. Cancel has focus first, so Enter never confirms by accident. */
export function confirmDialog({ title, text, confirmLabel, cancelLabel = 'Keep as it is' }) {
  return new Promise((resolve) => {
    let answer = false;
    const cancel = h('button', { class: 'btn btn-secondary btn-block', type: 'button', autofocus: true }, cancelLabel);
    const ok = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, confirmLabel);
    const d = dialog({ title, description: text, actions: [cancel, ok], onClose: () => resolve(answer) });
    cancel.addEventListener('click', () => d.close());
    ok.addEventListener('click', () => { answer = true; d.close(); });
    cancel.focus();
  });
}

/* ---------- browser tab title and journey progress ---------- */
const APP_NAME = 'Rescue Renewals';
export function setPageTitle(name) {
  document.title = name ? name + ' · ' + APP_NAME : APP_NAME;
}

const STEPS = ['Details', 'Policy', 'Review', 'Pay', 'Documents'];
export function renderProgress(index) {
  const root = document.getElementById('progress');
  if (!root) return;
  if (index === null || index === undefined) { root.hidden = true; root.replaceChildren(); return; }
  root.hidden = false;
  const list = h('ol', { class: 'stepper', 'aria-label': 'Renewal progress' },
    ...STEPS.map((label, i) => {
      const state = i < index ? 'is-done' : i === index ? 'is-current' : '';
      return h('li', { class: state, 'aria-current': i === index ? 'step' : null },
        h('span', { class: 'step-marker' }, i < index ? icon('check', 16) : String(i + 1)),
        h('span', { class: 'step-label' }, label),
        h('span', { class: 'sr-only' }, i < index ? ' (done)' : i === index ? ' (current step)' : ' (not started)'));
    }));
  root.replaceChildren(list);
}
