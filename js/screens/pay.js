// js/screens/pay.js
// Route #/pay: renewal summary, payment method, simulated mobile money approval.
// Owner: Account 3. Uses only ctx (services, ui, navigate, getState, setState).

const STRINGS = {
  title: 'Review and pay',
  subtitles: {
    form: 'Check your renewal details, then pay with mobile money.',
    approve: 'Approve the request on your phone to finish paying.',
    received: 'Thank you. Your payment has gone through.',
    error: 'Your payment did not go through. You can try again.'
  },
  demoBadge: 'Demo mode',
  summaryTitle: 'Renewal summary',
  coverType: 'Cover type',
  term: 'Renewal term',
  termValue: '12 months',
  reference: 'Renewal reference',
  correctionLabels: { colour: 'Corrected vehicle colour', use: 'Corrected vehicle use', year: 'Corrected year of manufacture', chassisNo: 'Corrected chassis number' },
  breakdownTitle: 'Premium breakdown',
  base: 'Premium',
  stickerFee: 'Sticker',
  total: 'Total due',
  methodTitle: 'Payment method',
  methods: {
    mobile_money: { title: 'Mobile money', hint: 'Approve on your phone' },
    bank_transfer: { title: 'Bank transfer', hint: 'Pay from your bank account' },
    card: { title: 'Card', hint: 'Debit or credit card' }
  },
  comingSoon: 'Coming soon',
  detailsTitle: 'Mobile money details',
  networkLabel: 'Mobile money network',
  networks: { mtn: 'MTN MoMo', telecel: 'Telecel Cash', airteltigo: 'AirtelTigo Money' },
  phoneLabel: 'Mobile money number',
  phoneHint: 'We will send the approval request to this number.',
  phoneError: 'Enter a Ghana mobile money number with 10 digits, starting with 0. For example 0240000001.',
  phonePlaceholder: '0240000001',
  pay: (amount) => `Pay ${amount}`,
  demoNote: 'Demonstration only. No real money is moved.',
  approveTitle: 'Approve payment',
  approveAmount: 'Amount',
  approveTo: (name) => `To ${name}`,
  approveFrom: (masked) => `From ${masked}`,
  phoneFilled: 'Filled in from your policy. Change it if you pay from another number.',
  approve: 'Approve payment',
  approving: 'Approving payment',
  cancel: 'Cancel payment',
  confirming: 'Confirming your payment',
  receivedTitle: 'Payment received',
  receivedText: 'Starting your renewal now.',
  errorTitle: 'Payment not completed',
  genericError: 'Payment was not approved. Please try again.',
  tryAgain: 'Try the payment again',
  changeMethod: 'Change payment method',
  insurerFallback: 'your insurer',
  vehicleFallback: 'Your vehicle'
};

// Ghana mobile numbers in local format after normalisation: 0 + 9 digits.
const GH_MOBILE = /^0(20|23|24|25|26|27|28|29|50|53|54|55|56|57|59)\d{7}$/;

// One payment per renewal at a time, even if the screen is left and re-opened mid-request.
let inflight = null; // { ref, promise }

function normalisePhone(raw) {
  let s = String(raw || '').replace(/[\s\-().]/g, '');
  if (s.startsWith('+233')) s = '0' + s.slice(4);
  else if (s.startsWith('00233')) s = '0' + s.slice(5);
  else if (s.startsWith('233') && s.length === 12) s = '0' + s.slice(3);
  return s;
}

function guessNetwork(local) {
  const prefix = local.slice(0, 3);
  if (['020', '050'].includes(prefix)) return 'telecel';
  if (['026', '027', '056', '057'].includes(prefix)) return 'airteltigo';
  return 'mtn';
}

function safely(fn, fallback) {
  try {
    const value = fn();
    return value == null ? fallback : value;
  } catch (err) {
    return fallback;
  }
}

function requestPayment(ctx, renewal, msisdn) {
  if (inflight && inflight.ref === renewal.reference) return inflight.promise;
  const entry = { ref: renewal.reference, promise: null };
  inflight = entry;
  const run = async () => {
    try {
      const result = await ctx.services.simulatePayment({
        renewalRef: renewal.reference,
        method: 'mobile_money',
        msisdn
      });
      return result && typeof result === 'object' ? result : { ok: false, reason: STRINGS.genericError };
    } catch (err) {
      return { ok: false, reason: STRINGS.genericError };
    }
  };
  entry.promise = run().finally(() => {
    if (inflight === entry) inflight = null;
  });
  return entry.promise;
}

export function render(root, ctx) {
  const { services, ui, navigate } = ctx;
  const { h } = ui;
  const noop = function cleanup() {};

  // Guard by renewal status.
  const start = ctx.getState().renewal;
  if (!start) {
    navigate('/');
    return noop;
  }
  if (start.status === 'paid' || start.status === 'processing') {
    navigate('/processing');
    return noop;
  }
  if (start.status === 'issued') {
    navigate('/documents');
    return noop;
  }
  if (start.status !== 'created') {
    navigate('/');
    return noop;
  }

  const ref = start.reference;
  const premium = start.premium;
  const totalText = ui.formatMoney(premium.total, premium.currency);
  const policy = safely(() => services.getPolicy(start.policyId), null);
  const insurerName = safely(() => services.buildDocContext(ref).insurer.shortName, STRINGS.insurerFallback);
  const startPhone = (ctx.getState().input && ctx.getState().input.phone) || '';

  const form = {
    network: guessNetwork(normalisePhone(startPhone)),
    phone: startPhone,
    touched: false
  };
  let alive = true;
  let approveRefs = null;

  // ---------- shell ----------
  const subtitle = h('p', { class: 'subtitle pay-subtitle' }, STRINGS.subtitles.form);
  const header = h(
    'header',
    { class: 'pay-head' },
    h(
      'div',
      { class: 'pay-head-row' },
      h('h1', { class: 'title pay-title' }, STRINGS.title),
      h('span', { class: 'demo-badge' }, STRINGS.demoBadge)
    ),
    subtitle
  );
  const body = h('div', { class: 'pay-body' });
  root.appendChild(h('div', { class: 'screen pay-screen' }, header, body));

  function show(name, nodes, focusEl) {
    subtitle.textContent = STRINGS.subtitles[name];
    body.replaceChildren(...nodes);
    if (typeof window.scrollTo === 'function') {
      try {
        window.scrollTo(0, 0);
      } catch (err) {
        /* scrolling is optional */
      }
    }
    if (focusEl) focusEl.focus({ preventScroll: true });
  }

  function line(label, value, extra) {
    return h(
      'div',
      { class: 'pay-line' + (extra ? ' ' + extra : '') },
      h('dt', { class: 'pay-line-label' }, label),
      h('dd', { class: 'pay-line-value' }, value)
    );
  }

  function option(cfg) {
    const input = h('input', {
      class: 'choice-input',
      type: 'radio',
      name: cfg.name,
      value: cfg.value,
      onchange: cfg.onchange
    });
    input.checked = !!cfg.checked;
    input.disabled = !!cfg.disabled;
    const box = h(
      'span',
      { class: 'choice-box' },
      cfg.icon ? h('span', { class: 'choice-icon', 'aria-hidden': 'true' }, ui.icon(cfg.icon, 24)) : null,
      h(
        'span',
        { class: 'choice-text' },
        h('span', { class: 'choice-title' }, cfg.title),
        cfg.hint ? h('span', { class: 'choice-hint' }, cfg.hint) : null
      ),
      cfg.badge ? h('span', { class: 'badge badge-muted' }, cfg.badge) : null,
      h('span', { class: 'choice-mark', 'aria-hidden': 'true' })
    );
    const label = h('label', { class: 'choice' + (cfg.disabled ? ' is-disabled' : '') }, input, box);
    return { label, input };
  }

  // ---------- form view ----------
  function buildForm() {
    const vehicleName = policy
      ? [policy.make, policy.model, policy.year].filter(Boolean).join(' ')
      : STRINGS.vehicleFallback;

    const facts = [];
    if (policy) facts.push(line(STRINGS.coverType, policy.coverType));
    facts.push(line(STRINGS.term, STRINGS.termValue));
    facts.push(line(STRINGS.reference, h('span', { class: 'pay-ref' }, ref)));
    Object.entries(start.corrections || {}).forEach(([key, value]) => {
      facts.push(line(STRINGS.correctionLabels[key] || key, String(value)));
    });

    const summary = h(
      'section',
      { class: 'card pay-summary', 'aria-label': STRINGS.summaryTitle },
      h(
        'div',
        { class: 'pay-vehicle' },
        h('span', { class: 'pay-vehicle-icon', 'aria-hidden': 'true' }, ui.icon('car', 24)),
        h(
          'div',
          { class: 'pay-vehicle-text' },
          h('div', { class: 'pay-vehicle-name' }, vehicleName),
          policy ? h('span', { class: 'pay-plate' }, policy.plate) : null
        )
      ),
      h('dl', { class: 'pay-facts' }, ...facts),
      h(
        'dl',
        { class: 'pay-breakdown', 'aria-label': STRINGS.breakdownTitle },
        line(STRINGS.base, ui.formatMoney(premium.base, premium.currency)),
        line(STRINGS.stickerFee, ui.formatMoney(premium.stickerFee, premium.currency)),
        line(STRINGS.total, totalText, 'pay-line-total')
      )
    );

    // Payment method: mobile money selected, the others visible but disabled.
    const mobile = option({
      name: 'pay-method',
      value: 'mobile_money',
      title: STRINGS.methods.mobile_money.title,
      hint: STRINGS.methods.mobile_money.hint,
      icon: 'phone',
      checked: true
    });
    const bank = option({
      name: 'pay-method',
      value: 'bank_transfer',
      title: STRINGS.methods.bank_transfer.title,
      hint: STRINGS.methods.bank_transfer.hint,
      icon: 'building',
      disabled: true,
      badge: STRINGS.comingSoon
    });
    const card = option({
      name: 'pay-method',
      value: 'card',
      title: STRINGS.methods.card.title,
      hint: STRINGS.methods.card.hint,
      icon: 'lock',
      disabled: true,
      badge: STRINGS.comingSoon
    });
    const methodCard = h(
      'div',
      { class: 'pay-method' },
      h('h2', { class: 'pay-section-title', id: 'pay-method-title' }, STRINGS.methodTitle),
      h(
        'div',
        { class: 'pay-options', role: 'radiogroup', 'aria-labelledby': 'pay-method-title' },
        mobile.label,
        bank.label,
        card.label
      )
    );

    // Mobile money details.
    const networkOptions = Object.keys(STRINGS.networks).map((id) =>
      option({
        name: 'pay-network',
        value: id,
        title: STRINGS.networks[id],
        checked: form.network === id,
        onchange: () => {
          form.network = id;
        }
      })
    );

    const phoneInput = h('input', {
      class: 'field-input pay-phone-input',
      id: 'pay-phone',
      type: 'tel',
      inputmode: 'tel',
      autocomplete: 'tel',
      placeholder: STRINGS.phonePlaceholder,
      'aria-describedby': 'pay-phone-hint pay-phone-error'
    });
    phoneInput.value = form.phone;
    const phoneCtl = ui.fieldControl(phoneInput);
    const phoneError = ui.makeError('pay-phone-error');
    const phoneCheck = ui.attachValidation(phoneInput, {
      check: (v) => (GH_MOBILE.test(normalisePhone(v)) ? '' : STRINGS.phoneError),
      errorEl: phoneError,
      okEl: phoneCtl.ok
    });
    phoneInput.addEventListener('input', () => {
      form.phone = phoneInput.value;
    });
    const checkPhone = () => phoneCheck.validate();

    const payBtn = h(
      'button',
      {
        class: 'btn btn-primary btn-block pay-submit',
        type: 'button',
        onclick: () => {
          form.touched = true;
          if (!checkPhone()) {
            phoneInput.focus();
            return;
          }
          form.phone = phoneInput.value;
          showApprove();
        }
      },
      h('span', { class: 'pay-submit-icon', 'aria-hidden': 'true' }, ui.icon('lock', 18)),
      STRINGS.pay(totalText)
    );

    const detailsCard = h(
      'div',
      { class: 'pay-momo' },
      h('h2', { class: 'pay-section-title', id: 'pay-network-title' }, STRINGS.detailsTitle),
      h(
        'div',
        { class: 'pay-network' },
        h('span', { class: 'field-label', id: 'pay-network-label' }, STRINGS.networkLabel),
        h('div', { class: 'pay-options', role: 'radiogroup', 'aria-labelledby': 'pay-network-label' }, ...networkOptions.map((o) => o.label))
      ),
      h(
        'div',
        { class: 'field pay-phone' },
        h('label', { class: 'field-label', for: 'pay-phone' }, STRINGS.phoneLabel),
        phoneCtl.wrap,
        h('p', { class: 'field-hint', id: 'pay-phone-hint' }, STRINGS.phoneHint + ' ' + (startPhone ? STRINGS.phoneFilled : '')),
        phoneError
      ),
      payBtn,
      h('p', { class: 'pay-note muted' }, STRINGS.demoNote)
    );

    const paymentCard = h('section', { class: 'card pay-group', 'aria-label': STRINGS.methodTitle }, methodCard, detailsCard);
    return { nodes: [summary, paymentCard], phoneInput, methodInput: mobile.input };
  }

  function showForm(focusKey) {
    approveRefs = null;
    const f = buildForm();
    show('form', f.nodes, focusKey === 'method' ? f.methodInput : focusKey === 'phone' ? f.phoneInput : null);
  }

  // ---------- approval view ----------
  function setBusy(on) {
    if (!approveRefs) return;
    ui.setButtonState(approveRefs.approveBtn, on ? 'loading' : 'idle', STRINGS.approving);
    approveRefs.cancelBtn.disabled = on;
    approveRefs.status.hidden = !on;
    approveRefs.status.replaceChildren(
      ...(on
        ? [h('span', null, STRINGS.confirming)]
        : [])
    );
  }

  function showApprove() {
    const msisdn = normalisePhone(form.phone);
    const heading = h('h2', { class: 'pay-phone-title', tabindex: '-1' }, STRINGS.approveTitle);
    const approveBtn = h('button', { class: 'btn btn-primary btn-block pay-approve', type: 'button', onclick: approve }, STRINGS.approve);
    const cancelBtn = h(
      'button',
      {
        class: 'btn btn-secondary btn-block pay-cancel',
        type: 'button',
        onclick: () => showForm('phone')
      },
      STRINGS.cancel
    );
    const status = h('div', { class: 'pay-phone-status', role: 'status' });
    status.hidden = true;
    approveRefs = { approveBtn, cancelBtn, status };

    const phone = h(
      'section',
      { class: 'pay-phone-card', 'aria-label': STRINGS.approveTitle },
      h(
        'div',
        { class: 'pay-phone-bar' },
        h('span', { 'aria-hidden': 'true' }, ui.icon('phone', 16)),
        h('span', null, STRINGS.networks[form.network])
      ),
      h(
        'div',
        { class: 'pay-phone-body' },
        heading,
        h('p', { class: 'pay-phone-label muted' }, STRINGS.approveAmount),
        h('p', { class: 'pay-phone-amount' }, totalText),
        h('p', { class: 'pay-phone-line' }, STRINGS.approveTo(insurerName)),
        h('p', { class: 'pay-phone-line muted' }, STRINGS.approveFrom(ui.maskPhone(msisdn)))
      ),
      status,
      h('div', { class: 'pay-phone-actions' }, approveBtn, cancelBtn)
    );
    show('approve', [phone], heading);
  }

  async function approve() {
    if (!approveRefs || approveRefs.approveBtn.disabled) return;
    setBusy(true);
    const result = await requestPayment(ctx, start, normalisePhone(form.phone));
    onResult(result);
  }

  async function onResult(result) {
    if (!alive) return;
    if (result.ok) {
      const heading = h('h2', { class: 'pay-result-title', tabindex: '-1' }, STRINGS.receivedTitle);
      show(
        'received',
        [
          h(
            'section',
            { class: 'card pay-result pay-result-success', role: 'status' },
            h('span', { class: 'pay-result-icon', 'aria-hidden': 'true' }, ui.icon('check', 32)),
            heading,
            h('p', { class: 'muted' }, STRINGS.receivedText)
          )
        ],
        heading
      );
      await ui.sleep(1000);
      if (!alive) return;
      try {
        const updated = services.startProcessing(ref);
        if (updated) ctx.setState({ renewal: updated });
      } catch (err) {
        // The processing screen starts processing itself when the renewal is paid.
      }
      navigate('/processing');
      return;
    }

    const heading = h('h2', { class: 'pay-result-title', tabindex: '-1' }, STRINGS.errorTitle);
    show(
      'error',
      [
        h(
          'section',
          { class: 'card pay-result pay-result-error', role: 'alert' },
          h('span', { class: 'pay-result-icon pay-result-icon-error', 'aria-hidden': 'true' }, ui.icon('alert', 32)),
          heading,
          h('p', { class: 'pay-result-reason' }, result.reason || STRINGS.genericError),
          h(
            'div',
            { class: 'pay-result-actions' },
            h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => showForm('phone') }, STRINGS.tryAgain),
            h('button', { class: 'btn btn-secondary btn-block', type: 'button', onclick: () => showForm('method') }, STRINGS.changeMethod)
          )
        )
      ],
      heading
    );
  }

  // ---------- start ----------
  if (inflight && inflight.ref === ref) {
    // A payment for this renewal is still being confirmed: wait for it instead of starting another.
    showApprove();
    setBusy(true);
    inflight.promise.then(onResult);
  } else {
    showForm(null);
  }

  return function cleanup() {
    alive = false;
  };
}
