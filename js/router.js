import * as state from './state.js';
import * as services from './services.js';
import * as ui from './ui.js';

const { h } = ui;

// Browser tab title and journey progress (step index 0 to 5; 5 means every step is done) per route.
const PAGE = {
  '/': { title: 'Renew your policy', step: 0 },
  '/verifying': { title: 'Verifying your identity', step: 0 },
  '/policies': { title: 'Choose a policy', step: 1 },
  '/review': { title: 'Review your policy', step: 2 },
  '/pay': { title: 'Review and pay', step: 3 },
  '/processing': { title: 'Renewing your policy', step: 4 },
  '/documents': { title: 'Your documents', step: 5 },
  '/doc/:token': { title: 'Verify a document', step: null },
  '/admin': { title: 'Back office', step: null },
  '/qr': { title: 'QR code generator', step: null },
  '/messages': { title: 'Messages', step: null }
};

// Where Back goes inside the renewal journey. null means no Back: the step cannot be safely undone.
const BACK = {
  '/verifying': '/',
  '/policies': '/',
  '/review': '/policies',
  '/pay': '/review',
  '/processing': null,
  '/documents': null
};

let currentPath = null;
let prevPath = null;

function backTarget(routePath) {
  if (routePath in BACK) return BACK[routePath];
  // Back-office, messages, QR generator and document check: return to wherever the person came from.
  if (routePath === null || routePath === undefined) return '/';
  return prevPath && prevPath !== currentPath ? prevPath : '/';
}

async function goHome(routePath) {
  if (routePath === '/processing') {
    const yes = await ui.confirmDialog({
      title: 'Leave this page?',
      text: 'Your renewal is still being processed. It will carry on, and you can come back to see your documents.',
      confirmLabel: 'Go to the start page',
      cancelLabel: 'Stay on this page'
    });
    if (!yes) return;
  }
  navigate('/');
}

function renderNav(routePath) {
  const nav = document.getElementById('app-nav');
  if (!nav) return;
  if (routePath === '/') { nav.hidden = true; nav.replaceChildren(); return; }
  const back = backTarget(routePath);
  nav.hidden = false;
  nav.replaceChildren(
    back ? h('button', { class: 'nav-btn nav-btn-back', type: 'button', onclick: () => navigate(back) }, ui.icon('arrow-left', 20), 'Back') : null,
    h('button', { class: 'nav-btn nav-btn-home', type: 'button', onclick: () => goHome(routePath) }, ui.icon('home', 20), 'Home')
  );
}

function setChrome(routePath) {
  const page = PAGE[routePath] || { title: 'Page not found', step: null };
  ui.setPageTitle(page.title);
  ui.renderProgress(page.step);
  renderNav(routePath);
}

const ROUTES = [
  { path: '/', module: './screens/landing.js' },
  { path: '/verifying', module: './screens/verifying.js', guard: (s) => !!(s.input && s.input.ghanaCard && s.input.phone) },
  { path: '/policies', module: './screens/policies.js', guard: (s) => s.verification && s.verification.status === 'passed' },
  { path: '/review', module: './screens/review.js', guard: (s) => !!s.selectedPolicyId },
  { path: '/pay', module: './screens/pay.js', guard: (s) => !!(s.renewal && s.renewal.status === 'created') },
  { path: '/processing', module: './screens/processing.js', guard: (s) => !!(s.renewal && (s.renewal.status === 'paid' || s.renewal.status === 'processing')) },
  { path: '/documents', module: './screens/documents.js', guard: (s) => !!(s.renewal && s.renewal.status === 'issued') },
  { path: '/doc/:token', module: './screens/verify-doc.js' },
  { path: '/admin', module: './screens/admin.js' },
  { path: '/qr', module: './screens/qr-generator.js' },
  { path: '/messages', module: './screens/messages.js' }
];

let app = null;
let seq = 0;
let cleanup = null;

function parseLocation() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const qIndex = raw.indexOf('?');
  let path = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const hashQuery = qIndex >= 0 ? raw.slice(qIndex + 1) : '';
  if (!path.startsWith('/')) path = '/' + path;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  const query = {};
  new URLSearchParams(location.search).forEach((v, k) => { query[k] = v; });
  new URLSearchParams(hashQuery).forEach((v, k) => { query[k] = v; });
  return { path, query };
}

function match(path) {
  if (path.startsWith('/doc/')) {
    const token = path.slice(5);
    if (!token) return null;
    let decoded = token;
    try { decoded = decodeURIComponent(token); } catch (e) { /* keep raw */ }
    return { route: ROUTES.find((r) => r.path === '/doc/:token'), params: { token: decoded } };
  }
  const route = ROUTES.find((r) => r.path === path);
  return route ? { route, params: {} } : null;
}

function runCleanup() {
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (e) { console.error(e); }
  }
  cleanup = null;
}

function stateCard(title, text, actions) {
  return h('div', { class: 'screen' },
    h('div', { class: 'card app-state' },
      h('span', { class: 'app-state-icon' }, ui.icon('alert', 40)),
      h('h1', { class: 'title' }, title),
      h('p', { class: 'subtitle' }, text),
      h('div', { class: 'app-state-actions' }, ...actions.map(([label, onClick, kind]) =>
        h('button', { class: 'btn btn-block ' + (kind || 'btn-primary'), type: 'button', onclick: onClick }, label)))
    )
  );
}

// Technical detail goes to the console for developers. People see what happened and what to do next.
function friendlyError(err) {
  const msg = String((err && err.message) || '');
  if (/dynamically imported module|Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return 'This page could not load. Check your internet connection, then reload the page.';
  }
  return 'Something on this page stopped working. Reload the page. If it keeps happening, go back to the start.';
}

export function showError(err) {
  runCleanup();
  setChrome(null);
  app.replaceChildren(stateCard('We could not open this page', friendlyError(err), [
    ['Reload this page', () => location.reload()],
    ['Go back to the start', () => navigate('/'), 'btn-secondary']
  ]));
}

function showNotFound() {
  setChrome(null);
  app.replaceChildren(stateCard('We could not find that page', 'The address may be mistyped, or the page may have moved. Start from the beginning to renew your policy.', [
    ['Go to the start page', () => navigate('/')]
  ]));
  window.scrollTo(0, 0);
}

async function handle() {
  const id = ++seq;
  runCleanup();
  const { path, query } = parseLocation();
  const m = match(path);
  if (!m) return showNotFound();
  if (m.route.guard && !m.route.guard(state.getState())) {
    history.replaceState(null, '', location.pathname + location.search + '#/');
    return handle();
  }
  try {
    const mod = await import(m.route.module);
    if (id !== seq) return;
    if (path !== currentPath) { prevPath = currentPath; currentPath = path; }
    setChrome(m.route.path);
    if (typeof mod.render !== 'function') throw new Error('Screen module ' + m.route.module + ' has no render export.');
    app.replaceChildren();
    window.scrollTo(0, 0);
    const ctx = {
      getState: state.getState, setState: state.setState, subscribe: state.subscribe,
      services, ui, navigate, params: m.params, query
    };
    const result = await mod.render(app, ctx);
    if (id !== seq) {
      if (typeof result === 'function') { try { result(); } catch (e) { console.error(e); } }
      return;
    }
    if (typeof result === 'function') cleanup = result;
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
  } catch (err) {
    if (id !== seq) return;
    console.error(err);
    showError(err);
  }
}

export function navigate(path) {
  const target = '#' + (String(path).startsWith('/') ? path : '/' + path);
  if (location.hash === target) handle();
  else location.hash = target;
}

export function startRouter(appEl) {
  app = appEl;
  window.addEventListener('hashchange', handle);
  handle();
}
