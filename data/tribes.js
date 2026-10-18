// Tribe roster for Naija mode. No clue text lives here: clues are attached from
// data/clues/tribes-*.js by id. State lists are exactly as given in the brief
// (see REVIEW.md for notes). zones[] is derived from the states.
// lat/lon is an approximate homeland centre (decimal degrees).
// npc is a stylised, respectful look for the storyteller (CLAUDE.md §7):
//   { attire: [2–3 hex], headgear, prop, pose } using the types npc.js supports.

import { STATE_BY_ID } from './nigeria.js';
import northClues from './clues/tribes-north.js';
import middleClues from './clues/tribes-middle.js';
import southClues from './clues/tribes-south.js';

const CLUE_PACKS = { north: northClues, middle: middleClues, south: southClues };

function npc(attire, headgear, prop, pose) {
  return { attire, headgear, prop, pose };
}

// t(id, name, altNames, states, [lat, lon], cluePack, npc)
function t(id, name, altNames, states, [lat, lon], cluePack, look) {
  return { id, name, altNames, states, lat, lon, cluePack, npc: look };
}

const ROSTER = [
  // ---------------- NORTH ----------------
  t('hausa', 'Hausa', ['Hausawa'], ['kano', 'katsina', 'jigawa', 'sokoto', 'zamfara', 'kebbi', 'kaduna', 'bauchi', 'niger'], [12.0, 8.5], 'north',
    npc(['#f4efe6', '#2d4a8a', '#e3b23c'], 'turban', 'staff', 'standing')),
  t('fulani', 'Fulani', ['Fulbe', 'Fula', 'Peul'], ['sokoto', 'kano', 'katsina', 'jigawa', 'zamfara', 'kebbi', 'bauchi', 'gombe', 'adamawa'], [11.5, 8.8], 'north',
    npc(['#1c2d5a', '#e8c15a', '#c8343b'], 'headwrap', 'calabash', 'presenting')),
  t('zarma', 'Zarma', ['Djerma', 'Zerma'], ['kebbi'], [12.0, 3.9], 'north',
    npc(['#2b3f73', '#f4efe6', '#d9a441'], 'turban', 'walking-stick', 'standing')),
  t('dakarkari', 'Dakarkari', ['Lelna', 'Lela', 'Clela', 'Dakarawa'], ['kebbi', 'niger'], [11.43, 5.23], 'north',
    npc(['#7a4b2a', '#e3b23c', '#d2462f'], 'cap', 'beads', 'presenting')),
  t('atyap', 'Atyap', ['Kataf', 'Tyap'], ['kaduna'], [9.78, 8.38], 'north',
    npc(['#1f1a17', '#d2462f', '#f4efe6'], 'cap', 'staff', 'standing')),
  t('bajju', 'Bajju', ['Kaje', 'Jju'], ['kaduna'], [9.83, 8.23], 'north',
    npc(['#2f6b3a', '#f4efe6', '#c8643b'], 'cap', 'walking-stick', 'standing')),
  t('ham', 'Ham', ['Jaba', 'Hyam'], ['kaduna'], [9.45, 8.0], 'north',
    npc(['#8a3b2a', '#e8c26a', '#1f1a17'], 'cap', 'fan', 'gesturing')),
  t('adara', 'Adara', ['Kadara'], ['kaduna'], [10.0, 7.85], 'north',
    npc(['#3a5f8a', '#f4efe6', '#b3261e'], 'cap', 'staff', 'standing')),
  t('kanuri', 'Kanuri', ['Kanouri'], ['borno', 'yobe'], [12.0, 13.0], 'north',
    npc(['#f4efe6', '#3a6fb0', '#e3b23c'], 'turban', 'horn', 'gesturing')),
  t('shuwa-arab', 'Shuwa Arab', ['Shuwa', 'Baggara'], ['borno'], [12.2, 14.0], 'north',
    npc(['#f4efe6', '#c8643b', '#2f6db5'], 'turban', 'walking-stick', 'standing')),
  t('bura', 'Bura', ['Babur', 'Bura-Pabir'], ['borno', 'adamawa'], [10.6, 12.2], 'north',
    npc(['#5a3a24', '#e3b23c', '#f4efe6'], 'cap', 'beads', 'presenting')),
  t('margi', 'Margi', ['Marghi'], ['borno', 'adamawa'], [10.65, 12.9], 'north',
    npc(['#6b2d2d', '#f4efe6', '#d9a441'], 'cap', 'horn', 'gesturing')),
  t('bachama', 'Bachama', ['Bwatiye', 'Bacama'], ['adamawa'], [9.45, 11.95], 'north',
    npc(['#1f5fa8', '#f4efe6', '#d2462f'], 'cap', 'fan', 'gesturing')),
  t('bata', 'Bata', ['Bwatiye', 'Gbwata'], ['adamawa'], [9.45, 12.15], 'north',
    npc(['#2a8a8a', '#f4efe6', '#e3b23c'], 'cap', 'staff', 'standing')),
  t('chamba', 'Chamba', ['Samba', 'Tchamba'], ['adamawa', 'taraba'], [8.4, 11.6], 'north',
    npc(['#3d2b1f', '#e3b23c', '#b3261e'], 'cap', 'talking-drum', 'drumming')),
  t('mumuye', 'Mumuye', [], ['taraba'], [8.9, 11.4], 'north',
    npc(['#7a4b2a', '#f4efe6', '#2f7d4f'], 'none', 'woven-basket', 'presenting')),
  t('jukun', 'Jukun', ['Wapan'], ['taraba', 'benue', 'nasarawa'], [7.87, 9.78], 'north',
    npc(['#f4efe6', '#b3261e', '#e3b23c'], 'crown', 'staff', 'standing')),
  t('mambila', 'Mambila', ['Mambilla', 'Nor'], ['taraba'], [6.72, 11.27], 'north',
    npc(['#3d6b3a', '#e8c26a', '#7a4b2a'], 'cap', 'woven-basket', 'presenting')),
  t('tangale', 'Tangale', ['Tangle'], ['gombe'], [9.86, 11.22], 'north',
    npc(['#8a3b2a', '#f4efe6', '#2b2118'], 'cap', 'horn', 'gesturing')),
  t('waja', 'Waja', ['Wajawa'], ['gombe'], [9.93, 11.53], 'north',
    npc(['#5b3a8c', '#e8c26a', '#f4efe6'], 'cap', 'walking-stick', 'standing')),
  t('tera', 'Tera', ['Nyimatli'], ['gombe', 'borno'], [10.4, 11.3], 'north',
    npc(['#2f6db5', '#f4efe6', '#c8643b'], 'cap', 'calabash', 'presenting')),
  t('bolewa', 'Bolewa', ['Bole', 'Bolanci'], ['yobe', 'gombe'], [11.3, 11.3], 'north',
    npc(['#f4efe6', '#1f5f4a', '#e3b23c'], 'turban', 'staff', 'standing')),
  t('ngizim', 'Ngizim', ['Ngizmawa'], ['yobe'], [11.71, 11.08], 'north',
    npc(['#f4efe6', '#7b2d8e', '#d9a441'], 'turban', 'calabash', 'presenting')),
  t('karai-karai', 'Karai-Karai', ['Karekare', 'Kerekere'], ['yobe', 'bauchi'], [11.3, 10.85], 'north',
    npc(['#c8643b', '#f4efe6', '#2b2118'], 'cap', 'talking-drum', 'drumming')),
  t('sayawa', 'Sayawa', ['Zaar', 'Saya'], ['bauchi'], [9.76, 9.55], 'north',
    npc(['#2b2118', '#e3b23c', '#d2462f'], 'cap', 'horn', 'gesturing')),
  t('jarawa', 'Jarawa', ['Jar', 'Jarawan'], ['bauchi', 'plateau'], [10.05, 9.35], 'north',
    npc(['#3a5f8a', '#e8c26a', '#f4efe6'], 'cap', 'fan', 'gesturing')),

  // ---------------- MIDDLE ----------------
  t('tiv', 'Tiv', [], ['benue', 'nasarawa', 'taraba'], [7.32, 9.0], 'middle',
    npc(['#1f1a17', '#f4efe6', '#1f1a17'], 'cap', 'fan', 'gesturing')),
  t('idoma', 'Idoma', [], ['benue'], [7.19, 8.13], 'middle',
    npc(['#b3261e', '#1f1a17', '#f4efe6'], 'cap', 'horn', 'gesturing')),
  t('igede', 'Igede', [], ['benue'], [6.85, 8.42], 'middle',
    npc(['#2f7d4f', '#f4efe6', '#d9a441'], 'cap', 'calabash', 'presenting')),
  t('igala', 'Igala', [], ['kogi'], [7.3, 7.0], 'middle',
    npc(['#f4efe6', '#b3261e', '#1f1a17'], 'cap', 'staff', 'standing')),
  t('ebira', 'Ebira', ['Igbirra', 'Egbira'], ['kogi'], [7.55, 6.23], 'middle',
    npc(['#2a4c8a', '#f4efe6', '#d2462f'], 'cap', 'fan', 'gesturing')),
  t('nupe', 'Nupe', ['Nupawa', 'Tapa'], ['niger', 'kwara', 'kogi'], [9.08, 6.01], 'middle',
    npc(['#f4efe6', '#1f5f4a', '#e3b23c'], 'cap', 'beads', 'presenting')),
  t('gbagyi', 'Gbagyi', ['Gbari'], ['fct', 'niger', 'kaduna', 'nasarawa'], [9.2, 7.1], 'middle',
    npc(['#e07a2f', '#3d6b3a', '#f6e7c1'], 'headwrap', 'woven-basket', 'presenting')),
  t('kambari', 'Kambari', ['Kamberi'], ['niger', 'kebbi'], [10.6, 5.3], 'middle',
    npc(['#7a4b2a', '#e8c26a', '#2b2118'], 'cap', 'woven-basket', 'presenting')),
  t('busa', 'Busa', ['Bussa', 'Bisa', 'Boko'], ['niger'], [9.88, 4.52], 'middle',
    npc(['#f4efe6', '#2f6db5', '#e3b23c'], 'cap', 'staff', 'standing')),
  t('bariba', 'Bariba', ['Baatonu', 'Borgawa'], ['kwara', 'niger'], [9.6, 3.95], 'middle',
    npc(['#f4efe6', '#7b2d8e', '#e3b23c'], 'turban', 'horn', 'gesturing')),
  t('berom', 'Berom', ['Birom'], ['plateau'], [9.85, 8.85], 'middle',
    npc(['#1f1a17', '#d2462f', '#f4efe6'], 'cap', 'staff', 'standing')),
  t('ngas', 'Ngas', ['Angas'], ['plateau'], [9.33, 9.43], 'middle',
    npc(['#2b2118', '#e3b23c', '#f4efe6'], 'cap', 'walking-stick', 'standing')),
  t('tarok', 'Tarok', ['Yergam'], ['plateau'], [9.14, 9.79], 'middle',
    npc(['#b3261e', '#f4efe6', '#1f1a17'], 'cap', 'talking-drum', 'drumming')),
  t('mwaghavul', 'Mwaghavul', ['Sura'], ['plateau'], [9.52, 9.1], 'middle',
    npc(['#3a5f8a', '#f4efe6', '#c8643b'], 'cap', 'horn', 'gesturing')),
  t('eggon', 'Eggon', [], ['nasarawa'], [8.9, 8.4], 'middle',
    npc(['#2f7d4f', '#e8c26a', '#f4efe6'], 'cap', 'calabash', 'presenting')),
  t('alago', 'Alago', ['Arago'], ['nasarawa'], [8.35, 8.5], 'middle',
    npc(['#5b3a8c', '#f4efe6', '#e3b23c'], 'cap', 'fan', 'gesturing')),
  t('bassa', 'Bassa', ['Bassa-Nge', 'Bassa-Kwomu'], ['nasarawa', 'kogi', 'fct', 'niger'], [8.3, 7.1], 'middle',
    npc(['#c8643b', '#f4efe6', '#2b2118'], 'cap', 'woven-basket', 'presenting')),
  t('koro', 'Koro', ['Koro-Ija'], ['fct', 'kaduna', 'niger', 'nasarawa'], [9.25, 7.45], 'middle',
    npc(['#1f5fa8', '#e8c26a', '#f4efe6'], 'cap', 'staff', 'standing')),

  // ---------------- SOUTH ----------------
  t('yoruba', 'Yoruba', ['Yorùbá'], ['lagos', 'ogun', 'oyo', 'osun', 'ondo', 'ekiti', 'kwara', 'kogi'], [7.6, 4.2], 'south',
    npc(['#5b3a8c', '#e3b23c', '#f4efe6'], 'gele', 'talking-drum', 'drumming')),
  t('egun', 'Egun', ['Ogu', 'Gun'], ['lagos', 'ogun'], [6.42, 2.88], 'south',
    npc(['#f4efe6', '#2f6db5', '#d2462f'], 'headwrap', 'calabash', 'presenting')),
  t('igbo', 'Igbo', ['Ibo'], ['abia', 'anambra', 'ebonyi', 'enugu', 'imo', 'delta', 'rivers'], [5.9, 7.4], 'south',
    npc(['#f4efe6', '#b3261e', '#1f1a17'], 'cap', 'fan', 'gesturing')),
  t('edo', 'Edo', ['Bini', 'Benin'], ['edo'], [6.34, 5.62], 'south',
    npc(['#f4efe6', '#d2462f', '#e3b23c'], 'beaded-crown', 'beads', 'presenting')),
  t('esan', 'Esan', ['Ishan'], ['edo'], [6.72, 6.15], 'south',
    npc(['#f4efe6', '#d2462f', '#1f1a17'], 'cap', 'walking-stick', 'standing')),
  t('etsako', 'Etsako', ['Yekhee'], ['edo'], [7.07, 6.27], 'south',
    npc(['#2f7d4f', '#f4efe6', '#e3b23c'], 'cap', 'horn', 'gesturing')),
  t('urhobo', 'Urhobo', [], ['delta'], [5.5, 5.9], 'south',
    npc(['#f4efe6', '#2f6db5', '#d2462f'], 'cap', 'walking-stick', 'standing')),
  t('isoko', 'Isoko', [], ['delta'], [5.47, 6.2], 'south',
    npc(['#e07a2f', '#f4efe6', '#3d6b3a'], 'cap', 'fan', 'gesturing')),
  t('itsekiri', 'Itsekiri', ['Iwere'], ['delta'], [5.55, 5.35], 'south',
    npc(['#f4efe6', '#5b3a8c', '#e3b23c'], 'cap', 'staff', 'standing')),
  t('ukwuani', 'Ukwuani', ['Ndokwa'], ['delta'], [5.71, 6.43], 'south',
    npc(['#b3261e', '#f4efe6', '#e3b23c'], 'cap', 'fan', 'gesturing')),
  t('ijaw', 'Ijaw', ['Izon', 'Ijo'], ['bayelsa', 'delta', 'rivers', 'ondo'], [4.9, 6.0], 'south',
    npc(['#f4efe6', '#2f6db5', '#d2462f'], 'cap', 'walking-stick', 'standing')),
  t('ikwerre', 'Ikwerre', ['Iwhuruohna'], ['rivers'], [5.0, 6.85], 'south',
    npc(['#f4efe6', '#1f5f4a', '#d9a441'], 'cap', 'fan', 'gesturing')),
  t('ogoni', 'Ogoni', [], ['rivers'], [4.67, 7.37], 'south',
    npc(['#2a8a8a', '#f4efe6', '#e3b23c'], 'cap', 'horn', 'gesturing')),
  t('kalabari', 'Kalabari', [], ['rivers'], [4.73, 6.86], 'south',
    npc(['#5b2a6a', '#d2462f', '#e3b23c'], 'cap', 'walking-stick', 'standing')),
  t('okrika', 'Okrika', ['Wakirike'], ['rivers'], [4.74, 7.08], 'south',
    npc(['#f4efe6', '#7b2d8e', '#e3b23c'], 'cap', 'fan', 'gesturing')),
  t('ogba', 'Ogba', [], ['rivers'], [5.34, 6.66], 'south',
    npc(['#3d6b3a', '#f4efe6', '#e3b23c'], 'cap', 'staff', 'standing')),
  t('ibibio', 'Ibibio', [], ['akwa-ibom'], [5.03, 7.92], 'south',
    npc(['#e07a2f', '#1f1a17', '#f4efe6'], 'cap', 'fan', 'gesturing')),
  t('annang', 'Annang', ['Anaang'], ['akwa-ibom'], [5.18, 7.71], 'south',
    npc(['#2f6db5', '#f4efe6', '#d2462f'], 'cap', 'walking-stick', 'standing')),
  t('oron', 'Oron', ['Oro'], ['akwa-ibom'], [4.82, 8.23], 'south',
    npc(['#7a4b2a', '#f4efe6', '#e3b23c'], 'cap', 'staff', 'standing')),
  t('efik', 'Efik', [], ['cross-river'], [4.95, 8.33], 'south',
    npc(['#b3261e', '#e3b23c', '#f4efe6'], 'headwrap', 'beads', 'presenting')),
  t('ejagham', 'Ejagham', ['Ekoi', 'Ejagam'], ['cross-river'], [5.6, 8.65], 'south',
    npc(['#1f1a17', '#e3b23c', '#d2462f'], 'cap', 'staff', 'standing')),
  t('yakurr', 'Yakurr', ['Yakö', 'Lokaa'], ['cross-river'], [5.81, 8.08], 'south',
    npc(['#2f7d4f', '#f4efe6', '#e3b23c'], 'cap', 'calabash', 'presenting')),
  t('bekwarra', 'Bekwarra', ['Bekwara'], ['cross-river'], [6.67, 8.85], 'south',
    npc(['#c8643b', '#f4efe6', '#3d6b3a'], 'cap', 'woven-basket', 'presenting')),
];

// Derive zones, attach clues, freeze. Unknown state ids fail loudly at load.
export const TRIBES = Object.freeze(ROSTER.map((tribe) => {
  const zones = [];
  for (const sid of tribe.states) {
    const st = STATE_BY_ID[sid];
    if (!st) throw new Error(`tribes.js: unknown state id "${sid}" for ${tribe.id}`);
    if (!zones.includes(st.zone)) zones.push(st.zone);
  }
  const clues = CLUE_PACKS[tribe.cluePack]?.[tribe.id] ?? null;
  return Object.freeze({
    ...tribe,
    altNames: Object.freeze([...tribe.altNames]),
    states: Object.freeze([...tribe.states]),
    zones: Object.freeze(zones),
    npc: Object.freeze({ ...tribe.npc, attire: Object.freeze([...tribe.npc.attire]) }),
    clues: clues ? Object.freeze([...clues]) : null,
  });
}));

export const TRIBE_BY_ID = Object.freeze(Object.fromEntries(TRIBES.map((tr) => [tr.id, tr])));

// The storyteller's culture object for a tribe (npc.js setTarget format).
export function cultureOf(tribe) {
  return { id: tribe.id, colors: [...tribe.npc.attire], headgear: tribe.npc.headgear, prop: tribe.npc.prop, pose: tribe.npc.pose };
}
