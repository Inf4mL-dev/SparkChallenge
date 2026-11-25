// js/screens/processing.js
// Route #/processing: 2 to 3 minute countdown driven entirely by renewal timestamps.
// Owner: Account 3. Uses only ctx (services, ui, navigate, getState, setState).

const STRINGS = {
  title: 'Renewing your policy',
  reassurance: 'You can keep this page open. Your documents will appear here when they are ready.',
  timerLabel: 'Time remaining',
  caption: 'Estimated time remaining',
  progressLabel: 'Renewal progress',
  steps: {
    received: 'Payment received',
    renewing: 'Renewing your policy',
    preparing: 'Preparing your sticker, certificate and brown card',
    almost: 'Almost done'
  },
  issuing: 'Issuing your documents',
  skip: 'Skip the countdown',
  startError: 'We could not start your renewal. Your payment is safe. Please try again.',
  issueError: 'We could not issue your documents yet. Please try again.',
  tryAgain: 'Retry issuing my documents'
};

const STEP_LABELS = [
  STRINGS.steps.received,
  STRINGS.steps.renewing,
  STRINGS.steps.preparing,
  STRINGS.steps.almost
];

// Shared across re-renders so completeRenewal runs once per renewal, even if the screen is re-opened mid-call.
let pending = null; // { ref, promise }

function safely(fn, fallback) {
  try {
    const value = fn();
    return value == null ? fallback : value;
  } catch (err) {
    return fallback;
  }
}

function completeOnce(ctx, ref) {
  if (pending && pending.ref === ref) return pending.promise;
  const entry = { ref, promise: null };
  pending = entry;
  const run = async () => {
    const current = ctx.getState().renewal;
    if (current && current.reference === ref && current.status === 'issued') return current;
    const updated = await ctx.services.completeRenewal(ref);
    if (updated) ctx.setState({ renewal: updated });
    return updated;
  };
  entry.promise = run().finally(() => {
    if (pending === entry) pending = null;
  });
  return entry.promise;
}

// Line states for a given progress (0 to 1): done / running / pending for the four status lines.
function stepStates(progress) {
  return [
    'done',
    progress < 0.35 ? 'running' : 'done',
    progress < 0.35 ? 'pending' : progress < 0.85 ? 'running' : 'done',
    progress < 0.85 ? 'pending' : 'running'
  ];
}

export function render(root, ctx) {
  const { services, ui, navigate } = ctx;
  const { h } = ui;
  const noop = function cleanup() {};

  // Guard by renewal status.
  const first = ctx.getState().renewal;
  if (!first) {
    navigate('/');
    return noop;
  }
  if (first.status === 'issued') {
    navigate('/documents');
    return noop;
  }
  if (first.status !== 'paid' && first.status !== 'processing') {
    navigate(first.status === 'created' ? '/pay' : '/');
    return noop;
  }

  const policy = safely(() => services.getPolicy(first.policyId), null);
  let alive = true;
  let stopped = false;
  let completing = false;
  let timer = null;
  let total = 1;
  let lastProgress = 0;
  let timerText = '';
  const lineStates = stepStates(0);

  // ---------- DOM ----------
  const titleEl = h('h1', { class: 'title proc-title', tabindex: '-1' }, STRINGS.title);
  const timerEl = h('div', { class: 'timer proc-timer', role: 'timer', 'aria-label': STRINGS.timerLabel }, '--:--');
  const caption = h('p', { class: 'proc-caption muted' }, STRINGS.caption);
  const issuing = h(
    'p',
    { class: 'proc-issuing', role: 'status' },
    h('span', { class: 'proc-spin', 'aria-hidden': 'true' }, ui.icon('spinner', 20)),
    h('span', null, STRINGS.issuing)
  );
  issuing.hidden = true;
  const fill = h('div', { class: 'proc-bar-fill' });
  const bar = h(
    'div',
    {
      class: 'proc-bar',
      role: 'progressbar',
      'aria-label': STRINGS.progressLabel,
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': '0'
    },
    fill
  );
  const lines = STEP_LABELS.map((label, i) => ui.statusLine(label, lineStates[i]));
  const steps = h('div', { class: 'proc-steps', 'aria-live': 'polite' }, ...lines);

  const errorText = h('p', { class: 'proc-error-text' });
  const errorBtn = h('button', { class: 'btn btn-primary proc-error-btn', type: 'button' }, STRINGS.tryAgain);
  const errorBox = h(
    'div',
    { class: 'proc-error', role: 'alert' },
    h('span', { class: 'proc-error-icon', 'aria-hidden': 'true' }, ui.icon('alert', 22)),
    errorText,
    errorBtn
  );
  errorBox.hidden = true;

  const skipBtn = services.demo.isDemoMode()
    ? h(
        'button',
        {
          class: 'btn btn-secondary proc-skip',
          type: 'button',
          onclick: () => {
            services.demo.skipCountdown();
            tick();
          }
        },
        STRINGS.skip
      )
    : null;

  const head = h(
    'div',
    { class: 'proc-head' },
    h('span', { class: 'proc-icon', 'aria-hidden': 'true' }, ui.icon('clock', 28)),
    titleEl,
    policy
      ? h(
          'div',
          { class: 'proc-vehicle' },
          h('span', { class: 'proc-vehicle-name' }, [policy.make, policy.model].filter(Boolean).join(' ')),
          h('span', { class: 'proc-plate' }, policy.plate)
        )
      : null
  );

  root.appendChild(
    h(
      'div',
      { class: 'screen proc-screen' },
      h(
        'section',
        { class: 'card proc-card' },
        head,
        h('div', { class: 'proc-clock' }, timerEl, caption, issuing, bar),
        steps,
        errorBox,
        h('p', { class: 'proc-reassure muted' }, STRINGS.reassurance)
      ),
      skipBtn
    )
  );

  // ---------- behaviour ----------
  function stop() {
    stopped = true;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function paint(remaining, progress) {
    const text = ui.formatCountdown(remaining);
    if (text !== timerText) {
      timerText = text;
      timerEl.textContent = text;
    }
    fill.style.width = (progress * 100).toFixed(1) + '%';
    bar.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    stepStates(progress).forEach((state, i) => {
      if (lineStates[i] !== state) {
        lineStates[i] = state;
        ui.updateStatusLine(lines[i], STEP_LABELS[i], state);
      }
    });
  }

  function showError(message, retry) {
    issuing.hidden = true;
    errorText.textContent = message;
    errorBtn.onclick = () => {
      errorBox.hidden = true;
      retry();
    };
    errorBox.hidden = false;
    errorBtn.focus({ preventScroll: true });
  }

  async function finish(ref) {
    if (completing) return;
    completing = true;
    stop();
    caption.hidden = true;
    issuing.hidden = false;
    try {
      await completeOnce(ctx, ref);
      if (!alive) return;
      navigate('/documents');
    } catch (err) {
      if (!alive) return;
      completing = false;
      caption.hidden = false;
      showError(STRINGS.issueError, () => finish(ref));
    }
  }

  // Everything is derived from the latest state.renewal timestamps, never from a local counter.
  function tick() {
    if (!alive || stopped || completing) return;
    const r = ctx.getState().renewal;
    if (!r) {
      stop();
      navigate('/');
      return;
    }
    if (r.status === 'issued') {
      stop();
      navigate('/documents');
      return;
    }
    const remaining = Math.max(0, (r.processingEndsAt || 0) - Date.now());
    const raw = remaining === 0 ? 1 : Math.min(1, Math.max(0, 1 - remaining / total));
    lastProgress = Math.max(lastProgress, raw);
    paint(remaining, lastProgress);
    if (remaining === 0) finish(r.reference);
  }

  function begin() {
    const current = ctx.getState().renewal;
    if (current && current.status === 'paid') {
      try {
        const updated = services.startProcessing(current.reference);
        if (updated) ctx.setState({ renewal: updated });
      } catch (err) {
        showError(STRINGS.startError, begin);
        return;
      }
    }
    const r = ctx.getState().renewal;
    // Total is fixed once, when the screen first renders.
    total = Math.max(1, (r.processingEndsAt || 0) - (r.processingStartedAt || 0));
    tick();
    if (!stopped && alive) timer = setInterval(tick, 250);
  }

  begin();

  return function cleanup() {
    alive = false;
    stop();
  };
}
