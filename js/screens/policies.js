const STRINGS = {
  title: 'Choose the policy to renew',
  found: (n, name, p) => name + ' · ' + n + (n === 1 ? ' policy' : ' policies') + ' linked to ' + p,
  groupLabel: 'Your policies',
  likely: 'Most likely your renewal',
  unavailable: 'Not available for renewal',
  expires: 'Expiry date',
  cont: (plate) => 'Continue with ' + plate,
  contNone: 'Select a policy to continue',
  startOver: 'Not you? Start over',
  none: 'No policies to show.',
  error: 'We could not load the details for this policy. Check your connection and try again.'
};
const INITIAL = {
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

function badgeClass(p) {
  if (p.status === 'cancelled') return 'badge badge-muted';
  if (p.status === 'lapsed') return 'badge badge-danger';
  if (p.daysToExpiry <= 30) return 'badge badge-warning';
  return 'badge badge-success';
}

export function render(root, ctx) {
  const { getState, setState, services, ui, navigate } = ctx;
  const h = ui.h;
  const st = getState();
  const policies = st.lookup.policies || [];
  const byId = new Map(policies.map((p) => [p.id, p]));

  let selected = st.selectedPolicyId && byId.get(st.selectedPolicyId) && byId.get(st.selectedPolicyId).selectable
    ? st.selectedPolicyId : null;
  if (!selected) {
    const top = policies.find((p) => p.highlighted && p.selectable);
    selected = top ? top.id : null;
    if (selected) setState({ selectedPolicyId: selected });
  }

  const inputs = new Map();
  const cont = h('button', { class: 'btn btn-primary btn-block', type: 'button' });
  let contLabel = null;

  function sync() {
    inputs.forEach((el, id) => { el.checked = id === selected; });
    const p = selected && byId.get(selected);
    contLabel.textContent = p ? STRINGS.cont(p.plate) : STRINGS.contNone;
    cont.disabled = !p;
  }
  function select(p) {
    if (!p.selectable) return;
    selected = p.id;
    setState({ selectedPolicyId: p.id });
    sync();
  }

  function card(p, i) {
    const top = p.highlighted && p.selectable;
    const input = h('input', {
      class: 'choice-input', type: 'radio', name: 'policy', value: p.id,
      disabled: !p.selectable, onchange: () => select(p)
    });
    inputs.set(p.id, input);
    return h('label', { class: 'choice' + (p.selectable ? '' : ' is-disabled'), style: '--i:' + i },
      input,
      h('span', { class: 'choice-box policy-box' },
        h('span', { class: 'choice-mark', 'aria-hidden': 'true' }),
        h('span', { class: 'policy-body' },
          top ? h('span', { class: 'badge badge-highlight' }, STRINGS.likely) : null,
          h('span', { class: 'policy-plate' }, p.plate),
          h('span', { class: 'policy-meta' }, p.make + ' ' + p.model + ' ' + p.year + ' · ' + p.coverType),
          h('span', { class: 'policy-badges' }, h('span', { class: badgeClass(p) }, p.statusLabel)),
          h('span', { class: 'policy-meta' }, STRINGS.expires + ': ' + ui.formatDate(p.expiryDate)),
          p.selectable ? null : h('span', { class: 'policy-note' }, STRINGS.unavailable)
        )));
  }

  cont.addEventListener('click', async () => {
    const id = selected;
    if (!id) return;
    ui.setButtonState(cont, 'loading', 'Loading your policy');
    try {
      services.logAudit('policy', id, 'selected', {});
      const d = await services.getDiscrepancy(id);
      setState({ selectedPolicyId: id, discrepancy: d || null, corrections: {} });
      navigate('/review');
    } catch (e) {
      ui.toast(STRINGS.error, 'error');
      ui.setButtonState(cont, 'idle');
      contLabel = cont.querySelector('.cont-label');
      sync();
    }
  });
  contLabel = h('span', { class: 'cont-label' });
  cont.append(contLabel, ui.icon('arrow-right', 20));
  cont._idle = [...cont.childNodes].map((n) => n.cloneNode(true));

  const startOver = h('button', {
    class: 'btn btn-ghost btn-block', type: 'button',
    onclick: () => { setState(INITIAL); navigate('/'); }
  }, STRINGS.startOver);

  root.appendChild(
    h('div', { class: 'screen policy-screen stack' },
      h('div', { class: 'stack-tight' },
        h('h1', { class: 'title' }, STRINGS.title),
        h('p', { class: 'subtitle' }, STRINGS.found(policies.length, st.verification.name || 'Your account', st.verification.maskedPhone || 'your phone number'))),
      policies.length
        ? h('fieldset', { class: 'policy-list' },
            h('legend', { class: 'sr-only' }, STRINGS.groupLabel),
            ...policies.map(card))
        : h('p', { class: 'muted' }, STRINGS.none),
      h('div', { class: 'policy-actions' }, cont, startOver)
    )
  );
  sync();
  return function cleanup() {};
}
