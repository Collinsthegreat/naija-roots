// "How to play" panel (#23): a dialog over a softly blurred scene (a full-height
// sheet on phones). It never touches the run: the game keeps going underneath.
// Opens from the "?" button, and by itself on a player's first visit (main HUD
// decides; see ui.js). Closes with the X, "Start exploring", Esc or a tap
// outside; focus moves in when it opens and back to the "?" button after.

import { h } from './ui-pick.js';
import { readJSON, writeJSON } from './storage.js';

const SEEN_KEY = 'help:v1'; // roots3d:help:v1 in localStorage (storage.js handles blocked storage)

const TIERS = [
  ['green', 'Green', 'you found it.'],
  ['cyan', 'Cyan', 'very close. The tribe shares a state with the answer, or the country borders it.'],
  ['yellow', 'Yellow', 'getting warm. Same geopolitical zone, or same region of Africa.'],
  ['red', 'Red', 'further away.'],
];

const section = (title, ...children) => h('section', { class: 'help-section' }, h('h3', { text: title }), ...children);
const p = (...children) => h('p', {}, ...children);
const labelled = (label, text) => p(h('b', { text: `${label}: ` }), text);

function helpBody() {
  return [
    section('Two ways to play',
      labelled('Naija Heritage', 'guess the Nigerian tribe.'),
      labelled('Africa 54', "guess which of Africa's 54 countries.")),
    section('Clues',
      p("You start with a 10,000-point battery. The first clue is free. Each extra clue costs more than the one before, from 250 up to 1,750 points. Clues start subtle and get easier: terrain, food, attire and music, greetings and proverbs, festivals, history, region and neighbours, then a ruler's title or a landmark. Every clue also reveals a little more of the storyteller.")),
    section('Guessing',
      labelled('Naija Heritage', 'tap a state, pick a tribe (or search the full list), then Confirm.'),
      labelled('Africa 54', 'tap a country, then Confirm. On phones, the first tap zooms in and the second tap picks.'),
      p('You have three guesses. Each wrong guess costs 30% of your remaining battery.')),
    section('What the colours mean',
      h('ul', { class: 'help-tiers' }, TIERS.map(([tier, name, text]) => h('li', {},
        h('span', { class: `help-dot tier-${tier}`, 'aria-hidden': 'true' }), h('span', {}, h('b', { text: `${name}: ` }), text)))),
      p('Every miss also shows how many km off you are and an arrow pointing toward the answer.')),
    section('A note on roots',
      p('Many tribes live across more than one state, and many states are home to several tribes. Think culture and heritage, not just one spot on the map.')),
    section('Daily and Endless',
      labelled('Daily', 'one mystery per mode, the same for everyone, once a day. A new one arrives at 1:00 AM Nigeria time (00:00 UTC). Daily wins count towards your Best expedition and Daily streak.'),
      labelled('Endless', 'play as many as you like.'),
      p('Every new origin you solve, Daily or Endless, adds a monument to your Heritage Plaza.')),
    h('p', { class: 'help-signin', text: 'Sign in with start.ng to play as your own character and save your scores to the leaderboard.' }),
  ];
}

// returnFocus: the element focus goes back to on close (the "?" button).
export function createHelpPanel({ returnFocus }) {
  const close = h('button', { type: 'button', class: 'icon-btn help-close', 'aria-label': 'Close how to play', text: '×' });
  const start = h('button', { type: 'button', class: 'primary-btn', text: 'Start exploring' });
  const card = h('section', { class: 'help-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'help-title', tabIndex: -1 },
    h('header', { class: 'help-head' },
      h('div', {}, h('h2', { id: 'help-title', text: 'How to play' }), h('p', { class: 'help-lead', text: "Find where today's storyteller comes from." })),
      close),
    h('div', { class: 'help-body' }, helpBody()),
    h('footer', { class: 'help-foot' }, start));
  const layer = h('div', { id: 'help-layer' }, card);
  layer.hidden = true;
  document.body.append(layer);

  function open() {
    if (!layer.hidden) return;
    layer.hidden = false;
    card.scrollTop = 0;
    card.focus({ preventScroll: true });
  }

  function closePanel() {
    if (layer.hidden) return;
    layer.hidden = true;
    returnFocus?.focus({ preventScroll: true });
  }

  close.addEventListener('click', closePanel);
  start.addEventListener('click', closePanel);
  layer.addEventListener('click', (e) => {
    if (e.target === layer) closePanel(); // a tap outside the card
  });
  // Keep Tab inside the dialog while it is open.
  layer.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const stops = [close, start];
    const i = stops.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) {
      e.preventDefault();
      start.focus();
    } else if (!e.shiftKey && i === stops.length - 1) {
      e.preventDefault();
      close.focus();
    }
  });

  return {
    open,
    close: closePanel,
    get isOpen() {
      return !layer.hidden;
    },
  };
}

// First visit? (true once, then remembered under roots3d:help:v1.)
export function firstHelpVisit() {
  if (readJSON(SEEN_KEY, null)?.seen) return false;
  writeJSON(SEEN_KEY, { seen: true });
  return true;
}
