import { h, icon } from './ui.js';

const KEY = 'rr_theme';
const COLORS = { light: '#FFFFFF', dark: '#111B2E' };

function stored() {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null; } catch (e) { return null; }
}
function system() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function currentTheme() {
  return document.documentElement.dataset.theme || stored() || system();
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.removeAttribute('media');
    m.setAttribute('content', COLORS[theme]);
  });
}

export function mountThemeToggle(container) {
  const btn = h('button', { class: 'theme-toggle', type: 'button', id: 'theme-toggle' });
  function paint() {
    const dark = currentTheme() === 'dark';
    btn.replaceChildren(icon(dark ? 'sun' : 'moon', 22));
    const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  }
  btn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(KEY, next); } catch (e) { /* preference just will not persist */ }
    paint();
  });
  // Follow the device setting until the person picks a theme themselves.
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (!stored()) { applyTheme(system()); paint(); }
    });
  }
  applyTheme(currentTheme());
  paint();
  container.appendChild(btn);
}
