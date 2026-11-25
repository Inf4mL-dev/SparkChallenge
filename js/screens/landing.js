const STRINGS = {
  title: 'Renew your motor insurance',
  subtitle: 'Scan, identify and renew in a few minutes.',
  trust: 'Your details are only used to verify your identity',
  cardLabel: 'Ghana Card number',
  cardHint: 'For example GHA-123456789-0',
  cardError: 'Enter your Ghana Card number as GHA, 9 digits, then 1 digit. For example GHA-123456789-0.',
  phoneLabel: 'Phone number',
  phoneHint: 'The mobile number linked to your policy, for example 0240000001',
  phoneError: 'Enter a Ghana mobile number with 10 digits, starting with 0. For example 0240000001.',
  submit: 'Verify and find my policy',
  demo: 'Use the demo client'
};
const DEMO = { ghanaCard: 'GHA-123456789-0', phone: '0240000001' };

function formatCard(raw) {
  const d = String(raw).toUpperCase().replace(/^\s*GHA/, '').replace(/\D/g, '').slice(0, 10);
  return 'GHA-' + d.slice(0, 9) + (d.length > 9 ? '-' + d.slice(9) : '');
}
function cleanPhone(raw) {
  return String(raw).replace(/[^\d+\s]/g, '').replace(/(?!^)\+/g, '');
}
function normPhone(v) {
  let s = String(v).replace(/\s+/g, '');
  if (s.startsWith('+233')) s = s.slice(4);
  else if (s.startsWith('0')) s = s.slice(1);
  return s;
}
const cardOk = (v) => /^GHA-\d{9}-\d$/.test(v);
const phoneOk = (v) => /^\d{9}$/.test(normPhone(v));

export function render(root, ctx) {
  const { getState, setState, services, ui, navigate, query } = ctx;
  const h = ui.h;

  if (query && (query.src || query.agent)) {
    setState({ source: { src: query.src || null, agent: query.agent || null } });
  }
  const saved = getState().input || {};

  const card = h('input', {
    class: 'field-input landing-input', id: 'landing-card', type: 'text', inputmode: 'numeric',
    autocomplete: 'off', autocapitalize: 'characters', 'aria-describedby': 'landing-card-hint landing-card-error'
  });
  const phone = h('input', {
    class: 'field-input landing-input', id: 'landing-phone', type: 'tel', inputmode: 'tel',
    autocomplete: 'tel', 'aria-describedby': 'landing-phone-hint landing-phone-error'
  });
  card.value = formatCard(saved.ghanaCard || '');
  phone.value = saved.phone || '';

  const cardCtl = ui.fieldControl(card);
  const phoneCtl = ui.fieldControl(phone);
  const cardErr = ui.makeError('landing-card-error');
  const phoneErr = ui.makeError('landing-phone-error');
  const cardCheck = ui.attachValidation(card, { check: (v) => (cardOk(v) ? '' : STRINGS.cardError), errorEl: cardErr, okEl: cardCtl.ok, isEmpty: (v) => v === 'GHA-' });
  const phoneCheck = ui.attachValidation(phone, { check: (v) => (phoneOk(v) ? '' : STRINGS.phoneError), errorEl: phoneErr, okEl: phoneCtl.ok });

  // The Ghana Card is formatted as it is typed, never validated while it is still incomplete.
  card.addEventListener('input', () => { card.value = formatCard(card.value); });
  phone.addEventListener('input', () => { phone.value = cleanPhone(phone.value); });

  function submit() {
    const a = cardCheck.validate();
    const b = phoneCheck.validate();
    if (!a || !b) { (a ? phone : card).focus(); return; }
    setState({
      input: { ghanaCard: card.value, phone: phone.value.replace(/\s+/g, '') },
      verification: { status: 'idle', clientId: null, name: null, maskedPhone: null, reason: null },
      lookup: { status: 'idle', policies: [] },
      selectedPolicyId: null,
      discrepancy: null,
      corrections: {},
      renewal: null,
      documents: [],
      share: { channel: null, destination: null, sentAt: null, messageId: null }
    });
    navigate('/verifying');
  }
  const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
  card.addEventListener('keydown', onKey);
  phone.addEventListener('keydown', onKey);

  const demoLink = services.demo.isDemoMode()
    ? h('button', {
        class: 'btn btn-secondary landing-demo', type: 'button',
        onclick: () => {
          card.value = DEMO.ghanaCard; phone.value = DEMO.phone;
          cardCheck.validate(); phoneCheck.validate();
        }
      }, STRINGS.demo)
    : null;

  root.appendChild(
    h('div', { class: 'screen landing-screen stack' },
      h('div', { class: 'stack-tight' },
        h('h1', { class: 'title' }, STRINGS.title),
        h('p', { class: 'subtitle' }, STRINGS.subtitle)),
      h('div', { class: 'landing-trust' }, ui.icon('shield', 20), h('span', {}, STRINGS.trust)),
      h('div', { class: 'card landing-fields' },
        h('div', { class: 'field' },
          h('label', { class: 'field-label', for: 'landing-card' }, STRINGS.cardLabel),
          cardCtl.wrap, h('p', { class: 'field-hint', id: 'landing-card-hint' }, STRINGS.cardHint), cardErr),
        h('div', { class: 'field' },
          h('label', { class: 'field-label', for: 'landing-phone' }, STRINGS.phoneLabel),
          phoneCtl.wrap, h('p', { class: 'field-hint', id: 'landing-phone-hint' }, STRINGS.phoneHint), phoneErr)),
      h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: submit }, STRINGS.submit, ui.icon('arrow-right', 20)),
      demoLink
    )
  );
  return function cleanup() {};
}
