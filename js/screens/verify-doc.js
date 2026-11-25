import { formatDate, formatDateTime, icon, h } from '../ui.js';

const STRINGS = {
  valid: { title: 'Valid', text: 'This policy is active' },
  expired: { title: 'Expired', text: 'This policy has expired' },
  not_found: { title: 'Not found', text: 'We could not verify this document. Check that you scanned the whole code, or contact the insurer.' },
  policyNumber: 'Policy number',
  plate: 'Registration number',
  coverType: 'Cover type',
  validFrom: 'Valid from',
  validTo: 'Valid to',
  privacy: 'Only non-personal details are shown on this page',
  verifiedBy: 'Verified by Rescue Renewals',
  checkedAt: 'Checked on'
};

export function render(root, ctx) {
  const res = ctx.services.verifyDocumentToken(ctx.params.token) || { status: 'not_found' };
  const status = STRINGS[res.status] ? res.status : 'not_found';
  const s = STRINGS[status];

  const rows = [];
  if (status !== 'not_found') {
    [[STRINGS.policyNumber, res.policyNumber], [STRINGS.plate, res.plate], [STRINGS.coverType, res.coverType],
     [STRINGS.validFrom, res.validFrom ? formatDate(res.validFrom) : '-'], [STRINGS.validTo, res.validTo ? formatDate(res.validTo) : '-']]
      .forEach(([k, v]) => rows.push(h('div', { class: 'verifydoc-row' }, h('span', { class: 'verifydoc-key' }, k), h('strong', null, v || '-'))));
  }

  root.appendChild(h('div', { class: 'screen verifydoc' },
    h('div', { class: 'card verifydoc-card stack' },
      h('div', { class: 'verifydoc-result verifydoc-' + status, role: 'status' },
        h('div', { class: 'verifydoc-icon' }, icon(status === 'valid' ? 'shield' : 'alert', 40), status === 'valid' ? icon('check', 20) : null),
        h('h1', { class: 'verifydoc-title' }, s.title),
        h('p', { class: 'verifydoc-text' }, s.text)),
      rows.length ? h('div', { class: 'verifydoc-details' }, ...rows) : null,
      h('p', { class: 'muted verifydoc-note' }, STRINGS.privacy),
      h('p', { class: 'verifydoc-by' }, icon('shield', 16), ' ', STRINGS.verifiedBy),
      h('p', { class: 'muted verifydoc-time' }, STRINGS.checkedAt + ' ' + formatDateTime(Date.now())))));

  ctx.services.logAudit('document', res.policyNumber || String(ctx.params.token || ''), 'verified_by_scan', { status });
  return function cleanup() {};
}
