import { formatDateTime, icon, h } from '../ui.js';
import { getSeed } from '../config.js';

const STRINGS = {
  title: 'Messages',
  tabs: [['all', 'All'], ['sms', 'SMS'], ['whatsapp', 'WhatsApp'], ['email', 'Email']],
  emptyTitle: 'No messages yet',
  empty: 'Messages appear here after a renewal sends an SMS, a WhatsApp message or an email.',
  emptyFiltered: (l) => 'No ' + l + ' messages yet',
  startOne: 'Start a renewal',
  filterLabel: 'Show messages by channel',
  smsFrom: 'DEMO-INS',
  to: 'To',
  from: 'From',
  subject: 'Subject'
};

export function render(root, ctx) {
  const svc = ctx.services;
  const targetId = ctx.query && ctx.query.id;
  let tab = 'all';
  let lastSig = null;
  let scrolled = false;
  const initial = targetId ? (svc.getMessages() || []).find((m) => m.id === targetId) : null;
  if (initial) tab = initial.channel;

  const tabsEl = h('div', { class: 'msg-filters', role: 'group', 'aria-label': STRINGS.filterLabel });
  const list = h('div', { class: 'msg-list' });
  root.appendChild(h('div', { class: 'screen msg' }, h('h1', { class: 'title' }, STRINGS.title), tabsEl, list));

  function chips(m) {
    if (!m.attachments || !m.attachments.length) return null;
    return h('div', { class: 'msg-chips' }, ...m.attachments.map((a) => h('span', { class: 'msg-chip' }, icon('file', 14), ' ', a.fileName)));
  }
  function bubble(m) {
    const time = h('div', { class: 'msg-time' }, formatDateTime(m.sentAt));
    const cls = 'msg-item' + (m.id === targetId ? ' msg-highlight' : '');
    const insurer = (getSeed().insurer) || {};
    if (m.channel === 'sms') {
      return h('div', { class: cls + ' msg-sms', dataset: { id: m.id } }, h('div', { class: 'msg-from' }, STRINGS.smsFrom), h('div', { class: 'msg-body' }, m.body), time);
    }
    if (m.channel === 'whatsapp') {
      return h('div', { class: cls + ' msg-wa', dataset: { id: m.id } },
        h('div', { class: 'msg-from' }, icon('whatsapp', 14), ' ', insurer.shortName || 'Demo Insurance', ' to ', m.to),
        h('div', { class: 'msg-body' }, m.body), chips(m), time);
    }
    return h('div', { class: cls + ' msg-mail card', dataset: { id: m.id } },
      h('div', { class: 'msg-meta' }, h('span', { class: 'muted' }, STRINGS.from + ': '), insurer.email || ''),
      h('div', { class: 'msg-meta' }, h('span', { class: 'muted' }, STRINGS.to + ': '), m.to),
      h('div', { class: 'msg-subject' }, m.subject || ''),
      h('div', { class: 'msg-body' }, m.body), chips(m), time);
  }

  function draw(force) {
    const all = svc.getMessages() || [];
    const sig = JSON.stringify([all, tab]);
    if (!force && sig === lastSig) return;
    lastSig = sig;
    tabsEl.replaceChildren(...STRINGS.tabs.map(([k, l]) => h('button', {
      class: 'msg-tab' + (k === tab ? ' msg-tab-active' : ''), type: 'button', 'aria-pressed': String(k === tab),
      onclick: () => { tab = k; draw(true); }
    }, l)));
    const shown = tab === 'all' ? all : all.filter((m) => m.channel === tab);
    const label = (STRINGS.tabs.find(([k]) => k === tab) || [, ''])[1];
    list.replaceChildren(...(shown.length ? shown.map(bubble) : [h('div', { class: 'msg-empty' },
      h('p', { class: 'msg-empty-title' }, tab === 'all' ? STRINGS.emptyTitle : STRINGS.emptyFiltered(label)),
      h('p', null, STRINGS.empty),
      tab === 'all' ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => ctx.navigate('/') }, STRINGS.startOne) : null)]));
    if (targetId && !scrolled) {
      const el = list.querySelector('[data-id="' + (window.CSS && CSS.escape ? CSS.escape(targetId) : targetId) + '"]');
      if (el) { scrolled = true; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }
  }

  draw(true);
  const timer = setInterval(() => draw(false), 2000);
  const onStorage = () => draw(false);
  window.addEventListener('storage', onStorage);
  return function cleanup() { clearInterval(timer); window.removeEventListener('storage', onStorage); };
}
