const STRINGS = {
  verifying: 'Verifying your identity',
  finding: 'Finding your policies',
  welcome: (n) => 'Welcome, ' + n,
  found: (n) => (n === 1 ? '1 policy found' : n + ' policies found'),
  failTitle: 'We could not verify you',
  generic: 'We could not verify these details. Check your Ghana Card number and phone number and try again.',
  retry: 'Re-enter your details',
  none: 'We could not find a policy linked to this phone number',
  back: 'Try different details'
};

// Module-level guard so a re-render never starts duplicate requests.
let inflight = null;

function begin(ctx) {
  const { getState, setState, services } = ctx;
  const input = getState().input;
  const key = input.ghanaCard + '|' + input.phone;
  if (inflight && inflight.key === key) return inflight;

  setState({
    verification: { status: 'running', clientId: null, name: null, maskedPhone: null, reason: null },
    lookup: { status: 'running', policies: [] }
  });

  const vp = services.verifyIdentity(input).catch(() => ({ ok: false, reason: STRINGS.generic })).then((r) => {
    if (r.ok) {
      setState({ verification: { status: 'passed', clientId: r.clientId, name: r.name, maskedPhone: r.maskedPhone, reason: null } });
    } else {
      setState({
        verification: { status: 'failed', clientId: null, name: null, maskedPhone: null, reason: r.reason || STRINGS.generic },
        lookup: { status: 'idle', policies: [] }
      });
    }
    return r;
  });
  const lp = services.lookupPolicies(input.phone).then(
    (p) => {
      if (getState().verification.status !== 'failed') setState({ lookup: { status: 'done', policies: p } });
      return p;
    },
    () => {
      if (getState().verification.status !== 'failed') setState({ lookup: { status: 'error', policies: [] } });
      return null;
    }
  );
  const entry = { key, vp, lp };
  inflight = entry;
  Promise.all([vp, lp]).then(() => { if (inflight === entry) inflight = null; });
  return entry;
}

export function render(root, ctx) {
  const { getState, services, ui, navigate } = ctx;
  const h = ui.h;
  let alive = true;
  let timer = null;

  const s0 = getState();
  if (s0.verification.status === 'passed' && s0.lookup.status === 'done') {
    navigate('/policies');
    return function cleanup() {};
  }

  const wrap = h('div', { class: 'screen verify-screen stack' });
  root.appendChild(wrap);

  function showError(message) {
    wrap.replaceChildren(
      h('div', { class: 'card verify-error stack' },
        h('p', { class: 'verify-error-title', role: 'alert' }, ui.icon('alert', 20), STRINGS.failTitle),
        h('p', { class: 'muted' }, message),
        h('div', { class: 'verify-actions' },
          h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => navigate('/') }, STRINGS.retry)))
    );
  }
  function showNone() {
    wrap.replaceChildren(
      h('div', { class: 'card verify-error stack' },
        h('p', { class: 'verify-error-title', role: 'alert' }, ui.icon('alert', 20), STRINGS.none),
        h('div', { class: 'verify-actions' },
          h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => navigate('/') }, STRINGS.back)))
    );
  }

  // Already failed (e.g. refresh after failure) and nothing in flight.
  if (s0.verification.status === 'failed' && !inflight) {
    showError(s0.verification.reason || STRINGS.generic);
    return function cleanup() {};
  }

  const line1 = ui.statusLine(STRINGS.verifying, 'running');
  const line2 = ui.statusLine(STRINGS.finding, 'running');
  const welcome = h('div', {});
  wrap.append(
    h('h1', { class: 'title' }, STRINGS.verifying),
    h('div', { class: 'card verify-lines' }, line1, line2, welcome)
  );

  const { vp, lp } = begin(ctx);
  let vResult = null;
  let lResult;
  let lDone = false;

  function check() {
    if (!alive || !vResult || !vResult.ok || !lDone) return;
    if (!lResult || lResult.length === 0) { showNone(); return; }
    timer = setTimeout(() => { if (alive) navigate('/policies'); }, 1200);
  }

  vp.then((r) => {
    if (!alive) return;
    vResult = r;
    if (r.ok) {
      ui.updateStatusLine(line1, STRINGS.verifying, 'done');
      const first = String(r.name || '').split(' ')[0];
      welcome.replaceChildren(h('p', { class: 'verify-welcome' }, ui.icon('check', 20), STRINGS.welcome(first)));
      check();
    } else {
      showError(r.reason || STRINGS.generic);
    }
  });
  lp.then((p) => {
    if (!alive || (vResult && !vResult.ok)) return;
    lResult = p;
    lDone = true;
    if (p) ui.updateStatusLine(line2, STRINGS.found(p.length), 'done');
    else ui.updateStatusLine(line2, STRINGS.finding, 'error');
    check();
  });

  return function cleanup() {
    alive = false;
    if (timer) clearTimeout(timer);
  };
}
