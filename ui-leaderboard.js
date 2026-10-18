// The Leaderboard panel (in the right-hand drawer). start.ng keeps one board
// per game with each signed-in player's best run, ranked by the first column
// of startng.json, then the next ones (NOTES §5). Guests can read it; only
// signed-in players can save, so guests see an invitation to sign in.
// load() comes from flow.js and resolves to
//   { ok, offline, error, entries: [{ rank, name, color, stats, own }], columns,
//     local: { points, streak, solved }, isGuest, canSignIn }

import { h } from './ui-pick.js';

const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function createLeaderboardPanel(drawer, { load, onSignIn, onClose }) {
  let ticket = 0; // ignores a slow reply that arrives after the panel was reopened

  function shell(...body) {
    const close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', text: '×' });
    close.addEventListener('click', () => onClose());
    drawer.replaceChildren(h('header', { class: 'drawer-head' }, h('h2', { class: 'drawer-title', text: 'Leaderboard' }), close), ...body);
  }

  function draw(data) {
    const cols = data.columns;
    const parts = [h('p', { class: 'muted small lb-note', text: `Each player's best run, ranked by ${cols.map((c) => c.label).join(', then ')}.` })];
    if (data.isGuest && !data.offline) {
      const invite = h('div', { class: 'lb-invite' }, h('span', { text: 'Guests can read the board. Sign in to save your score.' }));
      if (data.canSignIn) {
        const b = h('button', { type: 'button', class: 'primary-btn', text: 'Sign in' });
        b.addEventListener('click', () => onSignIn());
        invite.append(b);
      }
      parts.push(invite);
    }
    if (!data.ok) {
      const retry = h('button', { type: 'button', class: 'pill-btn', text: 'Try again' });
      retry.addEventListener('click', () => open());
      parts.push(h('p', { class: 'lb-message', text: data.error || 'Could not load the leaderboard.' }), data.offline ? null : retry);
    } else if (!data.entries.length) {
      parts.push(h('p', { class: 'lb-message', text: 'No runs yet. Solve a Daily origin to be the first!' }));
    } else {
      parts.push(h('table', { class: 'lb-table' },
        h('thead', {}, h('tr', {}, h('th', { text: '#' }), h('th', { text: 'Player' }), cols.map((c) => h('th', { class: 'num', text: c.label })))),
        h('tbody', {}, data.entries.map((e) => h('tr', { class: e.own ? 'own' : null },
          h('td', { text: String(e.rank) }),
          h('td', {}, h('span', { class: 'lb-dot', style: `background:${e.color}` }), h('span', { text: e.own ? `${e.name} (you)` : e.name })),
          cols.map((c) => h('td', { class: 'num', text: fmt(e.stats?.[c.key]) })))))));
    }
    parts.push(h('div', { class: 'lb-local' },
      h('b', { text: 'On this device' }),
      h('span', { text: cols.map((c) => `${c.label} ${fmt(data.local[c.key])}`).join(' · ') })));
    shell(...parts);
  }

  async function open() {
    const mine = ++ticket;
    drawer.dataset.panel = 'leaderboard';
    shell(h('p', { class: 'lb-message', text: 'Loading the leaderboard…' }));
    drawer.dataset.open = 'true';
    drawer.removeAttribute('inert');
    const data = await load();
    if (mine === ticket && drawer.dataset.panel === 'leaderboard' && drawer.dataset.open === 'true') draw(data);
  }

  function close() {
    ticket += 1;
    drawer.dataset.open = 'false';
    drawer.setAttribute('inert', '');
  }

  return {
    open,
    close,
    get isOpen() {
      return drawer.dataset.open === 'true' && drawer.dataset.panel === 'leaderboard';
    },
  };
}
