import { icon, h, toast, fieldControl, makeError, attachValidation } from '../ui.js';

const STRINGS = {
  title: 'QR code generator',
  source: 'Source',
  agent: 'Agent ID (optional)',
  agentHint: 'For example AG-014',
  base: 'Base URL',
  sources: [['sticker', 'Vehicle sticker'], ['flyer', 'Flyer'], ['agent', 'Agent card'], ['poster', 'Shopfront poster']],
  copy: 'Copy the link',
  copied: 'Link copied',
  baseError: 'Enter a web address that starts with http:// or https://, for example https://example.com/.',
  needValid: 'Enter a valid base URL to create the QR code.',
  copyFail: 'Could not copy. Select the link and copy it manually.',
  png: 'Download the PNG',
  print: 'Print the sheet',
  caption: 'Scan to renew your motor insurance',
  preview: 'QR code preview'
};
const NS = 'http://www.w3.org/2000/svg';

function makeQr(value) {
  const qr = window.qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  return qr;
}

function svgFor(value, size) {
  const qr = makeQr(value);
  const n = qr.getModuleCount();
  const total = n + 8;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + total + ' ' + total);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', STRINGS.preview);
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width', total); bg.setAttribute('height', total); bg.setAttribute('fill', '#fff');
  svg.appendChild(bg);
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + (c + 4) + ' ' + (r + 4) + 'h1v1h-1z';
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d); p.setAttribute('fill', '#000');
  svg.appendChild(p);
  return svg;
}

export function render(root, ctx) {
  const st = { src: 'sticker', agent: '', base: location.origin + location.pathname };
  const srcSel = h('select', { class: 'field-input', id: 'qrgen-src', onchange: (e) => { st.src = e.target.value; update(); } },
    ...STRINGS.sources.map(([v, l]) => h('option', { value: v }, l + ' (' + v + ')')));
  const agentIn = h('input', { class: 'field-input', id: 'qrgen-agent', type: 'text', placeholder: 'AG-014', oninput: (e) => { st.agent = e.target.value.trim(); update(); } });
  const baseIn = h('input', { class: 'field-input', id: 'qrgen-base', type: 'url', inputmode: 'url', value: st.base, 'aria-describedby': 'qrgen-base-error',
    oninput: (e) => { st.base = e.target.value.trim(); update(); } });
  const baseCtl = fieldControl(baseIn);
  const baseErr = makeError('qrgen-base-error');
  const validUrl = (v) => { try { const u = new URL(v.trim()); return u.protocol === 'http:' || u.protocol === 'https:'; } catch (e) { return false; } };
  attachValidation(baseIn, { check: (v) => (validUrl(v) ? '' : STRINGS.baseError), errorEl: baseErr, okEl: baseCtl.ok });
  const copyBtn = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => copy() }, STRINGS.copy);
  const pngBtn = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => png() }, icon('download', 20), STRINGS.png);
  const printBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => printSheet() }, STRINGS.print);
  const preview = h('div', { class: 'qrgen-preview' });
  const urlBox = h('div', { class: 'qrgen-url', tabindex: '0' });
  const printArea = h('div', { class: 'qrgen-print-area' });

  function url() {
    return st.base + '?src=' + encodeURIComponent(st.src) + (st.agent ? '&agent=' + encodeURIComponent(st.agent) : '');
  }
  function update() {
    const ok = validUrl(st.base);
    [copyBtn, pngBtn, printBtn].forEach((b) => { b.disabled = !ok; });
    if (!ok) { urlBox.textContent = STRINGS.needValid; preview.replaceChildren(); return; }
    const u = url();
    urlBox.textContent = u;
    try { preview.replaceChildren(svgFor(u, 240)); } catch (e) { preview.textContent = 'QR code could not be drawn.'; }
  }
  function label() { return st.src + (st.agent ? ' / ' + st.agent : ''); }

  function confirmCopied() {
    copyBtn.replaceChildren(icon('check', 20), STRINGS.copied);
    setTimeout(() => copyBtn.replaceChildren(STRINGS.copy), 2000);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url()); toast(STRINGS.copied, 'success'); confirmCopied(); }
    catch (e) {
      try {
        const r = document.createRange(); r.selectNodeContents(urlBox);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        if (document.execCommand('copy')) { toast(STRINGS.copied, 'success'); confirmCopied(); } else toast(STRINGS.copyFail, 'error');
      } catch (e2) { toast(STRINGS.copyFail, 'error'); }
    }
  }
  function png() {
    try {
      const qr = makeQr(url());
      const total = qr.getModuleCount() + 8;
      const cell = Math.floor(1024 / total);
      const off = Math.floor((1024 - cell * total) / 2);
      const cv = document.createElement('canvas');
      cv.width = 1024; cv.height = 1024;
      const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 1024, 1024);
      g.fillStyle = '#000';
      const n = qr.getModuleCount();
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect(off + (c + 4) * cell, off + (r + 4) * cell, cell, cell);
      cv.toBlob((b) => {
        if (!b) return toast('Could not create the image.', 'error');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'RR_QR_' + st.src + (st.agent ? '_' + st.agent : '') + '.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }, 'image/png');
    } catch (e) { toast('Could not create the image.', 'error'); }
  }
  function printSheet() {
    const u = url();
    printArea.replaceChildren(...Array.from({ length: 6 }, () =>
      h('figure', { class: 'qrgen-print-item' }, svgFor(u, 220),
        h('figcaption', null, h('strong', null, label()), h('div', null, STRINGS.caption)))));
    setTimeout(() => window.print(), 50);
  }

  root.appendChild(h('div', { class: 'screen qrgen' },
    h('h1', { class: 'title' }, STRINGS.title),
    h('div', { class: 'card stack qrgen-card', style: 'gap:24px' },
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'qrgen-src' }, STRINGS.source), srcSel),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'qrgen-agent' }, STRINGS.agent), agentIn, h('div', { class: 'field-hint' }, STRINGS.agentHint)),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'qrgen-base' }, STRINGS.base), baseCtl.wrap, baseErr),
      preview, urlBox,
      h('div', { class: 'qrgen-actions' }, copyBtn, pngBtn, printBtn)),
    printArea));
  update();
  return function cleanup() {};
}
