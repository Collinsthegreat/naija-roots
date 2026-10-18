// The 54 African UN member states for Africa mode, grouped by AU region exactly
// as in CLAUDE.md §6. No clue text lives here: clues are attached by id from
// data/clues/africa-1.js (north, west), africa-2.js (central, east) and
// africa-3.js (southern).
//
// id: ISO 3166-1 alpha-3, lowercase. lat/lon: approximate geographic centre.
// neighbours: countries in this list sharing a LAND border (symmetric; islands
// get []). Territories outside the 54 (e.g. Western Sahara) are not listed, so
// no side is taken on disputed boundaries (see REVIEW.md).
// altNames / demonyms: other names people use, for the picker and clue checks.
// npc: stylised, respectful storyteller look { attire, headgear, prop, pose }.

import africa1 from './clues/africa-1.js';
import africa2 from './clues/africa-2.js';
import africa3 from './clues/africa-3.js';

const PACK_OF_REGION = { north: 'africa-1', west: 'africa-1', central: 'africa-2', east: 'africa-2', southern: 'africa-3' };
const CLUE_PACKS = { 'africa-1': africa1, 'africa-2': africa2, 'africa-3': africa3 };

// Default pose per prop, matching npc.js.
const POSE_OF_PROP = {
  'talking-drum': 'drumming', staff: 'standing', 'walking-stick': 'standing', fan: 'gesturing',
  horn: 'gesturing', calabash: 'presenting', beads: 'presenting', 'woven-basket': 'presenting',
};

// c(id, name, region, capital, [lat, lon], neighbours, island, altNames, demonyms, [attire, headgear, prop])
function c(id, name, region, capital, [lat, lon], neighbours, island, altNames, demonyms, [attire, headgear, prop]) {
  return { id, name, region, capital, lat, lon, neighbours, island, altNames, demonyms, npc: { attire, headgear, prop, pose: POSE_OF_PROP[prop] } };
}

const ROSTER = [
  // ---------------- NORTH (6) ----------------
  c('dza', 'Algeria', 'north', 'Algiers', [28.0, 2.6], ['tun', 'lby', 'ner', 'mli', 'mrt', 'mar'], false, [], ['Algerian'],
    [['#f4efe6', '#2f6db5', '#c8343b'], 'turban', 'walking-stick']),
  c('egy', 'Egypt', 'north', 'Cairo', [26.8, 30.8], ['lby', 'sdn'], false, ['Misr'], ['Egyptian'],
    [['#f4efe6', '#2b6cb0', '#e3b23c'], 'turban', 'staff']),
  c('lby', 'Libya', 'north', 'Tripoli', [26.3, 17.2], ['egy', 'sdn', 'tcd', 'ner', 'dza', 'tun'], false, [], ['Libyan'],
    [['#f4efe6', '#b3261e', '#1f1a17'], 'cap', 'walking-stick']),
  c('mrt', 'Mauritania', 'north', 'Nouakchott', [20.3, -10.3], ['dza', 'mli', 'sen'], false, [], ['Mauritanian'],
    [['#2f6db5', '#f4efe6', '#e3b23c'], 'turban', 'calabash']),
  c('mar', 'Morocco', 'north', 'Rabat', [31.8, -7.1], ['dza'], false, ['Maroc', 'Maghrib'], ['Moroccan'],
    [['#5b3a8c', '#e3b23c', '#f4efe6'], 'cap', 'beads']),
  c('tun', 'Tunisia', 'north', 'Tunis', [34.0, 9.5], ['dza', 'lby'], false, [], ['Tunisian'],
    [['#f4efe6', '#b3261e', '#2f6db5'], 'cap', 'fan']),

  // ---------------- WEST (15) ----------------
  c('ben', 'Benin', 'west', 'Porto-Novo', [9.3, 2.3], ['tgo', 'bfa', 'ner', 'nga'], false, [], ['Beninese'],
    [['#e07a2f', '#2f6db5', '#f4efe6'], 'headwrap', 'calabash']),
  c('bfa', 'Burkina Faso', 'west', 'Ouagadougou', [12.2, -1.6], ['mli', 'ner', 'ben', 'tgo', 'gha', 'civ'], false, ['Burkina', 'Upper Volta'], ['Burkinabé', 'Burkinabe'],
    [['#b3261e', '#2f7d4f', '#e3b23c'], 'cap', 'talking-drum']),
  c('cpv', 'Cabo Verde', 'west', 'Praia', [15.1, -23.6], [], true, ['Cape Verde'], ['Cabo Verdean', 'Cape Verdean'],
    [['#2f6db5', '#f4efe6', '#e3b23c'], 'headwrap', 'woven-basket']),
  c('civ', "Côte d'Ivoire", 'west', 'Yamoussoukro', [7.5, -5.5], ['lbr', 'gin', 'mli', 'bfa', 'gha'], false, ['Ivory Coast', 'Côte d’Ivoire', "Cote d'Ivoire", 'Ivoire'], ['Ivorian'],
    [['#e07a2f', '#f4efe6', '#2f7d4f'], 'cap', 'staff']),
  c('gmb', 'Gambia', 'west', 'Banjul', [13.45, -15.4], ['sen'], false, ['The Gambia'], ['Gambian'],
    [['#2f6db5', '#e3b23c', '#f4efe6'], 'cap', 'talking-drum']),
  c('gha', 'Ghana', 'west', 'Accra', [7.95, -1.0], ['civ', 'bfa', 'tgo'], false, ['Gold Coast'], ['Ghanaian'],
    [['#e3b23c', '#2f7d4f', '#b3261e'], 'crown', 'staff']),
  c('gin', 'Guinea', 'west', 'Conakry', [10.4, -10.9], ['gnb', 'sen', 'mli', 'civ', 'lbr', 'sle'], false, ['Guinea-Conakry'], ['Guinean'],
    [['#b3261e', '#e3b23c', '#2f7d4f'], 'cap', 'talking-drum']),
  c('gnb', 'Guinea-Bissau', 'west', 'Bissau', [12.0, -15.0], ['sen', 'gin'], false, ['Bissau'], ['Bissau-Guinean'],
    [['#2f7d4f', '#b3261e', '#e3b23c'], 'headwrap', 'beads']),
  c('lbr', 'Liberia', 'west', 'Monrovia', [6.4, -9.4], ['sle', 'gin', 'civ'], false, [], ['Liberian'],
    [['#2f6db5', '#f4efe6', '#b3261e'], 'cap', 'walking-stick']),
  c('mli', 'Mali', 'west', 'Bamako', [17.6, -4.0], ['dza', 'ner', 'bfa', 'civ', 'gin', 'sen', 'mrt'], false, [], ['Malian'],
    [['#7a4b2a', '#f4efe6', '#1f1a17'], 'turban', 'walking-stick']),
  c('ner', 'Niger', 'west', 'Niamey', [17.6, 8.1], ['dza', 'lby', 'tcd', 'nga', 'ben', 'bfa', 'mli'], false, [], ['Nigerien'],
    [['#2b3f73', '#f4efe6', '#d9a441'], 'turban', 'beads']),
  c('nga', 'Nigeria', 'west', 'Abuja', [9.1, 8.7], ['ben', 'ner', 'tcd', 'cmr'], false, ['Naija'], ['Nigerian'],
    [['#2f7d4f', '#f4efe6', '#e3b23c'], 'gele', 'fan']),
  c('sen', 'Senegal', 'west', 'Dakar', [14.5, -14.45], ['mrt', 'mli', 'gin', 'gnb', 'gmb'], false, [], ['Senegalese'],
    [['#2f7d4f', '#e3b23c', '#b3261e'], 'headwrap', 'talking-drum']),
  c('sle', 'Sierra Leone', 'west', 'Freetown', [8.5, -11.8], ['gin', 'lbr'], false, [], ['Sierra Leonean'],
    [['#2f7d4f', '#f4efe6', '#2f6db5'], 'headwrap', 'woven-basket']),
  c('tgo', 'Togo', 'west', 'Lomé', [8.6, 0.8], ['gha', 'bfa', 'ben'], false, ['Togolese Republic'], ['Togolese'],
    [['#2f7d4f', '#e3b23c', '#b3261e'], 'cap', 'talking-drum']),

  // ---------------- CENTRAL (9) ----------------
  c('bdi', 'Burundi', 'central', 'Gitega', [-3.4, 29.9], ['rwa', 'tza', 'cod'], false, [], ['Burundian'],
    [['#b3261e', '#2f7d4f', '#f4efe6'], 'none', 'talking-drum']),
  c('cmr', 'Cameroon', 'central', 'Yaoundé', [5.7, 12.4], ['nga', 'tcd', 'caf', 'cog', 'gab', 'gnq'], false, ['Cameroun'], ['Cameroonian'],
    [['#2f7d4f', '#b3261e', '#e3b23c'], 'cap', 'beads']),
  c('caf', 'Central African Republic', 'central', 'Bangui', [6.6, 20.9], ['tcd', 'sdn', 'ssd', 'cod', 'cog', 'cmr'], false, ['CAR', 'Centrafrique'], ['Central African', 'Centrafrican'],
    [['#2f6db5', '#f4efe6', '#e3b23c'], 'none', 'woven-basket']),
  c('tcd', 'Chad', 'central', 'N’Djamena', [15.45, 18.7], ['lby', 'sdn', 'caf', 'cmr', 'nga', 'ner'], false, ['Tchad'], ['Chadian'],
    [['#2b3f73', '#e3b23c', '#f4efe6'], 'turban', 'walking-stick']),
  c('cog', 'Republic of the Congo', 'central', 'Brazzaville', [-0.7, 15.2], ['gab', 'cmr', 'caf', 'cod', 'ago'], false, ['Congo', 'Congo-Brazzaville', 'Congo Republic'], ['Congolese'],
    [['#2f7d4f', '#e3b23c', '#b3261e'], 'cap', 'walking-stick']),
  c('cod', 'DR Congo', 'central', 'Kinshasa', [-2.9, 23.6], ['cog', 'caf', 'ssd', 'uga', 'rwa', 'bdi', 'tza', 'zmb', 'ago'], false, ['Congo', 'DRC', 'Democratic Republic of the Congo', 'Congo-Kinshasa', 'Zaire'], ['Congolese'],
    [['#2f6db5', '#e3b23c', '#b3261e'], 'cap', 'staff']),
  c('gnq', 'Equatorial Guinea', 'central', 'Malabo', [1.6, 10.5], ['cmr', 'gab'], false, ['Guinea Ecuatorial'], ['Equatoguinean'],
    [['#2f7d4f', '#f4efe6', '#b3261e'], 'headwrap', 'calabash']),
  c('gab', 'Gabon', 'central', 'Libreville', [-0.8, 11.6], ['gnq', 'cmr', 'cog'], false, [], ['Gabonese'],
    [['#2f7d4f', '#e3b23c', '#2f6db5'], 'none', 'fan']),
  c('stp', 'São Tomé and Príncipe', 'central', 'São Tomé', [0.2, 6.6], [], true, ['Sao Tome and Principe', 'São Tomé', 'Sao Tome', 'Príncipe', 'Principe'], ['Santomean'],
    [['#2f7d4f', '#e3b23c', '#b3261e'], 'headwrap', 'calabash']),

  // ---------------- EAST (14) ----------------
  c('com', 'Comoros', 'east', 'Moroni', [-11.9, 43.9], [], true, ['Comoro Islands', 'Comores'], ['Comorian'],
    [['#2f7d4f', '#f4efe6', '#e3b23c'], 'headwrap', 'fan']),
  c('dji', 'Djibouti', 'east', 'Djibouti', [11.8, 42.6], ['eri', 'eth', 'som'], false, [], ['Djiboutian'],
    [['#6ab0de', '#2f7d4f', '#f4efe6'], 'headwrap', 'walking-stick']),
  c('eri', 'Eritrea', 'east', 'Asmara', [15.2, 39.8], ['sdn', 'eth', 'dji'], false, [], ['Eritrean'],
    [['#f4efe6', '#2f7d4f', '#e3b23c'], 'headwrap', 'calabash']),
  c('eth', 'Ethiopia', 'east', 'Addis Ababa', [9.1, 40.5], ['eri', 'dji', 'som', 'ken', 'ssd', 'sdn'], false, ['Abyssinia'], ['Ethiopian'],
    [['#f4efe6', '#2f7d4f', '#e3b23c'], 'headwrap', 'staff']),
  c('ken', 'Kenya', 'east', 'Nairobi', [0.2, 37.9], ['eth', 'som', 'tza', 'uga', 'ssd'], false, [], ['Kenyan'],
    [['#b3261e', '#1f1a17', '#2f7d4f'], 'none', 'beads']),
  c('mdg', 'Madagascar', 'east', 'Antananarivo', [-18.8, 46.9], [], true, [], ['Malagasy'],
    [['#f4efe6', '#b3261e', '#2f7d4f'], 'none', 'woven-basket']),
  c('mus', 'Mauritius', 'east', 'Port Louis', [-20.3, 57.6], [], true, ['Maurice'], ['Mauritian'],
    [['#e3b23c', '#b3261e', '#2f6db5'], 'none', 'talking-drum']),
  c('rwa', 'Rwanda', 'east', 'Kigali', [-1.95, 29.9], ['uga', 'tza', 'bdi', 'cod'], false, [], ['Rwandan'],
    [['#f4efe6', '#e3b23c', '#2f6db5'], 'headwrap', 'woven-basket']),
  c('syc', 'Seychelles', 'east', 'Victoria', [-4.7, 55.5], [], true, [], ['Seychellois'],
    [['#2f6db5', '#e3b23c', '#b3261e'], 'none', 'talking-drum']),
  c('som', 'Somalia', 'east', 'Mogadishu', [5.2, 46.2], ['dji', 'eth', 'ken'], false, ['Soomaaliya'], ['Somali'],
    [['#6ab0de', '#f4efe6', '#e3b23c'], 'headwrap', 'calabash']),
  c('ssd', 'South Sudan', 'east', 'Juba', [7.3, 30.3], ['sdn', 'eth', 'ken', 'uga', 'cod', 'caf'], false, [], ['South Sudanese'],
    [['#1f1a17', '#b3261e', '#2f6db5'], 'none', 'beads']),
  c('sdn', 'Sudan', 'east', 'Khartoum', [15.6, 30.2], ['egy', 'lby', 'tcd', 'caf', 'ssd', 'eth', 'eri'], false, [], ['Sudanese'],
    [['#f4efe6', '#b3261e', '#2f7d4f'], 'turban', 'walking-stick']),
  c('tza', 'Tanzania', 'east', 'Dodoma', [-6.4, 34.9], ['ken', 'uga', 'rwa', 'bdi', 'cod', 'zmb', 'mwi', 'moz'], false, [], ['Tanzanian'],
    [['#2f7d4f', '#e3b23c', '#2f6db5'], 'cap', 'woven-basket']),
  c('uga', 'Uganda', 'east', 'Kampala', [1.4, 32.3], ['ken', 'ssd', 'cod', 'rwa', 'tza'], false, [], ['Ugandan'],
    [['#7a4b2a', '#e3b23c', '#1f1a17'], 'none', 'talking-drum']),

  // ---------------- SOUTHERN (10) ----------------
  c('ago', 'Angola', 'southern', 'Luanda', [-11.2, 17.9], ['cog', 'cod', 'zmb', 'nam'], false, [], ['Angolan'],
    [['#b3261e', '#1f1a17', '#e3b23c'], 'headwrap', 'calabash']),
  c('bwa', 'Botswana', 'southern', 'Gaborone', [-22.3, 24.7], ['nam', 'zmb', 'zwe', 'zaf'], false, [], ['Motswana', 'Batswana'],
    [['#6ab0de', '#1f1a17', '#f4efe6'], 'none', 'woven-basket']),
  c('swz', 'Eswatini', 'southern', 'Mbabane', [-26.5, 31.5], ['zaf', 'moz'], false, ['Swaziland'], ['Swazi', 'Liswati', 'Emaswati'],
    [['#b3261e', '#2f6db5', '#e3b23c'], 'none', 'staff']),
  c('lso', 'Lesotho', 'southern', 'Maseru', [-29.6, 28.2], ['zaf'], false, [], ['Mosotho', 'Basotho'],
    [['#2f6db5', '#f4efe6', '#2f7d4f'], 'cap', 'walking-stick']),
  c('mwi', 'Malawi', 'southern', 'Lilongwe', [-13.25, 34.3], ['tza', 'moz', 'zmb'], false, ['Nyasaland'], ['Malawian'],
    [['#1f1a17', '#b3261e', '#2f7d4f'], 'headwrap', 'talking-drum']),
  c('moz', 'Mozambique', 'southern', 'Maputo', [-18.7, 35.5], ['tza', 'mwi', 'zmb', 'zwe', 'zaf', 'swz'], false, ['Moçambique'], ['Mozambican'],
    [['#2f7d4f', '#1f1a17', '#e3b23c'], 'headwrap', 'woven-basket']),
  c('nam', 'Namibia', 'southern', 'Windhoek', [-22.6, 17.1], ['ago', 'zmb', 'bwa', 'zaf'], false, [], ['Namibian'],
    [['#b3261e', '#2f6db5', '#e3b23c'], 'headwrap', 'beads']),
  c('zaf', 'South Africa', 'southern', 'Pretoria', [-30.6, 22.9], ['nam', 'bwa', 'zwe', 'moz', 'swz', 'lso'], false, ['RSA', 'Mzansi'], ['South African'],
    [['#2f7d4f', '#e3b23c', '#b3261e'], 'none', 'beads']),
  c('zmb', 'Zambia', 'southern', 'Lusaka', [-13.1, 27.8], ['cod', 'tza', 'mwi', 'moz', 'zwe', 'bwa', 'nam', 'ago'], false, [], ['Zambian'],
    [['#2f7d4f', '#e07a2f', '#1f1a17'], 'headwrap', 'talking-drum']),
  c('zwe', 'Zimbabwe', 'southern', 'Harare', [-19.0, 29.15], ['zmb', 'moz', 'zaf', 'bwa'], false, [], ['Zimbabwean'],
    [['#2f7d4f', '#e3b23c', '#b3261e'], 'none', 'talking-drum']),
];

// Attach clues, freeze, and check neighbour symmetry at load (fails loudly).
const IDS = new Set(ROSTER.map((x) => x.id));
for (const country of ROSTER) {
  for (const n of country.neighbours) {
    if (!IDS.has(n)) throw new Error(`africa.js: ${country.id} lists unknown neighbour "${n}"`);
    const other = ROSTER.find((x) => x.id === n);
    if (!other.neighbours.includes(country.id)) throw new Error(`africa.js: ${country.id}→${n} is not symmetric`);
  }
  if (country.island && country.neighbours.length) throw new Error(`africa.js: island ${country.id} has land neighbours`);
}

export const COUNTRIES = Object.freeze(ROSTER.map((country) => {
  const cluePack = PACK_OF_REGION[country.region];
  const clues = CLUE_PACKS[cluePack]?.[country.id] ?? null;
  return Object.freeze({
    ...country,
    cluePack,
    neighbours: Object.freeze([...country.neighbours]),
    altNames: Object.freeze([...country.altNames]),
    demonyms: Object.freeze([...country.demonyms]),
    npc: Object.freeze({ ...country.npc, attire: Object.freeze([...country.npc.attire]) }),
    clues: clues ? Object.freeze([...clues]) : null,
  });
}));

export const COUNTRY_BY_ID = Object.freeze(Object.fromEntries(COUNTRIES.map((x) => [x.id, x])));

export const REGIONS = Object.freeze([
  { id: 'north', name: 'North Africa' },
  { id: 'west', name: 'West Africa' },
  { id: 'central', name: 'Central Africa' },
  { id: 'east', name: 'East Africa' },
  { id: 'southern', name: 'Southern Africa' },
].map((r) => Object.freeze(r)));

// The storyteller's culture object for a country (npc.js setTarget format).
export function cultureOf(country) {
  return { id: country.id, colors: [...country.npc.attire], headgear: country.npc.headgear, prop: country.npc.prop, pose: country.npc.pose };
}
