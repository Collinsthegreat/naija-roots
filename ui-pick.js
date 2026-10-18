// Answer pickers for the HUD (ui.js):
//   createStatePicker: after tapping a Naija state, a small panel above the
//     guess bar lists the tribes indigenous to that state.
//   createFinder: the quick-select drawer, with search and zone / region
//     filters over every tribe or country.
// Choosing an item only selects it; the guess bar's Confirm locks it in.
// Items: { id, name, altNames, groups, groupLabel, states, tier }.

const TIER_WORD = { green: 'Found', cyan: 'Close', yellow: 'Near', red: 'Far' };

// Case- and accent-insensitive text for search.
function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'role' || k === 'type' || k === 'title' || k === 'for' || k === 'id') node.setAttribute(k, v === true ? '' : v);
    else node[k] = v;
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

// One answer row: name, group, and the tier chip if already guessed.
function answerRow(item, onChoose) {
  const btn = h('button', { type: 'button', class: 'pick-item', 'data-id': item.id, disabled: Boolean(item.tier) },
    h('span', { class: 'pick-name', text: item.name }),
    h('span', { class: 'pick-group', text: item.groupLabel }),
    item.tier ? h('span', { class: `tier-chip tier-${item.tier}`, text: TIER_WORD[item.tier] }) : null);
  btn.addEventListener('click', () => onChoose(item.id));
  return btn;
}

// ---------------------------------------------------------------------------
// State picker (Naija)
// ---------------------------------------------------------------------------

export function createStatePicker(hud, { onChoose, onFindAll, onClose }) {
  const root = h('section', { id: 'picker', class: 'panel', role: 'dialog', 'aria-label': 'Choose a tribe' });
  root.hidden = true;
  hud.append(root);

  function open({ title, subtitle, items }) {
    const close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', text: '×' });
    close.addEventListener('click', () => onClose());
    const all = h('button', { type: 'button', class: 'link-btn', text: 'Search all tribes' });
    all.addEventListener('click', () => onFindAll());
    const list = items.length
      ? h('div', { class: 'pick-list' }, items.map((it) => answerRow(it, onChoose)))
      : h('p', { class: 'muted', text: 'No tribe in this game is listed for this state yet.' });
    root.replaceChildren(
      h('header', { class: 'picker-head' },
        h('div', {}, h('b', { text: title }), h('span', { class: 'muted', text: ` · ${subtitle}` })),
        close),
      h('p', { class: 'picker-hint', text: 'Which tribe is the storyteller from?' }),
      list,
      h('footer', { class: 'picker-foot' }, all),
    );
    root.hidden = false;
    root.querySelector('.pick-item:not([disabled])')?.focus({ preventScroll: true });
  }

  function close() {
    root.hidden = true;
    root.replaceChildren();
  }

  return {
    open,
    close,
    get isOpen() {
      return !root.hidden;
    },
  };
}

// ---------------------------------------------------------------------------
// Finder drawer (both modes)
// ---------------------------------------------------------------------------

export function createFinder(drawer, { onChoose, onClose }) {
  let list = null; // { noun, groups, items }
  let query = '';
  let group = 'all';

  const title = h('h2', { class: 'drawer-title' });
  const closeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', text: '×' });
  closeBtn.addEventListener('click', () => onClose());
  const search = h('input', { type: 'search', class: 'search', autocomplete: 'off', spellcheck: false, enterKeyHint: 'search' });
  search.setAttribute('aria-label', 'Search');
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter' });
  const results = h('div', { class: 'pick-list finder-list' });
  const count = h('p', { class: 'muted finder-count' });

  search.addEventListener('input', () => {
    query = search.value;
    draw();
  });
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const first = results.querySelector('.pick-item:not([disabled])');
    if (first) onChoose(first.dataset.id);
  });

  function drawChips() {
    const all = [{ id: 'all', name: 'All' }, ...list.groups];
    chips.replaceChildren(...all.map((g) => {
      const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(group === g.id), text: g.name });
      b.addEventListener('click', () => {
        group = g.id;
        drawChips();
        draw();
      });
      return b;
    }));
  }

  function draw() {
    const q = fold(query.trim());
    const items = list.items.filter((it) => (group === 'all' || it.groups.includes(group))
      && (!q || [it.name, ...(it.altNames || [])].some((n) => fold(n).includes(q))));
    results.replaceChildren(...(items.length
      ? items.map((it) => answerRow(it, onChoose))
      : [h('p', { class: 'muted finder-empty', text: `No ${list.noun} matches “${query.trim()}”. Try another spelling or clear the filter.` })]));
    count.textContent = items.length === 1 ? `1 ${list.noun}` : `${items.length} ${list.noun === 'country' ? 'countries' : 'tribes'}`;
  }

  function open(answerList) {
    list = answerList;
    if (!list.groups.some((g) => g.id === group)) group = 'all';
    title.textContent = list.noun === 'tribe' ? 'Find a tribe' : 'Find a country';
    search.placeholder = list.noun === 'tribe' ? 'Search tribes' : 'Search countries';
    drawer.dataset.panel = 'finder'; // the drawer is shared with the leaderboard
    drawer.replaceChildren(h('header', { class: 'drawer-head' }, title, closeBtn), search, chips, count, results);
    drawChips();
    draw();
    drawer.dataset.open = 'true';
    drawer.removeAttribute('inert');
    search.focus({ preventScroll: true });
  }

  function close() {
    drawer.dataset.open = 'false';
    drawer.setAttribute('inert', '');
  }

  // Keeps the drawer open but redraws it (e.g. after a guess changed the tiers).
  function refresh(answerList) {
    if (!isOpen()) return;
    list = answerList;
    draw();
  }

  function isOpen() {
    return drawer.dataset.open === 'true' && drawer.dataset.panel === 'finder';
  }

  drawer.setAttribute('inert', '');
  return {
    open,
    close,
    refresh,
    get isOpen() {
      return isOpen();
    },
  };
}
