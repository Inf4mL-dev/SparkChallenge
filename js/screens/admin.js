import { formatMoney, formatDateTime, icon, h, dialog, confirmDialog } from '../ui.js';
import { getSeed } from '../config.js';
import { motorCommission, numeratorToPesewas, STICKER_FEE_PESEWAS } from '../commission.js';

const STRINGS = {
  title: 'Back office',
  context: 'All renewals stored on this device',
  openFlow: 'Open the client flow',
  reset: 'Reset demo data',
  resetTitle: 'Reset all demo data?',
  resetText: 'This deletes every renewal, message and audit event stored in this browser. It cannot be undone.',
  resetKeep: 'Keep demo data',
  hero: 'Premium collected',
  heroContext: (n) => n + (n === 1 ? ' policy issued' : ' policies issued'),
  stats: ['Renewals started', 'Payments received', 'Average time to issue'],
  matched: 'Every payment is matched to a policy',
  unmatched: (n) => n + (n === 1 ? ' payment has' : ' payments have') + ' no policy attached',
  emptyTitle: 'No renewals yet',
  empty: 'Renewals appear here as soon as a client starts one.',
  startOne: 'Start a renewal',
  renewals: 'Renewals',
  renewalsSub: 'Select a reference to open its audit trail.',
  cols: ['Reference', 'Time', 'Client', 'Plate', 'QR source and agent', 'Status', 'Amount'],
  sales: 'Sales and agent commission by source',
  salesCols: ['Source and agent', 'Renewals', 'Premium', 'Commission'],
  commissionNote: 'Commission follows the EIC agent rules for motor: Third Party 7.5% or Comprehensive 12.5% of the premium after the GH₵' + (STICKER_FEE_PESEWAS / 100) + ' sticker fee, less 10% commission tax. It is worked out on the total premium paid, which already includes the sticker fee.',
  belowFee: (n) => n + (n === 1 ? ' renewal has' : ' renewals have') + ' a premium below the sticker fee, so no commission is shown for it.',
  unsupported: (n) => n + (n === 1 ? ' renewal has' : ' renewals have') + ' a cover type these rules do not cover, so no commission is shown for it.',
  audit: 'Audit trail',
  auditFor: (ref) => 'Events recorded for renewal ' + ref + ' and its policy.',
  noEvents: 'No events recorded.',
  direct: 'direct'
};
const PAID = ['paid', 'processing', 'issued'];
const BADGE = { created: 'badge-muted', paid: 'badge-warning', processing: 'badge-warning', issued: 'badge-success' };

function mmss(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
function plain(a) { const t = String(a || '').replace(/[_-]+/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); }
function detail(meta) {
  if (!meta || typeof meta !== 'object') return '';
  return Object.entries(meta).map(([k, v]) => k + ': ' + (typeof v === 'object' ? JSON.stringify(v) : v)).join(', ');
}

export function render(root, ctx) {
  const svc = ctx.services;
  let lastSig = null;
  const wrap = h('div', { class: 'admin' });
  root.appendChild(wrap);

  function policyOf(r) { try { return svc.getPolicy(r.policyId); } catch (e) { return null; } }
  function clientName(r) {
    try {
      const p = policyOf(r);
      const c = getSeed().clients.find((x) => x.id === (p && p.clientId));
      return c ? c.name : '-';
    } catch (e) { return '-'; }
  }
  function plateOf(r) { const p = policyOf(r); return p ? p.plate : '-'; }
  const sourceOf = (r) => ((r.source && r.source.src) || STRINGS.direct) + (r.source && r.source.agent ? ' / ' + r.source.agent : '');

  function openAudit(r) {
    const audit = svc.getAudit() || [];
    const evs = audit.filter((e) => e.entityId === r.reference || e.entityId === r.policyId).sort((a, b) => a.at - b.at);
    dialog({
      title: STRINGS.audit,
      description: STRINGS.auditFor(r.reference),
      wide: true,
      body: evs.length
        ? h('ol', { class: 'admin-events' }, ...evs.map((e) => h('li', null,
            h('span', { class: 'admin-meta' }, formatDateTime(e.at)), h('strong', null, plain(e.action)),
            detail(e.meta) ? h('span', { class: 'admin-meta' }, detail(e.meta)) : null)))
        : h('p', null, STRINGS.noEvents)
    });
  }

  async function resetDemo() {
    const yes = await confirmDialog({ title: STRINGS.resetTitle, text: STRINGS.resetText, confirmLabel: STRINGS.reset, cancelLabel: STRINGS.resetKeep });
    if (yes) svc.demo.reset();
  }

  function draw(force) {
    const renewals = svc.getRenewals() || [];
    const audit = svc.getAudit() || [];
    const sig = JSON.stringify([renewals, audit]);
    if (!force && sig === lastSig) return;
    lastSig = sig;

    const paid = renewals.filter((r) => PAID.includes(r.status));
    const issuedAll = renewals.filter((r) => r.status === 'issued');
    const issuedTimed = issuedAll.filter((r) => r.issuedAt && r.createdAt);
    const collected = paid.reduce((a, r) => a + ((r.premium && r.premium.total) || 0), 0);
    const avg = issuedTimed.length ? mmss(issuedTimed.reduce((a, r) => a + (r.issuedAt - r.createdAt), 0) / issuedTimed.length) : '-';
    const unalloc = paid.filter((r) => !r.policyId).length;

    // One primary number. The rest are compact and carry no icon tiles, colours or shadows.
    const statValues = [renewals.length, paid.length, avg];
    const kpis = h('section', { class: 'admin-kpis', 'aria-label': 'Key figures' },
      h('div', { class: 'card admin-hero' },
        h('span', { class: 'admin-hero-label' }, STRINGS.hero),
        h('span', { class: 'admin-hero-value' }, formatMoney(collected, 'GHS')),
        h('span', { class: 'admin-hero-context' }, STRINGS.heroContext(issuedAll.length))),
      h('div', { class: 'admin-secondary' }, ...STRINGS.stats.map((label, i) =>
        h('div', { class: 'admin-stat' }, h('span', { class: 'admin-stat-label' }, label), h('span', { class: 'admin-stat-value' }, statValues[i])))),
      h('p', { class: 'admin-status', role: 'status', dataset: { state: unalloc ? 'attention' : 'ok' } },
        icon(unalloc ? 'alert' : 'check', 20), unalloc ? STRINGS.unmatched(unalloc) : STRINGS.matched));

    let renewalsBlock;
    if (!renewals.length) {
      renewalsBlock = h('div', { class: 'card admin-empty' },
        h('p', { class: 'admin-empty-title' }, STRINGS.emptyTitle),
        h('p', null, STRINGS.empty),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => ctx.navigate('/') }, STRINGS.startOne));
    } else {
      renewalsBlock = h('div', { class: 'card admin-table-wrap' }, h('table', { class: 'admin-table' },
        h('caption', { class: 'sr-only' }, STRINGS.renewals),
        h('thead', null, h('tr', null, ...STRINGS.cols.map((c, i) => h('th', { scope: 'col', class: i === 6 ? 'num' : null }, c)))),
        h('tbody', null, ...renewals.map((r) => h('tr', { class: 'admin-row', onclick: () => openAudit(r) },
          h('td', null, h('button', { class: 'admin-link', type: 'button', 'aria-label': STRINGS.audit + ': ' + r.reference }, r.reference)),
          h('td', null, formatDateTime(r.createdAt)), h('td', null, clientName(r)), h('td', null, plateOf(r)),
          h('td', null, sourceOf(r)),
          h('td', null, h('span', { class: 'badge ' + (BADGE[r.status] || 'badge-muted') }, plain(r.status))),
          h('td', { class: 'num' }, formatMoney((r.premium && r.premium.total) || 0, 'GHS')))))));
    }

    // Sales by source. Commission is summed as exact integers and rounded once, here, for display.
    const groups = {};
    let belowFee = 0;
    let unsupported = 0;
    renewals.forEach((r) => {
      const g = groups[sourceOf(r)] || (groups[sourceOf(r)] = { n: 0, prem: 0, num: 0 });
      g.n++;
      if (PAID.includes(r.status) && r.premium) {
        g.prem += r.premium.total || 0;
        const p = policyOf(r);
        const c = motorCommission(r.premium.total, p && p.coverType);
        if (c.status === 'ok') g.num += c.numerator;
        else if (c.status === 'below-fee') belowFee++;
        else unsupported++;
      }
    });
    const keys = Object.keys(groups);
    const notes = [STRINGS.commissionNote, belowFee ? STRINGS.belowFee(belowFee) : null, unsupported ? STRINGS.unsupported(unsupported) : null].filter(Boolean);
    const sales = h('div', { class: 'card admin-table-wrap' },
      h('table', { class: 'admin-table' },
        h('caption', { class: 'sr-only' }, STRINGS.sales),
        h('thead', null, h('tr', null, ...STRINGS.salesCols.map((c, i) => h('th', { scope: 'col', class: i > 0 ? 'num' : null }, c)))),
        h('tbody', null, ...(keys.length
          ? keys.map((k) => h('tr', null, h('td', null, k), h('td', { class: 'num' }, groups[k].n),
              h('td', { class: 'num' }, formatMoney(groups[k].prem, 'GHS')),
              h('td', { class: 'num' }, formatMoney(numeratorToPesewas(groups[k].num) / 100, 'GHS'))))
          : [h('tr', null, h('td', { colspan: 4 }, STRINGS.empty))]))),
      ...notes.map((n) => h('p', { class: 'admin-note' }, n)));

    const head = h('div', { class: 'admin-head' },
      h('div', null, h('h1', { class: 'title' }, STRINGS.title), h('p', { class: 'admin-context' }, STRINGS.context)),
      h('div', { class: 'admin-actions' },
        h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => ctx.navigate('/') }, STRINGS.openFlow),
        svc.demo && svc.demo.isDemoMode() ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: resetDemo }, STRINGS.reset) : null));

    wrap.replaceChildren(head, kpis,
      h('h2', { class: 'admin-h2' }, STRINGS.renewals), h('p', { class: 'admin-sub' }, STRINGS.renewalsSub), renewalsBlock,
      h('h2', { class: 'admin-h2' }, STRINGS.sales), sales);
  }

  draw(true);
  const timer = setInterval(() => draw(false), 2000);
  const onStorage = () => draw(false);
  window.addEventListener('storage', onStorage);
  return function cleanup() { clearInterval(timer); window.removeEventListener('storage', onStorage); };
}
