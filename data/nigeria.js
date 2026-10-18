// Nigeria's 36 states + FCT, grouped into the six geopolitical zones exactly as
// in CLAUDE.md §6. lat/lon are approximate state centroids (decimal degrees),
// good enough for Haversine distance and compass-bearing feedback.

export const ZONES = Object.freeze([
  { id: 'north-central', name: 'North Central' },
  { id: 'north-east', name: 'North East' },
  { id: 'north-west', name: 'North West' },
  { id: 'south-east', name: 'South East' },
  { id: 'south-south', name: 'South South' },
  { id: 'south-west', name: 'South West' },
].map((z) => Object.freeze(z)));

function s(id, name, zone, capital, lat, lon) {
  return Object.freeze({ id, name, zone, capital, lat, lon });
}

export const STATES = Object.freeze([
  // North Central
  s('benue', 'Benue', 'north-central', 'Makurdi', 7.35, 8.75),
  s('kogi', 'Kogi', 'north-central', 'Lokoja', 7.75, 6.7),
  s('kwara', 'Kwara', 'north-central', 'Ilorin', 8.95, 4.6),
  s('nasarawa', 'Nasarawa', 'north-central', 'Lafia', 8.5, 8.2),
  s('niger', 'Niger', 'north-central', 'Minna', 9.93, 5.6),
  s('plateau', 'Plateau', 'north-central', 'Jos', 9.2, 9.5),
  s('fct', 'FCT', 'north-central', 'Abuja', 8.85, 7.18),
  // North East
  s('adamawa', 'Adamawa', 'north-east', 'Yola', 9.33, 12.4),
  s('bauchi', 'Bauchi', 'north-east', 'Bauchi', 10.78, 9.9),
  s('borno', 'Borno', 'north-east', 'Maiduguri', 11.8, 13.15),
  s('gombe', 'Gombe', 'north-east', 'Gombe', 10.36, 11.2),
  s('taraba', 'Taraba', 'north-east', 'Jalingo', 7.95, 10.75),
  s('yobe', 'Yobe', 'north-east', 'Damaturu', 12.3, 11.43),
  // North West
  s('jigawa', 'Jigawa', 'north-west', 'Dutse', 12.25, 9.55),
  s('kaduna', 'Kaduna', 'north-west', 'Kaduna', 10.35, 7.7),
  s('kano', 'Kano', 'north-west', 'Kano', 11.7, 8.5),
  s('katsina', 'Katsina', 'north-west', 'Katsina', 12.5, 7.6),
  s('kebbi', 'Kebbi', 'north-west', 'Birnin Kebbi', 11.5, 4.2),
  s('sokoto', 'Sokoto', 'north-west', 'Sokoto', 13.05, 5.25),
  s('zamfara', 'Zamfara', 'north-west', 'Gusau', 12.15, 6.25),
  // South East
  s('abia', 'Abia', 'south-east', 'Umuahia', 5.45, 7.52),
  s('anambra', 'Anambra', 'south-east', 'Awka', 6.22, 6.94),
  s('ebonyi', 'Ebonyi', 'south-east', 'Abakaliki', 6.25, 8.05),
  s('enugu', 'Enugu', 'south-east', 'Enugu', 6.55, 7.4),
  s('imo', 'Imo', 'south-east', 'Owerri', 5.57, 7.06),
  // South South
  s('akwa-ibom', 'Akwa Ibom', 'south-south', 'Uyo', 4.9, 7.85),
  s('bayelsa', 'Bayelsa', 'south-south', 'Yenagoa', 4.75, 6.08),
  s('cross-river', 'Cross River', 'south-south', 'Calabar', 5.87, 8.6),
  s('delta', 'Delta', 'south-south', 'Asaba', 5.7, 5.95),
  s('edo', 'Edo', 'south-south', 'Benin City', 6.63, 5.93),
  s('rivers', 'Rivers', 'south-south', 'Port Harcourt', 4.84, 6.92),
  // South West
  s('ekiti', 'Ekiti', 'south-west', 'Ado-Ekiti', 7.72, 5.31),
  s('lagos', 'Lagos', 'south-west', 'Ikeja', 6.52, 3.58),
  s('ogun', 'Ogun', 'south-west', 'Abeokuta', 7.0, 3.47),
  s('ondo', 'Ondo', 'south-west', 'Akure', 7.1, 5.05),
  s('osun', 'Osun', 'south-west', 'Osogbo', 7.56, 4.52),
  s('oyo', 'Oyo', 'south-west', 'Ibadan', 8.15, 3.6),
]);

export const STATE_BY_ID = Object.freeze(Object.fromEntries(STATES.map((st) => [st.id, st])));
export const ZONE_BY_ID = Object.freeze(Object.fromEntries(ZONES.map((z) => [z.id, z])));
