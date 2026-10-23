// Dig levels: clear every gold block to win. Each board is built from its seed, so a level is the same every time.
// depth: crack rows down to the deepest gold; width: crack width (2 is roomier); seg: [min, max] rows per straight run
// of the crack; golds / knots / ambers / kegs / irons: special blocks set into the crack rows; time: seconds;
// axe: chance a piece is an axe; grow: seconds between new rows rising from below (0 = never); fog: no Next preview;
// dusk: the board is dark except around the falling piece; grav / minGrav: seconds per row; ghost: landing guide.
const LEVELS = [
  { name: 'First Cut',   seed: 101, depth: 5,  width: 2, seg: [2, 3], golds: 1, knots: 0, time: 120, axe: 0,    tip: 'Clear the row with the gold block to win.' },
  { name: 'Splinter',    seed: 102, depth: 7,  width: 2, seg: [2, 4], golds: 1, knots: 0, time: 120, axe: 0,    tip: 'The crack jogs sideways. Clear the top rows to open the next run.' },
  { name: 'Dovetail',    seed: 103, depth: 8,  width: 1, seg: [3, 4], golds: 1, knots: 0, time: 130, axe: 0,    tip: 'A one-wide crack: stand the long piece on end. Hold one for later.' },
  { name: 'Mortise',     seed: 104, depth: 9,  width: 2, seg: [2, 4], golds: 1, knots: 1, time: 140, axe: 0,    tip: 'Knots are tough. The first piece to complete their row bounces off.' },
  { name: 'Heartwood',   seed: 105, depth: 10, width: 1, seg: [2, 4], golds: 2, knots: 1, time: 150, axe: 0,    tip: 'Two gold blocks this time.' },
  { name: 'Burl',        seed: 106, depth: 10, width: 2, seg: [1, 3], golds: 2, knots: 3, time: 150, axe: 0.05, tip: 'Axes split the three rows they land on.' },
  { name: 'Sawmill',     seed: 107, depth: 12, width: 1, seg: [2, 4], golds: 2, knots: 2, time: 170, axe: 0.04 },
  { name: 'Timber Line', seed: 108, depth: 12, width: 2, seg: [1, 3], golds: 2, knots: 4, time: 170, axe: 0.04 },
  { name: 'Grain Run',   seed: 109, depth: 14, width: 1, seg: [3, 4], golds: 3, knots: 2, time: 190, axe: 0.03 },
  { name: 'Knothole',    seed: 110, depth: 14, width: 2, seg: [1, 3], golds: 2, knots: 7, time: 200, axe: 0.04 },
  { name: 'Deep Root',   seed: 111, depth: 16, width: 1, seg: [2, 4], golds: 3, knots: 4, time: 220, axe: 0.03 },
  { name: 'Old Growth',  seed: 112, depth: 18, width: 1, seg: [1, 4], golds: 3, knots: 6, time: 240, axe: 0.03 },
];

// Ten levels per chapter. From level 13 on, each chapter brings in one new thing, then later chapters mix them.
const CHAPTERS = ['The Woodpile', 'Amber', 'Powder Kegs', 'Iron', 'Growth', 'Fog', 'Dusk', 'Lumber Camp', 'Hardwoods', 'Ancient Forest'];
const LEVEL_NAMES = [
  'Resin', 'Honeycomb', 'Sap Line', 'Amberlight', 'Pitch Pine', 'Bee Tree', 'Golden Hour', 'Tapped Maple',
  'Powder Keg', 'Fuse', 'Blasting Cap', 'Quarry', 'Spark', 'Black Powder', 'Tinderbox', 'Firebreak', 'Cinder', 'Ember Run',
  'Iron Band', 'Rivet', 'Anvil', 'Hobnail', 'Forge', 'Strapwork', 'Ironbark', 'Bolt', 'Hinge', 'Wrought',
  'Sapling', 'New Growth', 'Spring Rings', 'Rising Sap', 'Shoot', 'Canopy', 'Overgrowth', 'Taproot', 'Bramble', 'Wildwood',
  'Mist', 'Fogbank', 'Hollow', 'Murk', 'Haze', 'Low Cloud', 'Drizzle', 'Pea Soup', 'Whiteout', 'Bog',
  'Dusk', 'Lantern', 'Firefly', 'Gloaming', 'Owl Light', 'Moonrise', 'Nightjar', 'Starlight', 'Midnight Oil', 'Witching Hour',
  'Cross Grain', 'Quarter Sawn', 'Rift', 'Burr Oak', 'Spalted', 'Flitch', 'Live Edge', 'Chainsaw', 'Lumberjack', 'Logjam',
  'Ironwood', 'Petrified', 'Bristlecone', 'Yew Hollow', 'Lignum', 'Greenheart', 'Hornbeam', 'Blackthorn', 'Hickory', 'Osage',
  'Redwood', 'Sequoia', 'Kauri', 'Baobab', 'Banyan', 'Methuselah', 'Ancient Ring', 'Heart of Oak', 'Crown', 'The Great Tree',
];
const INTROS = {
  13: 'Amber blocks add 8 seconds to the clock when their row clears.',
  21: 'Powder kegs blow out the rows above and below when their row clears.',
  31: 'Iron bands take two hits: the first two pieces to complete the row bounce off. Axes cut straight through.',
  41: 'The tree is growing: a new row pushes up from below every few seconds. Watch the green bar.',
  51: 'Fog: you can\'t see the next piece. Hold one to keep a spare.',
  61: 'Dusk: only the area around your piece is lit. Gold glows in the dark.',
  71: 'Everything you\'ve met so far, mixed together.',
};
for (let n = 13; n <= 100; n++) {
  let s = n * 7919; // small seeded random so the list is the same every launch
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const ch = Math.floor((n - 1) / 10), k = (n - 1) % 10, intro = !!INTROS[n] && n < 71, own = f => ch === f;
  const depth = Math.min(24, 9 + ch + Math.round(k * 0.6) + (k === 9 ? 1 : 0) - (intro ? 2 : 0));
  const L = {
    name: LEVEL_NAMES[n - 13], seed: 100 + n, depth,
    width: intro || r() > 0.35 + ch * 0.04 ? 2 : 1,
    seg: ch >= 7 || r() < 0.5 ? [1, 3] : [2, 4],
    golds: 1 + Math.floor(depth / 8),
    knots: intro ? 1 : Math.round(depth * (0.08 + ch * 0.025)),
    ambers: own(1) ? 1 + (k > 4) : 1 + Math.floor(r() * 2),
    kegs: n < 21 ? 0 : own(2) ? 1 + (k > 5) : Math.floor(r() * (ch >= 7 ? 3 : 2)),
    irons: n < 31 ? 0 : own(3) ? 1 + Math.floor(k / 3) : intro ? 0 : Math.min(4, Math.floor(r() * 3) + (ch >= 8)),
    grow: n < 41 ? 0 : own(4) ? Math.max(9, 16 - k) : !intro && r() < 0.3 + (ch - 5) * 0.1 ? Math.max(9, 17 - ch) : 0,
    fog: n >= 51 && (own(5) || (!intro && r() < 0.35)),
    dusk: n >= 61 && (own(6) || (!intro && r() < 0.35)),
    grav: +(0.8 - ch * 0.035).toFixed(3), minGrav: +(0.25 - ch * 0.012).toFixed(3), ghost: n < 91,
    tip: INTROS[n],
  };
  if (n === 100) Object.assign(L, { ambers: 2, kegs: 2, irons: 4, grow: 10, fog: false, dusk: true, tip: 'The last tree. Everything at once.' });
  L.axe = L.irons ? 0.045 : 0.03;
  const t = 60 + depth * 10 + L.knots * 4 + L.irons * 8 + (L.grow ? depth * 3 : 0) + (L.dusk ? 15 : 0);
  L.time = Math.round(t * Math.max(0.8, 1 - ch * 0.02) / 5) * 5;
  LEVELS.push(L);
}
