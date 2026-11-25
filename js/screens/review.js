const STRINGS = {
  title: 'Review your policy',
  loading: 'Loading your policy',
  loadError: 'We could not load this policy. Go back to your policies and choose it again.',
  detailsTitle: 'Policy details',
  policyNo: 'Policy number', plate: 'Plate', vehicle: 'Vehicle', colour: 'Colour', use: 'Use', chassis: 'Chassis number',
  cover: 'Cover type', expiry: 'Current expiry date',
  premiumTitle: 'Renewal premium', base: 'Premium', stickerFee: 'Sticker', total: 'Total due',
  warnTitle: 'We found a difference in the MID database',
  onPolicy: 'On your policy', inRegistry: 'In the vehicle registry',
  chooseTitle: 'Which is correct?', other: 'Something else', otherLabel: 'Enter the correct value',
  otherError: 'Enter the correct value, at least 2 characters.',
  confirm: 'Confirm this correction',
  confirming: 'Saving your correction',
  done: (f, v) => 'Thank you. Your ' + f.toLowerCase() + ' is now recorded as ' + v + '.',
  changed: (a, b) => 'Premium updated from ' + a + ' to ' + b,
  nicTitle: 'NIC premium validation failed for these submission details.',
  nicOutside: (n) => 'Premium ' + n.submitted + ' is outside the allowed range ' + n.min.toFixed(2) + ' - ' + n.max.toFixed(2) + ' GHS',
  nicCorrected: (n) => 'Premium corrected to ' + n.corrected,
  nicAsk: 'Do you want to proceed with the corrected premium?',
  proceed: 'Proceed',
  cont: 'Continue to payment', continuing: 'Preparing your payment', back: 'Back to your policies',
  error: 'We could not save that. Check your connection and try again.'
};
const OTHER = '__other__';
// Some fields need a stricter check than "at least 2 characters".
const FIELD_RULES = {
  year: { test: (v) => /^(19|20)\d{2}$/.test(v.trim()), message: 'Enter a 4-digit year, for example 2019.' },
  chassisNo: { test: (v) => /^[A-Za-z0-9-]{5,30}$/.test(v.trim()), message: 'Enter the chassis number using letters, numbers and hyphens only, at least 5 characters.' }
};
function chassisOf(policy) { return policy.chassisNo || ''; }

export function render(root, ctx) {
  const { getState, setState, services, ui, navigate } = ctx;
  const h = ui.h;
  const policyId = getState().selectedPolicyId;
  const wrap = h('div', { class: 'screen review-screen stack' },
    h('div', { class: 'status-line', role: 'status' }, h('span', { class: 'status-line-icon' }, ui.icon('spinner', 20)), h('span', {}, STRINGS.loading)));
  root.appendChild(wrap);
  let alive = true;

  const backBtn = () => h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => navigate('/policies') }, STRINGS.back);

  async function draw(policy, baseQuote) {
    const s = getState();
    const corr = s.corrections || {};
    const d = s.discrepancy;
    const quote = await services.quoteRenewal(policyId, corr);
    if (!alive) return;
    const resolved = !d || d.resolved === true;

    const colour = corr.colour || policy.colour;
    const use = corr.use || policy.use;
    const rows = [
      [STRINGS.policyNo, policy.policyNumber], [STRINGS.plate, policy.plate],
      [STRINGS.vehicle, policy.make + ' ' + policy.model + ' ' + (corr.year || policy.year)],
      [STRINGS.colour, colour], [STRINGS.use, use], [STRINGS.chassis, corr.chassisNo || chassisOf(policy)], [STRINGS.cover, policy.coverType],
      [STRINGS.expiry, ui.formatDate(policy.expiryDate)]
    ];

    const money = (n) => ui.formatMoney(n, quote.currency);
    // One card, two groups: the details, then the price.
    const summary = h('section', { class: 'card stack', 'aria-label': STRINGS.detailsTitle },
      h('h2', { class: 'section-title' }, STRINGS.detailsTitle),
      h('dl', { class: 'review-list' }, ...rows.map(([k, v]) =>
        h('div', { class: 'review-row' }, h('dt', {}, k), h('dd', {}, v)))),
      h('div', {},
        h('h2', { class: 'section-title' }, STRINGS.premiumTitle),
        h('div', { class: 'review-premium-row' }, h('span', {}, STRINGS.base), h('span', {}, money(quote.base))),
        h('div', { class: 'review-premium-row' }, h('span', {}, STRINGS.stickerFee), h('span', {}, money(quote.stickerFee))),
        h('div', { class: 'review-premium-row review-premium-total' }, h('span', {}, STRINGS.total), h('span', {}, money(quote.total)))));

    const blocks = [h('h1', { class: 'title' }, STRINGS.title), summary];

    if (d && d.resolved) {
      blocks.push(h('div', { class: 'review-success', role: 'status' },
        ui.icon('check', 20),
        h('div', { class: 'stack-tight' },
          h('p', {}, STRINGS.done(d.label || '', d.correctedValue || '')),
          d.affectsRating && baseQuote.total !== quote.total
            ? h('p', { class: 'review-change' }, STRINGS.changed(ui.formatMoney(baseQuote.total, baseQuote.currency), money(quote.total)))
            : null)));
    }

    if (d && !d.resolved) blocks.push(discrepancyCard(d, policy, baseQuote));

    // NIC premium validation runs on the final premium, so only once any discrepancy is resolved.
    const nic = resolved && quote.nic && !quote.nic.valid ? quote.nic : null;
    if (nic) {
      blocks.push(h('section', { class: 'card stack-tight', role: 'alert', 'aria-labelledby': 'review-nic-title' },
        h('h2', { class: 'review-notice-title', id: 'review-nic-title' }, ui.icon('alert', 20), STRINGS.nicTitle),
        h('p', {}, STRINGS.nicOutside(nic)),
        h('p', {}, h('strong', {}, STRINGS.nicCorrected(nic))),
        h('p', { class: 'field-hint' }, STRINGS.nicAsk)));
    }

    const contBtn = h('button', {
      class: 'btn btn-primary btn-block', type: 'button', disabled: !resolved,
      onclick: async (e) => {
        const b = e.currentTarget;
        ui.setButtonState(b, 'loading', STRINGS.continuing);
        try {
          const cur = getState();
          const r = cur.renewal;
          let renewal;
          if (r && r.status === 'created' && r.policyId === policyId &&
              JSON.stringify(r.corrections || {}) === JSON.stringify(cur.corrections || {})) {
            renewal = r;
          } else {
            renewal = await services.createRenewal({ policyId, corrections: cur.corrections || {}, source: cur.source });
            setState({ renewal });
          }
          navigate('/pay');
        } catch (err) { ui.toast(STRINGS.error, 'error'); ui.setButtonState(b, 'idle'); }
      }
    }, nic ? STRINGS.proceed : STRINGS.cont, ui.icon('arrow-right', 20));
    blocks.push(h('div', { class: 'review-actions' },
      contBtn,
      resolved ? null : h('p', { class: 'field-hint' }, 'Choose the correct value above to continue.'),
      backBtn()));
    wrap.replaceChildren(...blocks);
  }

  function discrepancyCard(d, policy, baseQuote) {
    const free = !d.options;
    const choices = free ? [d.policyValue, d.registryValue] : d.options.slice();
    let sel = null;
    const otherInput = h('input', {
      class: 'field-input review-other-input', type: 'text', maxlength: '30', disabled: true,
      'aria-label': STRINGS.otherLabel, placeholder: STRINGS.otherLabel, id: 'review-other',
      'aria-describedby': 'review-other-error'
    });
    const rule = FIELD_RULES[d.field];
    const otherOk = (v) => (rule ? rule.test(v) : v.trim().length >= 2);
    const otherMessage = () => (rule ? rule.message : STRINGS.otherError);
    const otherCtl = ui.fieldControl(otherInput);
    const otherErr = ui.makeError('review-other-error');
    const otherCheck = ui.attachValidation(otherInput, {
      check: (v) => (otherOk(v) ? '' : otherMessage()), errorEl: otherErr, okEl: otherCtl.ok
    });
    // Nothing is pre-selected: the confirm button stays off until a choice is made.
    const confirmBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: true }, STRINGS.confirm);
    const value = () => (sel === OTHER ? otherInput.value.trim() : sel);
    const valid = () => sel !== null && (sel !== OTHER || otherOk(otherInput.value));
    const update = () => { otherInput.disabled = sel !== OTHER; confirmBtn.disabled = !valid(); };
    otherInput.addEventListener('input', update);

    const radio = (v, text) => h('label', { class: 'choice choice-compact' },
      h('input', { class: 'choice-input', type: 'radio', name: 'review-choice', value: v, onchange: () => { sel = v; update(); if (v === OTHER) otherInput.focus(); } }),
      h('span', { class: 'choice-box' }, h('span', { class: 'choice-mark', 'aria-hidden': 'true' }), h('span', { class: 'choice-text' }, h('span', { class: 'choice-title' }, text))));

    confirmBtn.addEventListener('click', async () => {
      if (sel === OTHER && !otherCheck.validate()) { otherInput.focus(); return; }
      const v = value();
      if (!valid() || !v) return;
      ui.setButtonState(confirmBtn, 'loading', STRINGS.confirming);
      try {
        const cur = getState().discrepancy;
        setState({ corrections: { [d.field]: v }, discrepancy: { ...cur, resolved: true, correctedValue: v } });
        services.logAudit('policy', policyId, 'correction', { field: d.field, value: v });
        ui.toast(STRINGS.done(d.label, v), 'success');
        await draw(policy, baseQuote);
      } catch (err) { ui.toast(STRINGS.error, 'error'); ui.setButtonState(confirmBtn, 'idle'); update(); }
    });

    const cell = (label, v) => h('div', { class: 'review-compare-cell' },
      h('span', { class: 'review-compare-label' }, label), h('span', { class: 'review-compare-value' }, v));

    return h('section', { class: 'card stack', 'aria-labelledby': 'review-warn-title' },
      h('h2', { class: 'review-notice-title', id: 'review-warn-title' }, ui.icon('alert', 20), STRINGS.warnTitle),
      h('p', {}, d.label),
      h('div', { class: 'review-compare' }, cell(STRINGS.onPolicy, d.policyValue), cell(STRINGS.inRegistry, d.registryValue)),
      h('fieldset', { class: 'stack-tight', style: 'border:0;margin:0;padding:0;min-width:0' },
        h('legend', { class: 'field-label', style: 'padding:0;margin-bottom:8px' }, STRINGS.chooseTitle),
        ...choices.map((c) => radio(c, c)),
        free ? radio(OTHER, STRINGS.other) : null,
        free ? h('div', { class: 'field' }, otherCtl.wrap, otherErr) : null),
      confirmBtn);
  }

  (async () => {
    try {
      const policy = services.getPolicy(policyId);
      if (!policy) throw new Error('missing');
      const baseQuote = await services.quoteRenewal(policyId, {});
      await draw(policy, baseQuote);
    } catch (e) {
      if (!alive) return;
      wrap.replaceChildren(
        h('div', { class: 'card stack', role: 'alert' }, h('p', { class: 'verify-error-title' }, ui.icon('alert', 20), STRINGS.loadError)),
        backBtn());
    }
  })();

  return function cleanup() { alive = false; };
}
