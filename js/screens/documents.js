// js/screens/documents.js
// Route #/documents: renewal confirmation, three PDF downloads, SMS card, WhatsApp/email sharing.
// Owner: Account 3. Uses only ctx, plus js/documents.js (Account 4) via a dynamic import.

import { getSeed } from '../config.js';

const STRINGS = {
  heroTitle: 'Your policy is renewed',
  policyNumberLabel: 'New policy number',
  validUntil: (date) => `Valid until ${date}`,
  docsTitle: 'Your documents',
  docsIntro: 'Tap a document to download it as a PDF. Keep all three: the sticker goes on your windscreen.',
  docs: {
    sticker: { title: 'Sticker', description: 'For your windscreen. Scan it to check your cover.' },
    certificate: { title: 'Certificate', description: 'Your certificate of motor insurance.' },
    brown_card: { title: 'Brown Card Certificate', description: 'Proof of cover for driving in other ECOWAS countries.' }
  },
  preparing: 'Preparing your PDF…',
  downloaded: 'Downloaded',
  downloadLabel: (title) => `Download ${title} as a PDF`,
  preparingLabel: (title) => `${title} is being prepared`,
  downloadedLive: (title) => `${title} downloaded`,
  downloadError: 'The download did not start. Please try again.',
  generateError: 'We could not prepare your documents.',
  tryAgain: 'Prepare my documents again',
  smsTitle: (masked) => `We sent an SMS to ${masked}`,
  smsText: 'It confirms your renewal.',
  viewSms: 'View the SMS',
  shareTitle: 'How would you like to receive your documents?',
  shareHint: 'Choose WhatsApp or email, then enter where to send them.',
  channels: {
    whatsapp: { title: 'WhatsApp', hint: 'Get the files in a chat' },
    email: { title: 'Email', hint: 'Get the files in your inbox' }
  },
  whatsappLabel: 'WhatsApp number',
  whatsappHint: 'We will send your documents to this number.',
  filledFrom: 'Filled in from your records. Change it if you prefer another one.',
  whatsappError: 'Enter a Ghana mobile number with 10 digits, starting with 0. For example 0240000001.',
  whatsappPlaceholder: '0240000001',
  emailLabel: 'Email address',
  emailHint: 'We will send your documents to this address.',
  emailError: 'Enter an email address with an @ and a domain. For example name@example.com.',
  emailPlaceholder: 'name@example.com',
  send: 'Send my documents',
  sending: 'Sending your documents…',
  sendError: 'We could not send your documents. Please try again.',
  sentVia: (channel, to) => (channel === 'whatsapp' ? `Sent via WhatsApp to ${to}` : `Sent via email to ${to}`),
  sentText: 'Your sticker, certificate and brown card certificate are on their way.',
  viewMessage: 'View the message',
  sendAnother: 'Send them another way',
  newRenewal: 'Start a new renewal',
  newTitle: 'Start a new renewal?',
  newText: 'This clears the renewal from this device. Download your documents first if you still need them here.',
  newKeep: 'Keep my documents'
};

const DOC_ORDER = ['sticker', 'certificate', 'brown_card'];
const GH_MOBILE = /^0(20|23|24|25|26|27|28|29|50|53|54|55|56|57|59)\d{7}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

function normalisePhone(raw) {
  let s = String(raw || '').replace(/[\s\-().]/g, '');
  if (s.startsWith('+233')) s = '0' + s.slice(4);
  else if (s.startsWith('00233')) s = '0' + s.slice(5);
  else if (s.startsWith('233') && s.length === 12) s = '0' + s.slice(3);
  return s;
}

function safely(fn, fallback) {
  try {
    const value = fn();
    return value == null ? fallback : value;
  } catch (err) {
    return fallback;
  }
}

export function render(root, ctx) {
  const { services, ui, navigate } = ctx;
  const { h } = ui;
  const noop = function cleanup() {};

  // Guard by renewal status.
  const state0 = ctx.getState();
  const renewal = state0.renewal;
  if (!renewal) {
    navigate('/');
    return noop;
  }
  if (renewal.status === 'created') {
    navigate('/pay');
    return noop;
  }
  if (renewal.status === 'paid' || renewal.status === 'processing') {
    navigate('/processing');
    return noop;
  }
  if (renewal.status !== 'issued') {
    navigate('/');
    return noop;
  }

  const ref = renewal.reference;
  const policy = safely(() => services.getPolicy(renewal.policyId), null);
  const startPhone = (state0.input && state0.input.phone) || '';
  const maskedPhone = (state0.verification && state0.verification.maskedPhone) || ui.maskPhone(startPhone);
  const messages = safely(() => services.getMessages(), []);
  const smsMessage = messages.find((m) => m.channel === 'sms' && m.renewalRef === ref) || null;

  let alive = true;
  let docs = [];
  let docsApi = null;
  let docsStatus = 'loading'; // loading | ready | error
  let generating = false;
  const downloaded = new Set();

  const clientRecord = safely(() => getSeed().clients.find((c) => c.id === (state0.verification && state0.verification.clientId)), null);
  const knownEmail = (clientRecord && clientRecord.email) || '';
  const share = {
    channel: null,
    busy: false,
    sent: null,
    sentChannel: null,
    sentTo: null,
    values: { whatsapp: startPhone, email: knownEmail },
    known: { whatsapp: !!startPhone, email: !!knownEmail }
  };

  // Restore the "sent" confirmation after a refresh or a visit to the messages screen.
  const savedShare = state0.share;
  if (savedShare && savedShare.messageId) {
    const saved = messages.find((m) => m.id === savedShare.messageId && m.renewalRef === ref);
    if (saved) {
      share.sent = saved;
      share.sentChannel = saved.channel;
      share.sentTo = saved.to || savedShare.destination;
    }
  }

  // ---------- hero ----------
  const heroTitle = h('h1', { class: 'docs-hero-title', tabindex: '-1' }, STRINGS.heroTitle);
  const vehicleText = policy ? [policy.make, policy.model, policy.year].filter(Boolean).join(' ') : '';
  const hero = h(
    'section',
    { class: 'docs-hero' },
    h('span', { class: 'docs-hero-check', 'aria-hidden': 'true' }, ui.icon('check', 36)),
    heroTitle,
    h(
      'p',
      { class: 'docs-policy' },
      h('span', { class: 'docs-policy-label' }, STRINGS.policyNumberLabel),
      h('span', { class: 'docs-policy-number' }, renewal.newPolicyNumber || '')
    ),
    h('p', { class: 'docs-valid' }, STRINGS.validUntil(ui.formatDate(renewal.endDate))),
    policy
      ? h(
          'p',
          { class: 'docs-vehicle' },
          h('span', { class: 'docs-vehicle-name' }, vehicleText),
          h('span', { class: 'docs-plate' }, policy.plate)
        )
      : null
  );

  // ---------- documents ----------
  const docsList = h('div', { class: 'docs-list', 'aria-busy': 'true' });
  const docsLive = h('p', { class: 'docs-sr-only', role: 'status' });

  async function download(doc, doneEl) {
    try {
      await docsApi.downloadDocument(doc);
    } catch (err) {
      ui.toast(STRINGS.downloadError, 'error');
      return;
    }
    downloaded.add(doc.type);
    doneEl.hidden = false;
    docsLive.textContent = STRINGS.downloadedLive(STRINGS.docs[doc.type].title);
  }

  function buildDocButton(type, doc) {
    const def = STRINGS.docs[type];
    const ready = !!doc;
    const done = h(
      'span',
      { class: 'docs-doc-done' },
      h('span', { class: 'docs-doc-done-icon', 'aria-hidden': 'true' }, ui.icon('check', 14)),
      STRINGS.downloaded
    );
    done.hidden = !downloaded.has(type);
    const btn = h(
      'button',
      {
        class: 'docs-doc-btn',
        type: 'button',
        'data-type': type,
        'aria-label': ready ? STRINGS.downloadLabel(def.title) : STRINGS.preparingLabel(def.title),
        onclick: () => {
          if (doc) download(doc, done);
        }
      },
      h('span', { class: 'docs-doc-icon', 'aria-hidden': 'true' }, ui.icon('file', 28)),
      h(
        'span',
        { class: 'docs-doc-text' },
        h('span', { class: 'docs-doc-title' }, def.title),
        h('span', { class: 'docs-doc-desc' }, def.description),
        h('span', { class: 'docs-doc-file' }, ready ? doc.fileName : STRINGS.preparing),
        done
      ),
      h(
        'span',
        { class: 'docs-doc-action' + (ready ? '' : ' docs-doc-action-wait'), 'aria-hidden': 'true' },
        ui.icon(ready ? 'download' : 'spinner', 22)
      )
    );
    btn.disabled = !ready;
    return btn;
  }

  function renderDocs() {
    docsList.setAttribute('aria-busy', docsStatus === 'loading' ? 'true' : 'false');
    if (docsStatus === 'error') {
      docsList.replaceChildren(
        h(
          'div',
          { class: 'docs-error', role: 'alert' },
          h('span', { class: 'docs-error-icon', 'aria-hidden': 'true' }, ui.icon('alert', 24)),
          h('p', { class: 'docs-error-text' }, STRINGS.generateError),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: generate }, STRINGS.tryAgain)
        )
      );
      return;
    }
    docsList.replaceChildren(
      ...DOC_ORDER.map((type) => buildDocButton(type, docsStatus === 'ready' ? docs.find((d) => d.type === type) : null))
    );
  }

  // Blob URLs do not survive a refresh, so the files are regenerated on every render.
  async function generate() {
    if (generating) return;
    generating = true;
    docsStatus = 'loading';
    renderDocs();
    try {
      const docContext = services.buildDocContext(ref);
      if (!docsApi) docsApi = await import('../documents.js');
      const result = await docsApi.generateAll(docContext);
      if (!alive) return;
      docs = DOC_ORDER.map((type) => (result || []).find((d) => d && d.type === type));
      if (docs.some((d) => !d)) throw new Error('Incomplete document set');
      ctx.setState({ documents: docs.map((d) => ({ type: d.type, fileName: d.fileName, url: d.url })) });
      docsStatus = 'ready';
    } catch (err) {
      if (!alive) return;
      docs = [];
      docsStatus = 'error';
    } finally {
      generating = false;
    }
    if (alive) renderDocs();
  }

  const docsSection = h(
    'section',
    { class: 'docs-main', 'aria-labelledby': 'docs-main-title' },
    h('h2', { class: 'docs-section-title', id: 'docs-main-title' }, STRINGS.docsTitle),
    h('p', { class: 'docs-intro muted' }, STRINGS.docsIntro),
    docsList,
    docsLive
  );

  // ---------- SMS ----------
  const smsCard = smsMessage
    ? h(
        'section',
        { class: 'card docs-sms' },
        h('span', { class: 'docs-sms-icon', 'aria-hidden': 'true' }, ui.icon('sms', 22)),
        h(
          'div',
          { class: 'docs-sms-text' },
          h('p', { class: 'docs-sms-title' }, STRINGS.smsTitle(maskedPhone)),
          h('p', { class: 'muted docs-sms-note' }, STRINGS.smsText)
        ),
        h(
          'button',
          {
            class: 'btn btn-secondary btn-block docs-sms-btn',
            type: 'button',
            onclick: () => navigate('/messages?id=' + smsMessage.id)
          },
          STRINGS.viewSms
        )
      )
    : null;

  // ---------- sharing ----------
  const shareBox = h('section', { class: 'card docs-share' });

  function buildChoice() {
    const title = h('h2', { class: 'docs-section-title', id: 'docs-share-title' }, STRINGS.shareTitle);
    const detail = h('div', { class: 'docs-share-detail' });
    const radios = [];
    let field = null; // { input, error, sendBtn }

    function choice(channel) {
      const def = STRINGS.channels[channel];
      const input = h('input', {
        class: 'choice-input',
        type: 'radio',
        name: 'docs-channel',
        value: channel,
        onchange: () => {
          share.channel = channel;
          renderDetail();
        }
      });
      input.checked = false;
      radios.push(input);
      return h(
        'label',
        { class: 'choice choice-stacked' },
        input,
        h(
          'span',
          { class: 'choice-box' },
          h('span', { class: 'choice-mark', 'aria-hidden': 'true' }),
          h('span', { class: 'choice-icon' + (channel === 'whatsapp' ? ' docs-choice-brand' : ''), 'aria-hidden': 'true' }, ui.icon(channel === 'whatsapp' ? 'whatsapp' : 'mail', 24)),
          h('span', { class: 'choice-text' },
            h('span', { class: 'choice-title' }, def.title),
            h('span', { class: 'choice-hint' }, def.hint))
        )
      );
    }

    function setBusy(on) {
      share.busy = on;
      radios.forEach((r) => {
        r.disabled = on;
      });
      if (!field) return;
      field.input.disabled = on;
      field.sendBtn.disabled = on;
      field.sendBtn.replaceChildren(
        ...(on
          ? [h('span', { class: 'docs-spin', 'aria-hidden': 'true' }, ui.icon('spinner', 20)), STRINGS.sending]
          : [STRINGS.send])
      );
    }

    function renderDetail() {
      field = null;
      const channel = share.channel;
      if (!channel) {
        detail.replaceChildren(h('p', { class: 'docs-share-hint muted' }, STRINGS.shareHint));
        return;
      }
      const isWhatsapp = channel === 'whatsapp';
      const input = h('input', {
        class: 'field-input docs-share-input',
        id: 'docs-share-input',
        type: isWhatsapp ? 'tel' : 'email',
        inputmode: isWhatsapp ? 'tel' : 'email',
        autocomplete: isWhatsapp ? 'tel' : 'email',
        placeholder: isWhatsapp ? STRINGS.whatsappPlaceholder : STRINGS.emailPlaceholder,
        'aria-describedby': 'docs-share-hint-text docs-share-error'
      });
      input.value = share.values[channel];
      const ctl = ui.fieldControl(input);
      const error = ui.makeError('docs-share-error');
      const check = ui.attachValidation(input, {
        check: (v) => {
          const raw = v.trim();
          if (isWhatsapp) return GH_MOBILE.test(normalisePhone(raw)) ? '' : STRINGS.whatsappError;
          return EMAIL.test(raw) ? '' : STRINGS.emailError;
        },
        errorEl: error,
        okEl: ctl.ok
      });

      function validate() {
        if (!check.validate()) return null;
        const raw = input.value.trim();
        return isWhatsapp ? normalisePhone(raw) : raw;
      }

      input.addEventListener('input', () => {
        share.values[channel] = input.value;
      });

      const sendBtn = h(
        'button',
        {
          class: 'btn btn-primary btn-block docs-send',
          type: 'button',
          onclick: async () => {
            if (share.busy) return;
            const destination = validate();
            if (!destination) {
              input.focus();
              return;
            }
            setBusy(true);
            try {
              const message = await services.shareDocuments({ renewalRef: ref, channel, destination });
              if (!alive) return;
              share.busy = false;
              share.sent = message || { channel, to: destination };
              share.sentChannel = channel;
              share.sentTo = (message && message.to) || destination;
              ctx.setState({
                share: {
                  channel,
                  destination,
                  sentAt: (message && message.sentAt) || Date.now(),
                  messageId: (message && message.id) || null
                }
              });
              renderShare(true);
            } catch (err) {
              if (!alive) return;
              setBusy(false);
              error.replaceChildren(ui.icon('alert', 16), h('span', {}, STRINGS.sendError));
              error.hidden = false;
            }
          }
        },
        STRINGS.send
      );
      field = { input, error, sendBtn };

      detail.replaceChildren(
        h(
          'div',
          { class: 'field docs-share-field' },
          h('label', { class: 'field-label', for: 'docs-share-input' }, isWhatsapp ? STRINGS.whatsappLabel : STRINGS.emailLabel),
          ctl.wrap,
          h('p', { class: 'field-hint', id: 'docs-share-hint-text' }, (isWhatsapp ? STRINGS.whatsappHint : STRINGS.emailHint) + (share.known[channel] ? ' ' + STRINGS.filledFrom : '')),
          error
        ),
        sendBtn
      );
    }

    const choices = h(
      'div',
      { class: 'docs-choices', role: 'radiogroup', 'aria-labelledby': 'docs-share-title' },
      choice('whatsapp'),
      choice('email')
    );
    renderDetail();
    return [title, choices, detail];
  }

  function buildSent() {
    const heading = h('h2', { class: 'docs-sent-title', tabindex: '-1' }, STRINGS.sentVia(share.sentChannel, share.sentTo));
    const message = share.sent;
    const nodes = [
      h(
        'div',
        { class: 'docs-sent', role: 'status' },
        h('span', { class: 'docs-sent-icon', 'aria-hidden': 'true' }, ui.icon('check', 28)),
        heading,
        h('p', { class: 'muted docs-sent-text' }, STRINGS.sentText),
        h(
          'div',
          { class: 'docs-sent-actions' },
          h(
            'button',
            {
              class: 'btn btn-secondary btn-block',
              type: 'button',
              onclick: () => navigate(message && message.id ? '/messages?id=' + message.id : '/messages')
            },
            STRINGS.viewMessage
          ),
          h(
            'button',
            {
              class: 'btn btn-ghost btn-block docs-another',
              type: 'button',
              onclick: () => {
                share.sent = null;
                share.channel = null;
                renderShare(false);
              }
            },
            STRINGS.sendAnother
          )
        )
      )
    ];
    return { nodes, heading };
  }

  function renderShare(focusResult) {
    if (share.sent) {
      const sent = buildSent();
      shareBox.replaceChildren(...sent.nodes);
      if (focusResult) sent.heading.focus({ preventScroll: true });
    } else {
      shareBox.replaceChildren(...buildChoice());
    }
  }

  // ---------- new renewal ----------
  const newBtn = h(
    'button',
    {
      class: 'btn btn-secondary btn-block docs-new',
      type: 'button',
      onclick: async () => {
        const yes = await ui.confirmDialog({
          title: STRINGS.newTitle,
          text: STRINGS.newText,
          confirmLabel: STRINGS.newRenewal,
          cancelLabel: STRINGS.newKeep
        });
        if (!yes) return;
        ctx.setState(initialState());
        navigate('/');
      }
    },
    STRINGS.newRenewal
  );

  root.appendChild(h('div', { class: 'screen docs-screen' }, hero, docsSection, smsCard, shareBox, newBtn));
  renderShare(false);
  generate();

  return function cleanup() {
    alive = false;
  };
}
