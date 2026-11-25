import { getSeed } from './config.js';
import { getState, setState, resetState, readStore, writeStore } from './state.js';
import { sleep, maskPhone, maskGhanaCard, formatDate } from './ui.js';

const KEYS = { renewals: 'rr_renewals_v1', messages: 'rr_messages_v1', audit: 'rr_audit_v1', flags: 'rr_flags_v1' };
const GENERIC_FAIL = 'We could not verify these details. Check your Ghana Card number and phone number and try again.';
const PAYMENT_FAIL = 'Payment was not approved. Please try again.';
const SECRET = 'rescue-demo-secret';
const CARD_RE = /^GHA-\d{9}-\d$/;
const DAY = 86400000;

/* ---------- date and id helpers ---------- */
const pad = (n) => String(n).padStart(2, '0');
function digits(n) { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10); return s; }
function todayISO() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parseISO(iso) { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return { y, m, d }; }
function isoToUTC(iso) { const { y, m, d } = parseISO(iso); return Date.UTC(y, m - 1, d); }
function fromUTC(ms) { const d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
function addDays(iso, n) { return fromUTC(isoToUTC(iso) + n * DAY); }
function addMonths(iso, n) {
  const { y, m, d } = parseISO(iso);
  const t = m - 1 + n;
  const ty = y + Math.floor(t / 12);
  const tm = ((t % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return ty + '-' + pad(tm + 1) + '-' + pad(Math.min(d, last));
}
function diffDays(a, b) { return Math.round((isoToUTC(a) - isoToUTC(b)) / DAY); }
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function normalisePhone(p) {
  let s = String(p || '').replace(/[\s\-()]/g, '');
  if (s.startsWith('+233')) s = s.slice(4);
  else if (s.startsWith('233') && s.length === 12) s = s.slice(3);
  else if (s.startsWith('0')) s = s.slice(1);
  return s;
}

/* ---------- audit ---------- */
export function logAudit(entityType, entityId, action, meta) {
  const list = readStore(KEYS.audit, []);
  const ev = { id: 'AU-' + Date.now().toString(36).toUpperCase() + digits(3), at: Date.now(), entityType, entityId, action, meta: meta || {} };
  list.push(ev);
  writeStore(KEYS.audit, list);
  return ev;
}

/* ---------- lookups ---------- */
export function getClientByPhone(phone) {
  const n = normalisePhone(phone);
  if (!n) return null;
  return getSeed().clients.find((c) => normalisePhone(c.phone) === n) || null;
}

function statusLabelFor(status, days, expiryDate, within) {
  if (status === 'cancelled') return 'Cancelled';
  if (days < 0) return 'Lapsed ' + Math.abs(days) + (Math.abs(days) === 1 ? ' day ago' : ' days ago');
  if (days === 0) return 'Expires today';
  if (days <= within) return 'Expires in ' + days + (days === 1 ? ' day' : ' days');
  return 'Active until ' + formatDate(expiryDate);
}

function buildPolicies(clientId) {
  const seed = getSeed();
  const { expiringWithinDays, lapsedWithinDays } = seed.config.ranking;
  const today = todayISO();
  const all = seed.policies.filter((p) => p.clientId === clientId).map((p) => {
    const v = seed.vehicles.find((x) => x.id === p.vehicleId) || {};
    const expiryDate = addDays(today, p.expiryOffsetDays);
    const daysToExpiry = diffDays(expiryDate, today);
    return {
      id: p.id, policyNumber: p.policyNumber, clientId: p.clientId, vehicleId: p.vehicleId,
      plate: v.plate, make: v.make, model: v.model, year: v.year, colour: v.colour, use: v.use,
      coverType: p.coverType, status: p.status,
      startDate: addMonths(expiryDate, -12), expiryDate, daysToExpiry,
      statusLabel: statusLabelFor(p.status, daysToExpiry, expiryDate, expiringWithinDays),
      renewalBase: p.renewalBase, rank: null, highlighted: false, selectable: p.status !== 'cancelled'
    };
  });
  const selectable = all.filter((p) => p.selectable);
  const g1 = selectable.filter((p) => (p.daysToExpiry >= 0 && p.daysToExpiry <= expiringWithinDays) || (p.daysToExpiry < 0 && -p.daysToExpiry <= lapsedWithinDays))
    .sort((a, b) => Math.abs(a.daysToExpiry) - Math.abs(b.daysToExpiry));
  const g2 = selectable.filter((p) => !g1.includes(p)).sort((a, b) => a.daysToExpiry - b.daysToExpiry);
  const ordered = [...g1, ...g2];
  ordered.forEach((p, i) => { p.rank = i + 1; p.highlighted = i === 0; });
  return [...ordered, ...all.filter((p) => !p.selectable)];
}

export function getPolicy(policyId) {
  const raw = getSeed().policies.find((p) => p.id === policyId);
  if (!raw) return null;
  return buildPolicies(raw.clientId).find((p) => p.id === policyId) || null;
}

/* ---------- renewal store helpers ---------- */
function findRenewal(ref) {
  const r = readStore(KEYS.renewals, []).find((x) => x.reference === ref);
  if (r) return r;
  const s = getState().renewal;
  if (s && s.reference === ref) return s;
  throw new Error('Renewal ' + ref + ' not found');
}

function saveRenewal(r, forceState) {
  const list = readStore(KEYS.renewals, []);
  const i = list.findIndex((x) => x.reference === r.reference);
  if (i >= 0) list[i] = r; else list.push(r);
  writeStore(KEYS.renewals, list);
  const s = getState().renewal;
  if (forceState || !s || s.reference === r.reference) setState({ renewal: r });
}

function addMessage(msg) {
  const list = readStore(KEYS.messages, []);
  const full = { id: 'MSG-' + Date.now().toString(36).toUpperCase() + digits(3), subject: null, attachments: [], ...msg, sentAt: Date.now() };
  list.push(full);
  writeStore(KEYS.messages, list);
  return full;
}

export function getMessages() { return readStore(KEYS.messages, []).slice().reverse(); }
export function getRenewals() { return readStore(KEYS.renewals, []).slice().reverse(); }
export function getAudit() { return readStore(KEYS.audit, []).slice().reverse(); }

/* ---------- identity and policies ---------- */
export async function verifyIdentity({ ghanaCard, phone }) {
  await sleep(getSeed().config.verificationDelayMs);
  const card = String(ghanaCard || '').trim().toUpperCase();
  const fail = (reason, clientId) => {
    logAudit('client', clientId || 'unknown', 'identity_failed', { card: maskGhanaCard(card), reason });
    return { ok: false, reason };
  };
  if (!CARD_RE.test(card)) return fail(GENERIC_FAIL);
  const client = getClientByPhone(phone);
  if (!client || String(client.ghanaCard).toUpperCase() !== card) return fail(GENERIC_FAIL);
  if (!client.verification || !client.verification.pass) return fail(client.verification && client.verification.reason ? client.verification.reason : GENERIC_FAIL, client.id);
  logAudit('client', client.id, 'identity_verified', { card: maskGhanaCard(card) });
  return { ok: true, clientId: client.id, name: client.name, maskedPhone: maskPhone(client.phone) };
}

export async function lookupPolicies(phone) {
  await sleep(getSeed().config.lookupDelayMs);
  const client = getClientByPhone(phone);
  if (!client) {
    logAudit('client', 'unknown', 'policies_looked_up', { count: 0 });
    return [];
  }
  const list = buildPolicies(client.id);
  logAudit('client', client.id, 'policies_looked_up', { count: list.length });
  return list;
}

export async function getDiscrepancy(policyId) {
  const seed = getSeed();
  const raw = seed.policies.find((p) => p.id === policyId);
  if (!raw) return null;
  const v = seed.vehicles.find((x) => x.id === raw.vehicleId);
  const reg = seed.registry.find((x) => x.vehicleId === raw.vehicleId);
  if (!v || !reg) return null;
  const norm = (s) => String(s || '').trim().toLowerCase();
  if (norm(v.colour) !== norm(reg.colour)) {
    return { field: 'colour', label: 'Vehicle colour', policyValue: v.colour, registryValue: reg.colour, affectsRating: false, options: null };
  }
  if (norm(v.use) !== norm(reg.use)) {
    return { field: 'use', label: 'Vehicle use', policyValue: v.use, registryValue: reg.use, affectsRating: true, options: Object.keys(seed.config.useMultipliers) };
  }
  return null;
}

export async function quoteRenewal(policyId, corrections) {
  const seed = getSeed();
  const raw = seed.policies.find((p) => p.id === policyId);
  if (!raw) throw new Error('Policy ' + policyId + ' not found');
  const v = seed.vehicles.find((x) => x.id === raw.vehicleId) || {};
  const mult = seed.config.useMultipliers;
  const originalUse = v.use;
  const correctedUse = (corrections && corrections.use) || originalUse;
  const factor = (mult[correctedUse] || 1) / (mult[originalUse] || 1);
  const sticker = seed.config.stickerFee;
  const currency = seed.config.currency;
  // Submitted premium = what the insurer would send to NIC: policy premium plus the sticker fee.
  const submitted = round2(raw.renewalBase * factor + sticker);
  const range = (seed.config.nicPremiumRanges || {})[raw.coverType];
  let total = submitted;
  let nic = null;
  if (range && (submitted < range.min || submitted > range.max)) {
    // Corrected to a whole-cedi amount inside the allowed range.
    total = submitted < range.min ? Math.floor(range.min) + 1 : Math.floor(range.max);
    nic = { valid: false, submitted, min: range.min, max: range.max, corrected: total };
  }
  return { base: round2(total - sticker), stickerFee: sticker, total, currency, nic };
}

/* ---------- renewal lifecycle ---------- */
export async function createRenewal({ policyId, corrections, source }) {
  const corr = corrections || {};
  const premium = await quoteRenewal(policyId, corr);
  const t = todayISO().replace(/-/g, '');
  const renewal = {
    reference: 'RN-' + t + '-' + digits(6),
    policyId, source: source || getState().source || { src: null, agent: null }, corrections: corr, premium,
    paymentMethod: null, paymentRef: null, status: 'created',
    createdAt: Date.now(), paidAt: null, processingStartedAt: null, processingEndsAt: null, issuedAt: null,
    newPolicyNumber: null, startDate: null, endDate: null, brownCardNumber: null, verifyToken: null
  };
  saveRenewal(renewal, true);
  Object.keys(corr).forEach((field) => logAudit('policy', policyId, 'correction_made', { field, value: corr[field] }));
  logAudit('renewal', renewal.reference, 'renewal_created', { policyId, total: premium.total });
  return renewal;
}

export async function simulatePayment({ renewalRef, method, msisdn }) {
  await sleep(getSeed().config.paymentDelayMs);
  let r;
  try { r = findRenewal(renewalRef); } catch (e) { return { ok: false, reason: 'Renewal not found. Please start again.' }; }
  const flags = readStore(KEYS.flags, {});
  if (flags.failNextPayment) {
    writeStore(KEYS.flags, { ...flags, failNextPayment: false });
    logAudit('renewal', r.reference, 'payment_failed', { method });
    return { ok: false, reason: PAYMENT_FAIL };
  }
  const providerRef = 'MM-' + digits(10);
  saveRenewal({ ...r, status: 'paid', paymentMethod: method || null, paymentRef: providerRef, paidAt: Date.now() });
  logAudit('renewal', r.reference, 'payment_succeeded', { method, providerRef, msisdn: msisdn ? maskPhone(msisdn) : null });
  return { ok: true, providerRef };
}

function processingSeconds() {
  const { processingSecondsMin: lo, processingSecondsMax: hi } = getSeed().config;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function startProcessing(renewalRef) {
  const r = findRenewal(renewalRef);
  if (r.status === 'processing' || r.status === 'issued') return r;
  const now = Date.now();
  const next = { ...r, status: 'processing', processingStartedAt: now, processingEndsAt: now + processingSeconds() * 1000 };
  saveRenewal(next);
  logAudit('renewal', r.reference, 'processing_started', { endsAt: next.processingEndsAt });
  return next;
}

export async function completeRenewal(renewalRef) {
  let r = findRenewal(renewalRef);
  if (r.status === 'issued') return r;
  const seed = getSeed();
  const policy = getPolicy(r.policyId);
  const client = seed.clients.find((c) => c.id === policy.clientId);
  const today = todayISO();
  const year = today.slice(0, 4);
  const start = policy.expiryDate > today ? policy.expiryDate : today;
  const end = addDays(addMonths(start, seed.config.renewalTermMonths), -1);
  const newPolicyNumber = 'RR-MTR-' + year + '-' + digits(6);
  const brownCardNumber = 'BC-GH-' + year + '-' + digits(6);
  const verifyToken = makeToken({ pn: newPolicyNumber, pl: policy.plate, ct: policy.coverType, vf: start, vt: end });
  r = { ...r, status: 'issued', issuedAt: Date.now(), newPolicyNumber, startDate: start, endDate: end, brownCardNumber, verifyToken };
  saveRenewal(r);
  logAudit('renewal', r.reference, 'policy_issued', { newPolicyNumber, brownCardNumber });
  const ctx = buildDocContext(r.reference);
  addMessage({
    channel: 'sms', to: client.phone, subject: null, attachments: [], renewalRef: r.reference,
    body: 'Your policy ' + policy.plate + ' is renewed until ' + formatDate(end) + '. Policy no. ' + newPolicyNumber + '. Download your documents: ' + ctx.verifyUrl + '.'
  });
  return r;
}

export function buildDocContext(renewalRef) {
  const seed = getSeed();
  const r = findRenewal(renewalRef);
  const policy = getPolicy(r.policyId);
  const raw = seed.vehicles.find((v) => v.id === policy.vehicleId);
  const client = seed.clients.find((c) => c.id === policy.clientId);
  const corr = r.corrections || {};
  return {
    policyNumber: r.newPolicyNumber, brownCardNumber: r.brownCardNumber, issuedAt: r.issuedAt,
    startDate: r.startDate, endDate: r.endDate, coverType: policy.coverType,
    verifyUrl: location.origin + location.pathname + '#/doc/' + (r.verifyToken || ''),
    insurer: { ...seed.insurer },
    client: { name: client.name, phone: client.phone },
    vehicle: {
      plate: raw.plate, make: raw.make, model: raw.model, year: raw.year,
      colour: corr.colour || raw.colour, use: corr.use || raw.use, chassisNo: raw.chassisNo
    },
    premium: { ...r.premium }
  };
}

export async function shareDocuments({ renewalRef, channel, destination }) {
  if (channel !== 'whatsapp' && channel !== 'email') throw new Error('Unsupported channel: ' + channel);
  const r = findRenewal(renewalRef);
  const ctx = buildDocContext(renewalRef);
  const plate = ctx.vehicle.plate.replace(/\s+/g, '-');
  const first = ctx.client.name.split(' ')[0];
  const stamp = String(ctx.startDate).replace(/-/g, '');
  const attachments = [
    { type: 'sticker', fileName: 'STICKER_' + plate + '_' + stamp + '.pdf' },
    { type: 'certificate', fileName: 'cert_' + plate + '_' + stamp + '.pdf' },
    { type: 'brown_card', fileName: 'brown_card_' + plate + '_' + stamp + '.pdf' }
  ];
  const msg = addMessage(channel === 'whatsapp'
    ? { channel, to: destination, subject: null, attachments, renewalRef: r.reference,
        body: 'Hello ' + first + ', your renewed motor policy ' + ctx.policyNumber + ' is attached: sticker, certificate and brown card certificate. Drive safe.' }
    : { channel, to: destination, subject: 'Your renewed motor insurance documents', attachments, renewalRef: r.reference,
        body: 'Hello ' + first + ',\n\nYour motor policy ' + ctx.policyNumber + ' for ' + ctx.vehicle.plate + ' is renewed until ' + formatDate(ctx.endDate) + '. Your sticker, certificate and brown card certificate are attached.\n\nDrive safe,\n' + ctx.insurer.name });
  setState({ share: { channel, destination, sentAt: msg.sentAt, messageId: msg.id } });
  logAudit('renewal', r.reference, 'documents_shared', { channel, destination, messageId: msg.id });
  return msg;
}

/* ---------- signed token ---------- */
function b64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return decodeURIComponent(escape(atob(t)));
}
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function makeToken(payload) {
  const body = b64urlEncode(JSON.stringify({ pn: payload.pn, pl: payload.pl, ct: payload.ct, vf: payload.vf, vt: payload.vt }));
  return body + '.' + fnv1a(body + SECRET);
}

export function verifyDocumentToken(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 2 || parts[1] !== fnv1a(parts[0] + SECRET)) return { status: 'not_found' };
    const p = JSON.parse(b64urlDecode(parts[0]));
    if (!p || !p.pn || !p.vt) return { status: 'not_found' };
    return {
      status: p.vt < todayISO() ? 'expired' : 'valid',
      policyNumber: p.pn, plate: p.pl, coverType: p.ct, validFrom: p.vf, validTo: p.vt
    };
  } catch (e) {
    return { status: 'not_found' };
  }
}

/* ---------- demo controls ---------- */
export const demo = {
  skipCountdown() {
    let r = getState().renewal;
    if (!r || r.status !== 'processing') {
      r = readStore(KEYS.renewals, []).slice().reverse().find((x) => x.status === 'processing') || null;
    }
    if (!r) return null;
    const next = { ...r, processingEndsAt: Date.now() + getSeed().config.skipToSeconds * 1000 };
    saveRenewal(next);
    return next;
  },
  failNextPayment() {
    writeStore(KEYS.flags, { ...readStore(KEYS.flags, {}), failNextPayment: true });
  },
  async reset() {
    writeStore(KEYS.renewals, []);
    writeStore(KEYS.messages, []);
    writeStore(KEYS.audit, []);
    writeStore(KEYS.flags, {});
    resetState();
  },
  isDemoMode() {
    return new URLSearchParams(location.search).get('demo') === '1';
  }
};
