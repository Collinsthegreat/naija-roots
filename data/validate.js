// Data checks for ROOTS 3D. main.js runs runValidation() when the URL has ?debug
// and prints a pass/fail report to the console. validateData() returns the same
// report as an object, so it can also be run from Node or a test.
//
// Name matching is case- and accent-insensitive. Names shorter than 5 letters
// must match a whole word (so "Tiv" doesn't trip on "festival"). Longer names
// match at the start of a word, so derivatives such as "Hausawa" or "Nigerian"
// are caught too.

import { STATES, ZONES, STATE_BY_ID } from './nigeria.js';
import { TRIBES } from './tribes.js';
import { COUNTRIES, REGIONS } from './africa.js';

const CLUE_COUNT = 8;
const MAX_CLUE_LENGTH = 220;
const MIN_TRIBES = 45;
const REGION_COUNTS = { north: 6, west: 15, central: 9, east: 14, southern: 10 };
const NIGERIA_BOX = { lat: [4, 14], lon: [2.6, 14.7] };
const AFRICA_BOX = { lat: [-35, 38], lon: [-26, 64] }; // includes the island nations

function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").toLowerCase();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Returns the first of `names` found in `text`, or null.
function findName(text, names) {
  const t = fold(text);
  for (const name of names) {
    const n = fold(name).trim();
    if (!n) continue;
    const re = new RegExp(n.length < 5 ? `\\b${escapeRe(n)}\\b` : `\\b${escapeRe(n)}`);
    if (re.test(t)) return name;
  }
  return null;
}

function inBox(lat, lon, box) {
  return Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= box.lat[0] && lat <= box.lat[1] && lon >= box.lon[0] && lon <= box.lon[1];
}

function duplicates(ids) {
  const seen = new Set();
  const dup = new Set();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  return [...dup];
}

// Clue-count, length and name checks shared by tribes and countries.
function checkClues(item, forbidden, problems) {
  if (!Array.isArray(item.clues) || item.clues.length !== CLUE_COUNT) {
    problems.push(`${item.id}: has ${item.clues?.length ?? 0} clues, needs ${CLUE_COUNT}`);
    return;
  }
  item.clues.forEach((clue, i) => {
    if (typeof clue !== 'string' || !clue.trim()) {
      problems.push(`${item.id} clue ${i + 1}: empty`);
      return;
    }
    if (clue.length >= MAX_CLUE_LENGTH) problems.push(`${item.id} clue ${i + 1}: ${clue.length} chars (limit ${MAX_CLUE_LENGTH})`);
    const hit = findName(clue, forbidden);
    if (hit) problems.push(`${item.id} clue ${i + 1}: contains "${hit}"`);
  });
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

export function validateData() {
  const checks = [];
  function check(title, problems, notes = []) {
    checks.push({ title, ok: problems.length === 0, problems, notes });
  }

  // --- Nigeria: regions and zones -----------------------------------------
  const zoneIds = new Set(ZONES.map((z) => z.id));
  check('Exactly 37 Nigerian regions (36 states + FCT)', STATES.length === 37 ? [] : [`found ${STATES.length}`]);
  check('Exactly 6 geopolitical zones, and every region is in one', [
    ...(ZONES.length === 6 ? [] : [`found ${ZONES.length} zones`]),
    ...STATES.filter((s) => !zoneIds.has(s.zone)).map((s) => `${s.id}: unknown zone "${s.zone}"`),
  ]);

  const tribesPerState = Object.fromEntries(STATES.map((s) => [s.id, []]));
  for (const t of TRIBES) for (const sid of t.states) tribesPerState[sid]?.push(t.id);
  const empty = STATES.filter((s) => tribesPerState[s.id].length === 0);
  const single = STATES.filter((s) => tribesPerState[s.id].length === 1);
  check('Every region has at least 1 tribe', empty.map((s) => `${s.name}: no tribe`),
    single.length
      ? [`${single.length} regions have only 1 tribe, so they can never be the shared state behind a CYAN: ${single.map((s) => `${s.name} (${tribesPerState[s.id][0]})`).join(', ')}`]
      : []);

  // --- Tribes ---------------------------------------------------------------
  check(`At least ${MIN_TRIBES} tribes`, TRIBES.length >= MIN_TRIBES ? [] : [`found ${TRIBES.length}`], [`${TRIBES.length} tribes`]);

  const tribeStateProblems = [];
  for (const t of TRIBES) {
    if (!t.states.length) tribeStateProblems.push(`${t.id}: no states`);
    for (const sid of t.states) if (!STATE_BY_ID[sid]) tribeStateProblems.push(`${t.id}: unknown state "${sid}"`);
    const derived = [...new Set(t.states.map((sid) => STATE_BY_ID[sid]?.zone).filter(Boolean))];
    if (derived.join() !== t.zones.join()) tribeStateProblems.push(`${t.id}: zones [${t.zones}] don't match its states [${derived}]`);
  }
  check('Tribe states are valid and zones match them', tribeStateProblems);

  const tribeClueProblems = [];
  const tribeZoneNotes = [];
  const zoneName = Object.fromEntries(ZONES.map((z) => [z.id, z.name]));
  for (const t of TRIBES) {
    const parts = t.name.split(/[\s/-]+/).filter((p) => p.length >= 3);
    checkClues(t, [t.name, ...t.altNames, ...parts], tribeClueProblems);
    if (t.clues?.[6] && !t.zones.some((z) => t.clues[6].includes(zoneName[z]))) tribeZoneNotes.push(`${t.id}: clue 7 doesn't name one of its zones`);
  }
  check(`Every tribe has exactly ${CLUE_COUNT} clues, none containing its name or altNames`, tribeClueProblems, tribeZoneNotes);

  // --- Africa -------------------------------------------------------------------
  const counts = Object.fromEntries(Object.keys(REGION_COUNTS).map((r) => [r, 0]));
  const badRegion = [];
  for (const c of COUNTRIES) {
    if (c.region in counts) counts[c.region]++;
    else badRegion.push(`${c.id}: unknown region "${c.region}"`);
  }
  const countProblems = [...badRegion];
  if (COUNTRIES.length !== 54) countProblems.push(`found ${COUNTRIES.length} countries`);
  for (const [r, n] of Object.entries(REGION_COUNTS)) if (counts[r] !== n) countProblems.push(`${r}: ${counts[r]} countries, expected ${n}`);
  check('Exactly 54 countries, regions 6/15/9/14/10', countProblems,
    [`north ${counts.north}, west ${counts.west}, central ${counts.central}, east ${counts.east}, southern ${counts.southern}`]);

  const countryClueProblems = [];
  const regionNotes = [];
  const regionName = Object.fromEntries(REGIONS.map((r) => [r.id, r.name]));
  for (const c of COUNTRIES) {
    checkClues(c, [c.name, ...c.altNames, ...c.demonyms], countryClueProblems);
    if (c.clues?.[6] && !c.clues[6].includes(regionName[c.region])) regionNotes.push(`${c.id}: clue 7 doesn't name ${regionName[c.region]}`);
  }
  check(`Every country has exactly ${CLUE_COUNT} clues, none containing its name`, countryClueProblems, regionNotes);

  const ids = new Set(COUNTRIES.map((c) => c.id));
  const byId = Object.fromEntries(COUNTRIES.map((c) => [c.id, c]));
  const nProblems = [];
  for (const c of COUNTRIES) {
    for (const n of c.neighbours) {
      if (n === c.id) nProblems.push(`${c.id}: lists itself`);
      else if (!ids.has(n)) nProblems.push(`${c.id}: unknown neighbour "${n}"`);
      else if (!byId[n].neighbours.includes(c.id)) nProblems.push(`${c.id} → ${n} is not mirrored`);
    }
    if (duplicates(c.neighbours).length) nProblems.push(`${c.id}: repeats a neighbour`);
    if (c.island && c.neighbours.length) nProblems.push(`${c.id}: island with land neighbours`);
  }
  const pairs = COUNTRIES.reduce((sum, c) => sum + c.neighbours.length, 0) / 2;
  check('Neighbour lists are symmetric and reference valid ids', nProblems, [`${pairs} land-border pairs`]);

  // --- Ids and coordinates ----------------------------------------------------
  const dupProblems = [
    ...duplicates(STATES.map((s) => s.id)).map((id) => `state id "${id}" repeated`),
    ...duplicates(ZONES.map((z) => z.id)).map((id) => `zone id "${id}" repeated`),
    ...duplicates(TRIBES.map((t) => t.id)).map((id) => `tribe id "${id}" repeated`),
    ...duplicates(COUNTRIES.map((c) => c.id)).map((id) => `country id "${id}" repeated`),
  ];
  check('Every id is unique', dupProblems);

  const boxProblems = [
    ...STATES.filter((s) => !inBox(s.lat, s.lon, NIGERIA_BOX)).map((s) => `state ${s.id} (${s.lat}, ${s.lon})`),
    ...TRIBES.filter((t) => !inBox(t.lat, t.lon, NIGERIA_BOX)).map((t) => `tribe ${t.id} (${t.lat}, ${t.lon})`),
    ...COUNTRIES.filter((c) => !inBox(c.lat, c.lon, AFRICA_BOX)).map((c) => `country ${c.id} (${c.lat}, ${c.lon})`),
  ];
  check('Every lat/lon is inside its bounding box (Nigeria or Africa)', boxProblems);

  const failed = checks.filter((c) => !c.ok).length;
  return { ok: failed === 0, passed: checks.length - failed, failed, checks, singleTribeRegions: single.map((s) => s.id) };
}

// Prints the report to the console (or any object with log/warn/error/group).
export function runValidation(out = console) {
  const report = validateData();
  const head = `[roots3d] data validation: ${report.ok ? 'PASS' : 'FAIL'} (${report.passed}/${report.checks.length} checks passed)`;
  (out.group || out.log).call(out, head);
  for (const c of report.checks) {
    if (c.ok) out.log(`✔ ${c.title}`);
    else {
      out.error(`✘ ${c.title}: ${c.problems.length} problem(s)`);
      for (const p of c.problems) out.error(`    ${p}`);
    }
    for (const n of c.notes) out.log(`    · ${n}`);
  }
  out.groupEnd?.();
  return report;
}
