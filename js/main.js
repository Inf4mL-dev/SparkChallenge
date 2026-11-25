import { loadSeed, getSeed } from './config.js';
import { setState } from './state.js';
import * as services from './services.js';
import { h, toast, confirmDialog } from './ui.js';
import { startRouter, navigate } from './router.js';
import { mountThemeToggle } from './theme.js';

function mountDemoPanel() {
  const seed = getSeed();
  const hero = seed.clients.find((c) => c.id === seed.config.heroClientId) || seed.clients[0];
  const body = h('div', { class: 'demo-panel-body', id: 'demo-panel-body' });
  const panel = h('div', { class: 'demo-panel', dataset: { open: 'false' } });
  const toggle = h('button', {
    class: 'demo-panel-toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'demo-panel-body',
    onclick: () => {
      const open = panel.dataset.open !== 'true';
      panel.dataset.open = String(open);
      toggle.setAttribute('aria-expanded', String(open));
    }
  }, 'Demo panel');
  const btn = (label, handler) => h('button', { class: 'btn btn-secondary', type: 'button', onclick: handler }, label);

  body.append(
    btn('Reset demo data', async () => {
      const yes = await confirmDialog({
        title: 'Reset all demo data?',
        text: 'This deletes every renewal, message and audit event stored in this browser. It cannot be undone.',
        confirmLabel: 'Reset demo data',
        cancelLabel: 'Keep demo data'
      });
      if (!yes) return;
      await services.demo.reset();
      toast('Demo data reset', 'success');
      navigate('/');
    }),
    btn('Skip the countdown', () => {
      const r = services.demo.skipCountdown();
      toast(r ? 'Countdown skipped' : 'No renewal is processing', r ? 'success' : 'info');
    }),
    btn('Fail the next payment', () => {
      services.demo.failNextPayment();
      toast('The next payment will fail', 'info');
    }),
    btn('Fill in the demo client', () => {
      setState({ input: { ghanaCard: hero.ghanaCard, phone: hero.phone } });
      toast('Filled ' + hero.name, 'success');
      navigate('/');
    }),
    btn('Open the back office', () => navigate('/admin')),
    btn('Open the messages', () => navigate('/messages')),
    btn('Open the QR generator', () => navigate('/qr'))
  );
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.dataset.open === 'true') {
      panel.dataset.open = 'false';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    }
  });
  panel.append(body, toggle);
  document.body.appendChild(panel);
}

async function boot() {
  const app = document.getElementById('app');
  const themeSlot = document.getElementById('theme-slot');
  if (themeSlot) mountThemeToggle(themeSlot);
  try {
    await loadSeed();
  } catch (err) {
    console.error(err);
    app.replaceChildren(h('div', { class: 'screen' },
      h('div', { class: 'card app-state' },
        h('h1', { class: 'title' }, 'We could not start Rescue Renewals'),
        h('p', { class: 'subtitle' }, 'The demo data did not load. If you are running this on your own computer, serve the folder with python3 -m http.server 8000 and open http://localhost:8000. Otherwise check your internet connection.'),
        h('div', { class: 'app-state-actions' }, h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => location.reload() }, 'Reload the app'))
      )));
    return;
  }

  const params = new URLSearchParams(location.search);
  const src = params.get('src');
  const agent = params.get('agent');
  if (src || agent) setState({ source: { src: src || null, agent: agent || null } });

  if (services.demo.isDemoMode()) {
    const extras = document.getElementById('header-extras');
    if (extras) extras.appendChild(h('span', { class: 'demo-badge' }, 'Demo mode'));
    mountDemoPanel();
  }
  startRouter(app);
}

boot();
