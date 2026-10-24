// Grainfall: board, pieces, modes, rewards and saved progress.
// Wood drawing lives in wood.js and the dig levels in levels.js.

const VTOP = 4, VBOT = 17; // pile shape on the full-size board; scaled for the half-size one
// Board size in blocks. Levels and Daily use the full 22 × 36; Classic and Zen use a half-size grid (11 × 18) so their blocks are drawn twice as big.
let COLS = 22, ROWS = 36;
// effects (popups, shake) are sized to the board, not the block, so they look the same at any block size
const fxUnit = () => COLS * cell / 22;
function setBoardSize(cols, rows) {
  if (cols === COLS && rows === ROWS) return;
  COLS = cols; ROWS = rows;
  resize();
}
const VARIANTS = 10, GOLD = 100, KNOT = 101, CRACKED = 102, AXE = 103, AMBER = 104, KEG = 105, IRON = 106; // grid cells: 0 empty, 1..VARIANTS plain wood
const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
};
const PIECES = Object.keys(SHAPES);
const shapeOf = key => key === 'AXE' ? [[1]] : SHAPES[key];

// Classic difficulty. Speeds are seconds per row: start at grav, ramp faster every 8 rows, floor at minGrav.
// gold / knot: chance a fresh row carries one; axe: chance a piece is an axe; low: rows of wood Classic starts with.
// Classic is endless and has no clock; time is the Daily board's clock (Daily plays by Normal).
const DIFFS = {
  easy:   { name: 'Easy',   time: 240, grav: 1.0,  ramp: 0.04, minGrav: 0.2,  ghost: true,  mult: 1,   gold: 0.1,  knot: 0.02, axe: 0.03,  low: 2, note: 'Slow pieces that speed up gently, landing guide.' },
  normal: { name: 'Normal', time: 180, grav: 0.75, ramp: 0.06, minGrav: 0.1,  ghost: true,  mult: 1.5, gold: 0.08, knot: 0.04, axe: 0.025, low: 3, note: 'Steady speed-up. Points ×1.5.' },
  hard:   { name: 'Hard',   time: 120, grav: 0.45, ramp: 0.07, minGrav: 0.05, ghost: false, mult: 2,   gold: 0.07, knot: 0.07, axe: 0.02,  low: 4, note: 'Fast pieces, more knots, no landing guide. Points ×2.' },
};
const ZEN = { timer: 0, grav: 1.1, ramp: 0, minGrav: 1.1, ghost: true, mult: 1, gold: 0.15, knot: 0, axe: 0.04, low: 2, refill: false, stackOutEnds: false };
const DRAG = { slow: 1.4, normal: 1, fast: 0.7 };

const $ = id => document.getElementById(id);
const boardC = $('board'), ctx = boardC.getContext('2d');
const nextC = $('next'), nctx = nextC.getContext('2d');
const holdC = $('hold'), hctx = holdC.getContext('2d');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- saved progress ----------
// The iPhone app injects window.__grainfallSave and stores writes natively; a browser falls back to localStorage.
const freshSave = () => ({
  v: 1, diff: 'normal', wood: 'maple', best: {}, stars: [], levelBest: [], top: {}, unlocked: 1, woodsSeen: ['maple'], tutorialDone: false,
  stats: { games: 0, rows: 0, tetrises: 0, bestCombo: 0, golds: 0, knots: 0, axes: 0 },
  daily: { last: '', streak: 0, bestStreak: 0, date: '', best: 0 },
  settings: { drag: 'normal', haptics: true, sound: true },
});
let SAVE = freshSave();
(function loadSave() {
  let saved = window.__grainfallSave;
  if (!saved) try { saved = JSON.parse(localStorage.getItem('grainfall-save')); } catch {}
  if (saved && typeof saved === 'object') {
    const d = freshSave();
    SAVE = { ...d, ...saved, stats: { ...d.stats, ...saved.stats }, daily: { ...d.daily, ...saved.daily }, settings: { ...d.settings, ...saved.settings } };
    // high-score lists came later: start each Classic list with the best score saved before them
    if (!saved.top) for (const k of Object.keys(DIFFS)) if (SAVE.best['classic-' + k]) SAVE.top['classic-' + k] = [{ s: SAVE.best['classic-' + k], d: '' }];
    return;
  }
  // carry over best scores kept before progress was saved as one record
  try {
    for (const k of Object.keys(DIFFS)) { const b = +localStorage.getItem('grainfall-best-' + k); if (b) SAVE.best['classic-' + k] = b; }
    const d = localStorage.getItem('grainfall-diff'); if (DIFFS[d]) SAVE.diff = d;
  } catch {}
})();
function persist() {
  const j = JSON.stringify(SAVE);
  try { window.webkit?.messageHandlers?.save?.postMessage(j); } catch {}
  try { localStorage.setItem('grainfall-save', j); } catch {}
}

// ---------- dates and seeds (daily board) ----------
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => ymd(new Date());
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); };
const seedOf = str => { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// ---------- game state ----------
let grid, piece, nextKey, bag = [], score = 0, timeLeft = 0, state = 'menu', dropAcc = 0, lockT = 0, lockResets = 0, clearT = 0;
let particles = [], popups = [], flashes = [], shakeT = 0, shakeAmp = 0, clearRows = [];
let holdKey = null, canHold = true, combo = -1, b2b = false, lines = 0, growT = 0;
let mode = 'classic', levelIdx = -1;
let R = { ...DIFFS.normal, timer: 180, refill: true, stackOutEnds: true }; // rules for the current game
let shaft; // crack generator: column, width and rows left in the current straight run
let cell = 20, dpr = 1, sprites = [], special = {}, bgCanvas;
let rng = Math.random; // seeded for daily and level boards
const rnd = n => Math.floor(rng() * n);
const randV = () => 1 + Math.floor(Math.random() * VARIANTS); // cosmetic, so it never shifts a seeded board
const spriteOf = v => v <= VARIANTS ? sprites[v - 1] : special[v];

// ---------- board generation ----------
function genRow() {
  const mid = COLS >> 1, w = shaft.width;
  if (shaft.seg <= 0) {
    shaft.seg = shaft.min + rnd(shaft.max - shaft.min + 1);
    shaft.c = Math.max(mid - 2, Math.min(mid + 3 - w, shaft.c + rnd(5) - 2));
  }
  shaft.seg--;
  const row = Array.from({ length: COLS }, randV);
  for (let k = 0; k < w; k++) row[shaft.c + k] = 0;
  if (R.gold && rng() < R.gold) placeIn(row, GOLD);
  if (R.knot && rng() < R.knot) placeIn(row, KNOT);
  return row;
}
// set a special block on a random plain cell of the row
function placeIn(row, v) {
  const plain = [];
  row.forEach((x, i) => x && x <= VARIANTS && plain.push(i));
  if (plain.length) row[plain[rnd(plain.length)]] = v;
}
// A V-shaped pile from top (VTOP unless given) down to crackTop, then packed rows with a winding crack to the bottom.
function buildBoard(crackTop, width, seg, top = VTOP) {
  grid = [];
  shaft = { c: (COLS >> 1) - (width > 1 ? 1 : 0), seg: 0, width, min: seg[0], max: seg[1] };
  const vtop = Math.round(top * ROWS / 36);
  for (let r = 0; r < vtop; r++) grid.push(new Array(COLS).fill(0));
  let wl = 1, wr = 1;
  const maxW = (COLS - Math.round(COLS * 6 / 22)) >> 1; // leaves an opening at the bottom of the V: 6 wide, or 4 on the half-size board
  for (let r = vtop; r < crackTop; r++) {
    const t = (r - vtop) / Math.max(1, crackTop - 1 - vtop);
    const base = 1 + t * (maxW - 1);
    wl = Math.min(maxW, Math.max(wl, Math.round(base + rng() * 1.6 - 0.8)));
    wr = Math.min(maxW, Math.max(wr, Math.round(base + rng() * 1.6 - 0.8)));
    if (r === crackTop - 1) wl = wr = maxW;
    const row = new Array(COLS).fill(0);
    for (let c = 0; c < wl; c++) row[c] = randV();
    for (let c = 0; c < wr; c++) row[COLS - 1 - c] = randV();
    grid.push(row);
  }
  for (let r = crackTop; r < ROWS; r++) grid.push(genRow());
}
// Classic and Zen start from the floor: a few low rows of wood, each with gaps to fill.
function lowBoard(n) {
  grid = [];
  for (let r = 0; r < ROWS - n; r++) grid.push(new Array(COLS).fill(0));
  for (let k = 0; k < n; k++) grid.push(lowRow());
}
function lowRow() {
  const row = Array.from({ length: COLS }, randV);
  for (let h = COLS / 11 + rnd(2); h > 0; h--) row[rnd(COLS)] = 0; // 1-2 gaps on Classic's narrow board, 2-3 on the wide one
  if (R.gold && rng() < R.gold * 2) placeIn(row, GOLD);
  if (R.knot && rng() < R.knot * 2) placeIn(row, KNOT);
  return row;
}
function levelBoard(L) {
  const crackTop = ROWS - 2 - L.depth, deepest = crackTop + L.depth - 1;
  buildBoard(crackTop, L.width, L.seg);
  const goldRows = [deepest];
  for (let i = 1; i < L.golds; i++) goldRows.push(crackTop + Math.round((L.depth - 1) * i / L.golds));
  goldRows.forEach(r => placeIn(grid[r], GOLD));
  const free = [];
  for (let r = crackTop; r <= deepest; r++) if (!goldRows.includes(r)) free.push(r);
  for (let k = 0; k < L.knots && free.length; k++) placeIn(grid[free.splice(rnd(free.length), 1)[0]], KNOT);
  // later blocks go in rows that are still plain, then double up once those run out
  for (const [v, n] of [[IRON, L.irons], [KEG, L.kegs], [AMBER, L.ambers]]) for (let k = 0; k < (n || 0); k++) {
    const plain = free.filter(r => grid[r].every(x => x <= VARIANTS)), pool = plain.length ? plain : free;
    placeIn(grid[pool[rnd(pool.length)]], v);
  }
}
const countCells = v => grid.reduce((a, row) => a + row.filter(x => x === v).length, 0);

// ---------- pieces ----------
function takeKey() {
  if (R.axe && rng() < R.axe) return 'AXE';
  if (!bag.length) { bag = PIECES.slice(); for (let i = bag.length - 1; i > 0; i--) { const j = rnd(i + 1); [bag[i], bag[j]] = [bag[j], bag[i]]; } }
  return bag.pop();
}
const rotate = (m, dir) => m.map((row, i) => row.map((_, j) => dir > 0 ? m[m.length - 1 - j][i] : m[j][m.length - 1 - i]));
function collide(m, x, y) {
  for (let i = 0; i < m.length; i++) for (let j = 0; j < m.length; j++) {
    if (!m[i][j]) continue;
    const gx = x + j, gy = y + i;
    if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
    if (gy >= 0 && grid[gy][gx]) return true;
  }
  return false;
}
function spawn(key) {
  if (!key) { key = nextKey; nextKey = takeKey(); }
  const m = shapeOf(key).map(r => r.slice());
  piece = { key, m, v: key === 'AXE' ? AXE : randV(), x: (COLS - m.length) >> 1, y: 0 };
  dropAcc = 0; lockT = 0; lockResets = 0; canHold = true;
  drawNext();
  if (collide(piece.m, piece.x, piece.y)) R.stackOutEnds ? finish('stacked') : zenReset();
}
function tryMove(dx, dy) {
  if (!piece || collide(piece.m, piece.x + dx, piece.y + dy)) return false;
  piece.x += dx; piece.y += dy;
  if (dx && lockResets < 15) { lockT = 0; lockResets++; }
  return true;
}
function tryRotate(dir) {
  if (!piece) return;
  const m = rotate(piece.m, dir);
  for (const k of [0, -1, 1, -2, 2]) {
    if (!collide(m, piece.x + k, piece.y)) {
      piece.m = m; piece.x += k;
      if (lockResets < 15) { lockT = 0; lockResets++; }
      sfx(0.25, 1.6); tut('rotate');
      return;
    }
  }
}
// swap the falling piece into the hold tray (once per piece)
function holdPiece() {
  if (state !== 'play' || !piece || !canHold) return;
  const cur = piece.key;
  spawn(holdKey || undefined);
  holdKey = cur; canHold = false;
  sfx(0.3, 0.7); haptic('light');
  drawNext();
}
const landingY = () => { let y = piece.y; while (!collide(piece.m, piece.x, y + 1)) y++; return y; };
function hardDrop() {
  if (!piece) return;
  const y = landingY();
  score += (y - piece.y);
  piece.y = y;
  tut('drop');
  lock();
}
function lock() {
  const { m, x, y, v } = piece;
  const cells = [];
  for (let i = 0; i < m.length; i++) for (let j = 0; j < m.length; j++)
    if (m[i][j] && y + i >= 0) { grid[y + i][x + j] = v; cells.push([y + i, x + j]); }
  piece = null;
  if (v === AXE) {
    // the axe splits the row it lands on and the two below
    const rows = [y, y + 1, y + 2].filter(r => r >= 0 && r < ROWS);
    SAVE.stats.axes++;
    axeSound(); haptic('heavy');
    clearRowsNow(rows, true);
    return;
  }
  const full = [];
  grid.forEach((row, r) => row.every(Boolean) && full.push(r));
  if (!full.length) { combo = -1; sfx(0.5, 1); haptic('soft'); spawn(); return; }
  if (full.some(r => grid[r].some(v => v === KNOT || v === IRON))) { bounce(cells, full); return; }
  clearRowsNow(full, false);
}
// A knot in a completed row cracks and throws the piece off; the row has to be completed again.
// Iron takes one more hit: it turns into a knot first.
function bounce(cells, full) {
  const iron = full.some(r => grid[r].includes(IRON));
  full.forEach(r => { grid[r] = grid[r].map(v => v === KNOT ? CRACKED : v === IRON ? KNOT : v); });
  if (!reduceMotion) for (const [r, c] of cells) particles.push({
    v: grid[r][c] || 1, x: (c + 0.5) * cell, y: (r + 0.5) * cell,
    vx: (Math.random() - 0.5) * 16 * cell, vy: -(10 + Math.random() * 10) * cell,
    a: Math.random() * 6.28, va: (Math.random() - 0.5) * 18, s: 0.9,
  });
  for (const [r, c] of cells) grid[r][c] = 0;
  combo = -1;
  const y = (full[0] + 0.5) * cell;
  popups.push({ text: iron ? 'Clang!' : 'Knot!', size: 1.7, color: iron ? '#dfe6ec' : '#ffcf9a', x: COLS * cell / 2, y, t: 0, life: 1.1 });
  if (iron) chime(1760, 0, 0.12, 0.4);
  popups.push({ text: 'Fill it again', size: 1.0, color: '#fff1d6', x: COLS * cell / 2, y: y + fxUnit() * 1.8, t: -0.08, life: 1.1 });
  shakeT = reduceMotion ? 0 : 0.2; shakeAmp = fxUnit() * 0.2;
  thunk(); haptic('warning');
  spawn();
}
function clearRowsNow(full, axe) {
  const n = Math.min(4, full.length), tetris = !axe && n === 4, b2bHit = tetris && b2b;
  // powder kegs also blow out the rows above and below, and set off any kegs there
  const rows = new Set(full);
  let kegs = 0;
  for (let grew = true; grew;) {
    grew = false;
    for (const r of [...rows]) if (grid[r].includes(KEG)) for (const d of [-1, 1])
      if (grid[r + d]?.some(Boolean) && !rows.has(r + d)) { rows.add(r + d); grew = true; }
  }
  full = [...rows].sort((a, b) => a - b);
  let ambers = 0;
  for (const r of full) for (const v of grid[r]) { if (v === KEG) kegs++; if (v === AMBER) ambers++; }
  if (kegs) blast(full, kegs);
  if (ambers && R.timer) amberBonus(full, ambers);
  combo++;
  if (!axe) b2b = tetris;
  let golds = 0, knots = 0;
  for (const r of full) for (const v of grid[r]) { if (v === GOLD) golds++; if (v === KNOT || v === CRACKED || v === IRON) knots++; }
  let pts = axe ? 300 : [0, 100, 300, 500, 800][n];
  if (b2bHit) pts *= 1.5;
  pts = Math.round((pts + 50 * combo + golds * 250 + kegs * 150) * R.mult);
  const g0 = gravity();
  score += pts; lines += full.length;
  if (mode === 'classic' && gravity() < g0) // pieces just got faster
    popups.push({ text: 'Faster!', size: 1.3, color: '#ffb35c', x: COLS * cell / 2, y: fxUnit() * 6, t: 0.3, life: 1.2 });
  const st = SAVE.stats;
  st.rows += full.length; st.golds += golds; st.knots += knots;
  if (tetris) st.tetrises++;
  st.bestCombo = Math.max(st.bestCombo, combo + 1);
  if (R.timer) timeLeft += full.length * 2 + (tetris ? 5 : 0) + Math.min(combo, 5);
  celebrate(n, pts, b2bHit, full, golds, axe);
  burst(full, tetris ? 2 : 1);
  full.forEach(r => grid[r].fill(0)); // dark band while cubes fly
  state = 'clearing'; clearT = 0;
  clearRows = full;
  tut('clear');
}
function blast(rows, kegs) {
  const y = (rows[0] + 0.5) * cell;
  popups.push({ text: kegs > 1 ? `Boom ×${kegs}!` : 'Boom!', size: 2.1, color: '#ff9d4a', x: COLS * cell / 2, y: y - cell * 2, t: 0, life: 1.3 });
  if (!reduceMotion) { shakeT = 0.5; shakeAmp = fxUnit() * 0.5; }
  thunk(); knock(70, 0.9); knock(110, 0.6, 0.05); haptic('heavy');
}
function amberBonus(rows, n) {
  timeLeft += n * 8;
  popups.push({ text: `+${n * 8} s`, size: 1.8, color: '#ffc04a', x: COLS * cell / 2, y: (rows[rows.length - 1] + 2.5) * cell, t: 0, life: 1.3 });
  chime(1175, 0.05, 0.14, 0.8); chime(1568, 0.15, 0.12, 0.9);
}
// Growth: a new crack row pushes the whole board up from below.
function grow() {
  if (grid[0].some(Boolean)) { finish('stacked'); return; }
  grid.shift(); grid.push(genRow());
  if (piece && collide(piece.m, piece.x, piece.y)) piece.y--;
  if (piece && collide(piece.m, piece.x, piece.y)) { finish('stacked'); return; }
  knock(95, 0.35); haptic('soft');
}
function finishClear() {
  for (const r of clearRows.slice().sort((a, b) => b - a)) grid.splice(r, 1);
  // endless modes: the board rises from below with fresh crack rows; levels: rows above fall in, so you dig down
  for (let k = 0; k < clearRows.length; k++) R.refill ? grid.push(genRow()) : grid.unshift(new Array(COLS).fill(0));
  state = 'play';
  if (mode === 'level' && !countCells(GOLD)) { finish('won'); return; }
  // Zen: a cleared board gets a fresh low layer so there's always something to fill
  if (mode === 'zen' && !grid.some(r => r.some(Boolean))) {
    grid.splice(0, R.low);
    for (let k = 0; k < R.low; k++) grid.push(lowRow());
    popups.push({ text: 'Fresh layer', size: 1.5, color: '#fff1d6', x: COLS * cell / 2, y: ROWS * cell * 0.6, t: 0, life: 1.6 });
    chime(392, 0, 0.15, 1.2); chime(523, 0.15, 0.13, 1.2);
  }
  spawn();
}
// Zen never ends: a stacked-out board blows away and a fresh one is laid down.
function zenReset() {
  piece = null;
  if (!reduceMotion) for (let r = 0; r < ROWS / 2; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] && Math.random() < 0.5)
    particles.push({ v: grid[r][c], x: (c + 0.5) * cell, y: (r + 0.5) * cell, vx: (Math.random() - 0.5) * 20 * cell, vy: -(8 + Math.random() * 14) * cell, a: 0, va: (Math.random() - 0.5) * 12, s: 0.85 });
  lowBoard(R.low);
  popups.push({ text: 'Fresh boards', size: 1.6, color: '#fff1d6', x: COLS * cell / 2, y: ROWS * cell * 0.3, t: 0, life: 1.6 });
  chime(262, 0, 0.18, 1.2); chime(392, 0.15, 0.15, 1.2);
  spawn();
}

// ---------- particles and rewards ----------
function burst(rows, power = 1) {
  if (reduceMotion) return;
  const cx = COLS / 2;
  for (const r of rows) for (let c = 0; c < COLS; c++) {
    const v = grid[r][c] || 1;
    for (let k = 0; k < power; k++) {
      const side = c + 0.5 - cx;
      const dir = Math.sign(side) || (Math.random() < .5 ? -1 : 1);
      particles.push({
        v, x: (c + 0.5) * cell, y: (r + 0.5) * cell,
        vx: (side * 0.6 + dir * (2 + Math.random() * 7)) * cell,
        vy: -(14 + Math.random() * 16) * cell * (0.8 + power * 0.2),
        a: Math.random() * 6.28, va: (Math.random() - .5) * 18,
        s: 0.7 + Math.random() * 0.35,
      });
    }
    if (v === GOLD) for (let k = 0; k < 14; k++) particles.push({
      spark: true, x: (c + 0.5) * cell, y: (r + 0.5) * cell,
      vx: (Math.random() - 0.5) * 24 * cell, vy: -(10 + Math.random() * 22) * cell,
      a: Math.random() * 6.28, va: (Math.random() - .5) * 20, s: 0.2 + Math.random() * 0.25,
    });
  }
  const n = rows.length * 6;
  for (let k = 0; k < n; k++) setTimeout(() => sfx(0.18 + Math.random() * 0.2, 0.8 + Math.random() * 1.2), k * 18 + Math.random() * 40);
}
function stepParticles(dt) {
  const g = 55 * cell;
  for (const p of particles) { p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt; }
  particles = particles.filter(p => p.y < boardC.height / dpr + cell * 2);
}
// floating words, golden row flash, shake, marimba chimes, haptics
const LABELS = ['', 'Single', 'Double', 'Triple', 'TETRIS!'];
function celebrate(n, pts, b2bHit, rows, golds, axe) {
  const y = (rows.reduce((a, r) => a + r, 0) / rows.length + 0.5) * cell;
  const big = n === 4 && !axe, zen = mode === 'zen';
  const out = [];
  if (axe) out.push({ text: 'Axe!', size: 1.9, color: '#eef3f6' });
  else if (n >= 2) out.push({ text: LABELS[n], size: big ? 2.6 : 1.6, color: big ? '#ffd24a' : '#fff1d6' });
  if (golds) out.push({ text: golds > 1 ? `Gold ×${golds}!` : 'Gold!', size: 1.6, color: '#ffd24a' });
  if (b2bHit) out.push({ text: 'Back-to-back!', size: 1.2, color: '#ffb35c' });
  if (combo >= 1) out.push({ text: `Combo ×${combo + 1}`, size: 1.3 + Math.min(combo, 5) * 0.12, color: '#ffe08a' });
  out.push({ text: `+${pts}`, size: 1.5, color: '#fff1d6' });
  out.forEach((l, i) => popups.push({ ...l, x: COLS * cell / 2, y: y + (i - (out.length - 1) / 2) * fxUnit() * 1.9, t: -i * 0.07, life: big ? 1.6 : 1.2 }));
  rows.forEach(r => flashes.push({ r, t: 0, gold: big || golds > 0 || combo >= 2 }));
  if (!reduceMotion && !zen && (big || axe || combo >= 2)) { shakeT = big ? 0.45 : 0.25; shakeAmp = fxUnit() * (big ? 0.45 : 0.18); }
  // chimes: one note per row cleared, climbing with the combo; a Tetris gets a full arpeggio. Zen is lower and softer.
  const root = (zen ? 262 : 392) * Math.pow(2, Math.min(combo, 8) * 2 / 12), vol = zen ? 0.6 : 1;
  const steps = big ? [0, 4, 7, 12, 16] : zen ? [0, 7, 12].slice(0, Math.max(1, n)) : [0, 4, 7].slice(0, Math.max(1, n));
  steps.forEach((st, i) => chime(root * Math.pow(2, st / 12), i * (big ? 0.09 : 0.07), (big ? 0.32 : 0.22) * vol));
  if (big) chime(root * 2, 0.5, 0.25, 1.2);
  if (b2bHit) chime(root * 3, 0.6, 0.2, 1);
  if (golds) { chime(1568, 0.12, 0.16, 0.9); chime(2093, 0.22, 0.14, 1.1); }
  haptic(big || golds ? 'success' : combo >= 2 || axe ? 'heavy' : n >= 2 ? 'medium' : 'light');
}
function stepFx(dt) {
  for (const p of popups) p.t += dt;
  popups = popups.filter(p => p.t < p.life);
  for (const f of flashes) f.t += dt;
  flashes = flashes.filter(f => f.t < 0.5);
  shakeT = Math.max(0, shakeT - dt);
}
function drawFx() {
  for (const f of flashes) {
    const a = (1 - f.t / 0.5) * (f.gold ? 0.75 : 0.45);
    ctx.fillStyle = f.gold ? `rgba(255,205,90,${a})` : `rgba(255,236,200,${a})`;
    ctx.fillRect(0, f.r * cell, COLS * cell, cell);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of popups) {
    if (p.t < 0) continue;
    const pop = p.t < 0.15 ? 0.5 + (p.t / 0.15) * 0.7 : p.t < 0.25 ? 1.2 - (p.t - 0.15) * 2 : 1;
    const size = fxUnit() * p.size * pop;
    ctx.globalAlpha = Math.min(1, (p.life - p.t) / 0.35);
    ctx.font = `${size}px "Lilita One", "Arial Rounded MT Bold", sans-serif`;
    ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.18; ctx.strokeStyle = '#4a1d06';
    const y = p.y - p.t * fxUnit() * 1.6;
    ctx.strokeText(p.text, p.x, y);
    ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, y);
  }
  ctx.globalAlpha = 1;
}

// ---------- rendering ----------
function buildSprites() {
  const wood = WOODS[SAVE.wood] || WOODS.maple;
  sprites = Array.from({ length: VARIANTS }, () => makeSprite(cell, wood));
  special = { [GOLD]: makeSprite(cell, wood, 'gold'), [KNOT]: makeSprite(cell, wood, 'knot'), [CRACKED]: makeSprite(cell, wood, 'cracked'), [AXE]: makeSprite(cell, WOODS.oak, 'axe'),
    [AMBER]: makeSprite(cell, wood, 'amber'), [KEG]: makeSprite(cell, wood, 'keg'), [IRON]: makeSprite(cell, wood, 'iron') };
}
function makeBg() {
  const W = COLS * cell, H = ROWS * cell;
  const c = document.createElement('canvas');
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  woodPlanks(g, W, H, W / 22, 30);
  const vg = g.createLinearGradient(0, 0, 0, H * 0.25);
  vg.addColorStop(0, 'rgba(15,5,0,.6)'); vg.addColorStop(1, 'rgba(15,5,0,0)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H * 0.25);
  return c;
}
// Page behind the cabinet: wider, darker planks, painted once as the body background.
function paintPageWood() {
  const W = innerWidth, H = innerHeight + 200;
  const c = document.createElement('canvas');
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  woodPlanks(g, W, H, Math.max(44, W / 7), 16);
  document.body.style.backgroundImage = `url(${c.toDataURL('image/jpeg', 0.85)})`;
  document.body.style.backgroundSize = `${W}px ${H}px`;
}
function resize() {
  const bar = $('bar').offsetHeight + 6, hud = $('hud').offsetHeight + 3;
  const app = $('app');
  cell = Math.max(8, Math.floor(Math.min(app.clientWidth / COLS, (app.clientHeight - bar - hud - 4) / ROWS) * 4) / 4);
  dpr = Math.min(3, devicePixelRatio || 1);
  const W = COLS * cell, H = ROWS * cell;
  boardC.width = W * dpr; boardC.height = H * dpr;
  boardC.style.width = W + 'px'; boardC.style.height = H + 'px';
  $('cab').style.width = W + 'px';
  const ns = Math.round(Math.min(14, cell * 0.8));
  for (const c of [nextC, holdC]) {
    c.width = ns * 4 * dpr; c.height = ns * 2 * dpr;
    c.style.width = ns * 4 + 'px'; c.style.height = ns * 2 + 'px';
  }
  nextC.dataset.s = ns;
  buildSprites();
  bgCanvas = makeBg();
  paintPageWood();
  drawLogo();
  drawNext();
}
// Title wordmark: maple-grain letters, dark carved edge and extrusion; the "i" is dotted with a falling cube.
function drawLogo() {
  const c = $('logo');
  const W = Math.min(340, $('wrap').clientWidth - 24), H = Math.round(W * 0.4);
  c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px';
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const parts = ['Gra', 'ı', 'nfall']; // dotless i: the cube is its dot
  let size = H * 0.62;
  const setFont = () => g.font = `${size}px "Lilita One", "Arial Rounded MT Bold", sans-serif`;
  setFont();
  const fit = W * 0.92 / g.measureText(parts.join('')).width;
  if (fit < 1) { size *= fit; setFont(); }
  const total = g.measureText(parts.join('')).width;
  const x0 = (W - total) / 2, base = H * 0.9;
  const tex = document.createElement('canvas');
  tex.width = W * dpr; tex.height = H * dpr;
  const t = tex.getContext('2d');
  t.setTransform(dpr, 0, 0, dpr, 0, 0);
  t.save(); t.translate(W, 0); t.rotate(Math.PI / 2); woodPlanks(t, H, W, H * 0.5, 64); t.restore();
  t.globalCompositeOperation = 'destination-in';
  t.font = g.font; t.textBaseline = 'alphabetic';
  t.fillText(parts.join(''), x0, base);
  t.globalCompositeOperation = 'source-atop';
  const lg = t.createLinearGradient(0, base - size * 0.75, 0, base);
  lg.addColorStop(0, 'rgba(255,240,215,.35)'); lg.addColorStop(0.5, 'rgba(255,240,215,0)'); lg.addColorStop(1, 'rgba(90,40,8,.35)');
  t.fillStyle = lg; t.fillRect(0, 0, W, H);
  g.lineJoin = 'round';
  g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = size * 0.18; g.shadowOffsetY = size * 0.08;
  g.fillStyle = '#3a1404';
  for (let d = size * 0.09; d > 0; d -= 1) g.fillText(parts.join(''), x0, base + d);
  g.shadowColor = 'transparent';
  g.lineWidth = size * 0.13; g.strokeStyle = '#3a1404';
  g.strokeText(parts.join(''), x0, base);
  g.drawImage(tex, 0, 0, W, H);
  const ix = x0 + g.measureText(parts[0]).width + g.measureText(parts[1]).width / 2;
  const cs = size * 0.3, cy = base - size * 0.8;
  for (let k = 0; k < 7; k++) {
    const z = cs * (0.1 + Math.random() * 0.12);
    g.fillStyle = `hsla(30 65% ${65 + Math.random() * 15}% / ${0.5 + Math.random() * 0.4})`;
    g.fillRect(ix + (Math.random() - 0.5) * cs * 1.6, cy - cs * (0.7 + Math.random() * 0.8), z, z);
  }
  g.save();
  g.translate(ix, cy); g.rotate(-0.22);
  g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = cs * 0.4; g.shadowOffsetY = cs * 0.15;
  g.drawImage(sprites[3], -cs / 2, -cs / 2, cs, cs);
  g.restore();
}
function drawNext() {
  const fog = R.fog && state !== 'menu';
  drawMini(nctx, fog ? null : nextKey);
  if (fog) {
    const s = +nextC.dataset.s;
    nctx.fillStyle = 'rgba(255,241,214,.55)'; nctx.font = `${s * 1.6}px "Lilita One", sans-serif`;
    nctx.textAlign = 'center'; nctx.textBaseline = 'middle'; nctx.fillText('?', s * 2, s * 1.05);
  }
  drawMini(hctx, holdKey);
  $('holdTray').classList.toggle('used', !canHold);
}
function drawMini(g, key) {
  const s = +nextC.dataset.s;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, s * 4, s * 2);
  if (!key) return;
  const m = shapeOf(key).filter(r => r.some(Boolean));
  const firsts = m.map(r => r.indexOf(1)).filter(i => i >= 0);
  const minJ = Math.min(...firsts), w = Math.max(...m.map(r => r.lastIndexOf(1) + 1)) - minJ;
  const ox = (4 - w) * s / 2, oy = (2 - m.length) * s / 2;
  const img = key === 'AXE' ? special[AXE] : sprites[0];
  m.forEach((row, i) => row.forEach((v, j) => v && g.drawImage(img, ox + (j - minJ) * s, oy + i * s, s, s)));
}
// Dusk: darkness over the board with a lantern on the falling piece, a dimmer one where it will land, and gold glinting.
let duskC, light = { x: 0, y: 0 };
function drawDusk(W, H) {
  if (!duskC || duskC.width !== boardC.width) { duskC = document.createElement('canvas'); duskC.width = boardC.width; duskC.height = boardC.height; }
  const g = duskC.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(6,2,0,.9)'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, a = 1) => {
    const rg = g.createRadialGradient(x, y, r * 0.35, x, y, r);
    rg.addColorStop(0, `rgba(0,0,0,${a})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  if (piece) { // the lantern eases after the piece rather than snapping
    const n = piece.m.length / 2;
    light.x += ((piece.x + n) * cell - light.x) * 0.3; light.y += ((piece.y + n) * cell - light.y) * 0.3;
    hole(light.x, (landingY() + n) * cell, cell * 3.2, 0.7);
  }
  hole(light.x, light.y, cell * 5);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] === GOLD) hole((c + 0.5) * cell, (r + 0.5) * cell, cell * 1.4, 0.9);
  ctx.drawImage(duskC, 0, 0, W, H);
}
function draw() {
  const W = COLS * cell, H = ROWS * cell;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (shakeT > 0) { const k = shakeAmp * (shakeT / 0.45); ctx.translate((Math.random() - 0.5) * k * 2, (Math.random() - 0.5) * k * 2); }
  ctx.drawImage(bgCanvas, 0, 0, W, H);
  // drop lane: darkened columns under the falling piece, like a shadow down the planks
  if (piece) {
    const ly = landingY();
    ctx.fillStyle = 'rgba(15,5,0,.28)';
    const m = piece.m;
    for (let j = 0; j < m.length; j++) {
      let bottom = -1;
      for (let i = 0; i < m.length; i++) if (m[i][j]) bottom = i;
      if (bottom < 0) continue;
      const top = piece.y + bottom + 1, end = ly + bottom + 1;
      if (end > top) ctx.fillRect((piece.x + j) * cell, top * cell, cell, (end - top) * cell);
    }
    if (R.ghost) {
      ctx.globalAlpha = 0.28;
      for (let i = 0; i < m.length; i++) for (let j = 0; j < m.length; j++)
        if (m[i][j]) ctx.drawImage(spriteOf(piece.v), (piece.x + j) * cell, (ly + i) * cell, cell, cell);
      ctx.globalAlpha = 1;
    }
  }
  const glow = 0.3 + 0.2 * Math.sin(performance.now() / 260);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const v = grid[r][c];
    if (!v) continue;
    ctx.drawImage(spriteOf(v), c * cell, r * cell, cell, cell);
    if (v === GOLD) { // gold shimmers so it stands out in the pile
      ctx.fillStyle = `rgba(255,220,90,${glow})`;
      ctx.fillRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2);
      ctx.strokeStyle = `rgba(255,236,150,${glow + 0.3})`; ctx.lineWidth = 1.5;
      ctx.strokeRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2);
    }
  }
  if (piece) {
    const { m, x, y } = piece;
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = cell * 0.5; ctx.shadowOffsetY = cell * 0.15;
    for (let i = 0; i < m.length; i++) for (let j = 0; j < m.length; j++)
      if (m[i][j] && y + i >= 0) ctx.drawImage(spriteOf(piece.v), (x + j) * cell, (y + i) * cell, cell, cell);
    ctx.shadowColor = 'transparent';
  }
  if (R.dusk && state !== 'menu') drawDusk(W, H);
  if (mode === 'level' && state !== 'menu') { // gold still to dig out, top left of the board
    const s = cell * 1.3, left = countCells(GOLD);
    ctx.fillStyle = 'rgba(20,8,0,.55)'; ctx.beginPath(); ctx.roundRect(4, 4, s * 2.9, s + 6, 6); ctx.fill();
    ctx.drawImage(special[GOLD], 7, 7, s, s);
    ctx.fillStyle = '#ffd24a'; ctx.font = `${s * 0.8}px "Lilita One", sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`× ${left}`, 11 + s, 7 + s / 2);
  }
  if (R.grow && state !== 'menu') { // growth meter along the bottom edge
    ctx.fillStyle = 'rgba(20,10,0,.5)'; ctx.fillRect(0, H - 4, W, 4);
    ctx.fillStyle = growT > R.grow - 1.5 ? '#c6f07a' : '#7fbf4a'; ctx.fillRect(0, H - 4, W * growT / R.grow, 4);
  }
  for (const p of particles) {
    const s = cell * p.s;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
    if (p.spark) { ctx.fillStyle = 'rgba(255,214,90,.95)'; ctx.fillRect(-s / 2, -s / 2, s, s); }
    else ctx.drawImage(spriteOf(p.v), -s / 2, -s / 2, s, s);
    ctx.restore();
  }
  drawFx();
}

// ---------- sound: modal wood knocks and marimba chimes ----------
let actx, noise, sfxBus, musBus; // effects and music each go through their own volume control
// slider settings are 0..1; squared so the slider feels even to the ear
const volume = k => (k === 'music' ? SAVE.settings.musicVol ?? 0.7 : SAVE.settings.sfxVol ?? 1) ** 2;
function applyVolumes() {
  if (!actx) return;
  sfxBus.gain.value = volume('sfx'); musBus.gain.value = volume('music');
}
const soundOn = () => SAVE.settings.sound;
// a struck block of wood: a few inharmonic partials that die fast, plus a tiny click
function knock(freq, vol, delay = 0) {
  if (!soundOn() || !actx) return;
  const t = actx.currentTime + delay;
  for (const [mul, amp, len] of [[1, 1, 0.16], [2.57, 0.45, 0.07], [4.1, 0.22, 0.04]]) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = freq * mul;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * amp * 0.5, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(sfxBus);
    o.start(t); o.stop(t + len + 0.02);
  }
  const src = actx.createBufferSource(); src.buffer = noise;
  const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq * 5; bp.Q.value = 3;
  const g = actx.createGain();
  g.gain.setValueAtTime(vol * 0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
  src.connect(bp).connect(g).connect(sfxBus);
  src.start(t); src.stop(t + 0.03);
}
const sfx = (vol, pitch) => knock(420 * pitch, vol * (mode === 'zen' ? 0.6 : 1));
const thunk = () => { knock(130, 0.9); knock(196, 0.5, 0.03); };
function axeSound() {
  if (!soundOn() || !actx) return;
  const t = actx.currentTime;
  const src = actx.createBufferSource(); src.buffer = noise;
  const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
  const g = actx.createGain();
  g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  src.connect(hp).connect(g).connect(sfxBus);
  src.start(t); src.stop(t + 0.1);
  knock(260, 1, 0.02); knock(180, 0.7, 0.07);
}
// marimba-ish note: sine with a quiet 4th harmonic, quick decay
function chime(freq, delay = 0, vol = 0.25, len = 0.6) {
  if (!soundOn() || !actx) return;
  const t = actx.currentTime + delay;
  for (const [mul, v] of [[1, 1], [4, 0.18]]) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = freq * mul;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len * (mul === 1 ? 1 : 0.3));
    o.connect(g).connect(sfxBus);
    o.start(t); o.stop(t + len + 0.05);
  }
}
function initAudio() {
  if (actx) { actx.resume?.(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    sfxBus = actx.createGain(); sfxBus.connect(actx.destination);
    musBus = actx.createGain(); musBus.connect(actx.destination);
    applyVolumes();
    noise = actx.createBuffer(1, actx.sampleRate * 0.1, actx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  } catch { actx = null; }
}
// native iPhone haptics via the app's "haptic" message handler; no-op in a browser
const haptic = kind => { if (!SAVE.settings.haptics) return; try { window.webkit?.messageHandlers?.haptic?.postMessage(kind); } catch {} };

// ---------- tutorial and banner notes ----------
const TUT = [
  { key: 'move', text: 'Drag left or right to slide the piece.' },
  { key: 'rotate', text: 'Tap the board to turn it.' },
  { key: 'drop', text: 'Flick down, or press Drop, to send it down.' },
  { key: 'clear', text: 'Fill the gaps to complete rows. Full rows break apart.' },
];
let tutStep = -1, bannerTimer;
function showBanner(text, skippable) {
  $('tutT').textContent = text || '';
  $('tutSkip').hidden = !skippable;
  $('tut').hidden = !text;
}
function startTut() { tutStep = 0; showBanner(TUT[0].text, true); }
function tut(ev) {
  if (tutStep < 0 || TUT[tutStep].key !== ev) return;
  tutStep++;
  if (tutStep === TUT.length) { endTut(); return; }
  showBanner(TUT[tutStep].text, true);
  if (TUT[tutStep].key === 'clear') { clearTimeout(bannerTimer); bannerTimer = setTimeout(() => tut('clear'), 7000); }
}
function endTut() { tutStep = -1; SAVE.tutorialDone = true; persist(); clearTimeout(bannerTimer); showBanner(''); }
function note(text, ms = 4000) {
  if (tutStep >= 0) return;
  showBanner(text, false);
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => tutStep < 0 && showBanner(''), ms);
}

// ---------- progress: daily streak, stars, wood unlocks ----------
function recordDaily(sc) {
  const d = SAVE.daily, t = today();
  if (d.last !== t) { d.streak = d.last === yesterday() ? d.streak + 1 : 1; d.last = t; }
  d.bestStreak = Math.max(d.bestStreak, d.streak);
  if (d.date !== t) { d.date = t; d.best = 0; }
  const isBest = sc > d.best;
  d.best = Math.max(d.best, sc);
  return isBest;
}
const totalStars = () => SAVE.stars.reduce((a, s) => a + (s || 0), 0);
const classicBest = () => Math.max(0, ...Object.keys(DIFFS).map(k => SAVE.best['classic-' + k] || 0));
const WOOD_RULES = {
  maple:  { need: 'Your starting wood',                   prog: () => [1, 1] },
  birch:  { need: 'Clear 50 rows',                        prog: () => [SAVE.stats.rows, 50] },
  oak:    { need: 'Earn 10 level stars',                  prog: () => [totalStars(), 10] },
  cherry: { need: 'Play the daily board 3 days in a row', prog: () => [SAVE.daily.bestStreak, 3] },
  walnut: { need: 'Score 15,000 in one Classic game',     prog: () => [classicBest(), 15000] },
  ebony:  { need: 'Finish level 12, Old Growth',          prog: () => [SAVE.stars[11] ? 1 : 0, 1] },
  redwood: { need: 'Finish level 50, Wildwood',           prog: () => [SAVE.stars[49] ? 1 : 0, 1] },
  olive:  { need: 'Finish level 100, The Great Tree',     prog: () => [SAVE.stars[99] ? 1 : 0, 1] },
};
const woodUnlocked = k => { const [a, b] = WOOD_RULES[k].prog(); return a >= b; };
function newUnlocks() {
  const fresh = Object.keys(WOODS).filter(k => woodUnlocked(k) && !SAVE.woodsSeen.includes(k));
  SAVE.woodsSeen.push(...fresh);
  return fresh;
}
const levelTotal = () => SAVE.levelBest.reduce((a, s) => a + (s || 0), 0);
// keep the five best scores for a mode; returns this score's place on the list (1 is a new best), or 0
function addTop(key, s) {
  if (!s) return 0;
  const list = SAVE.top[key] ||= [], e = { s, d: today() };
  list.push(e); list.sort((a, b) => b.s - a.s); list.length = Math.min(list.length, 5);
  return list.indexOf(e) + 1;
}
const placeText = p => p === 1 ? 'New best!' : p ? `${p}${['', 'st', 'nd', 'rd'][p] || 'th'} best` : '';
const fmt = n => n.toLocaleString();
const starsFor = (left, total) => left >= total * 0.4 ? 3 : left >= total * 0.15 ? 2 : 1;

// ---------- game flow ----------
function startGame(m, li = -1) {
  initAudio();
  mode = m; levelIdx = li;
  m === 'level' || m === 'daily' ? setBoardSize(22, 36) : setBoardSize(11, 18);
  if (m === 'daily') R = { ...DIFFS.normal, timer: DIFFS.normal.time, low: 0, refill: true, stackOutEnds: true };
  else if (m === 'classic') R = { ...DIFFS[SAVE.diff], timer: 0, refill: false, stackOutEnds: true };
  else if (m === 'zen') R = { ...ZEN };
  else {
    const L = LEVELS[li];
    R = { timer: L.time, grav: L.grav ?? 0.8, ramp: 0.05, minGrav: L.minGrav ?? 0.25, ghost: L.ghost ?? true, mult: 1, gold: 0, knot: 0, axe: L.axe,
      refill: false, stackOutEnds: true, grow: L.grow || 0, fog: !!L.fog, dusk: !!L.dusk };
  }
  rng = m === 'daily' ? mulberry32(seedOf('grainfall-' + today())) : m === 'level' ? mulberry32(LEVELS[li].seed) : Math.random;
  if (m === 'level') levelBoard(LEVELS[li]); else if (R.low) lowBoard(R.low); else buildBoard(24, 1, [1, 4], 14); // Daily: the pile starts in the lower part of the board
  bag = []; nextKey = takeKey(); holdKey = null;
  particles = []; popups = []; flashes = []; shakeT = 0;
  score = 0; lines = 0; combo = -1; b2b = false; growT = 0;
  restartMusic();
  timeLeft = R.timer || 0;
  state = 'play';
  showScreen(null);
  SAVE.stats.games++;
  hudLabels();
  if (!SAVE.tutorialDone) startTut();
  else if (m === 'level') note(`Level ${li + 1} · ${LEVELS[li].name}. ${LEVELS[li].tip || levelTraits(LEVELS[li])}`, 5000);
  else if (m === 'daily') note(`Daily board for ${new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}. Same board for everyone today.`);
  spawn(); hud();
}
// a one-line summary of what's on a level, for levels without a tip
function levelTraits(L) {
  const t = [`${L.golds} gold`];
  if (L.knots) t.push(`${L.knots} knot${L.knots > 1 ? 's' : ''}`);
  if (L.irons) t.push(`${L.irons} iron`);
  if (L.kegs) t.push(`${L.kegs} keg${L.kegs > 1 ? 's' : ''}`);
  if (L.ambers) t.push(`${L.ambers} amber`);
  if (L.grow) t.push(`grows every ${L.grow} s`);
  if (L.fog) t.push('fog');
  if (L.dusk) t.push('dusk');
  if (L.ghost === false) t.push('no landing guide');
  return t.join(' · ');
}
let overActions = {};
function finish(kind) {
  if (state === 'over' || state === 'menu') return;
  state = 'over'; piece = null;
  tutStep = -1; showBanner('');
  let title, detail, stars = 0, main = ['Play again', () => startGame(mode, levelIdx)], alt = null;
  if (mode === 'level') {
    const L = LEVELS[levelIdx];
    const n = levelIdx + 1;
    if (kind === 'won') {
      // finishing early pays: 10 points for every second left on the clock
      const secs = Math.ceil(timeLeft), bonus = secs * 10, best = SAVE.levelBest[levelIdx] || 0;
      score += bonus;
      if (score > best) SAVE.levelBest[levelIdx] = score;
      stars = starsFor(timeLeft, L.time);
      SAVE.stars[levelIdx] = Math.max(SAVE.stars[levelIdx] || 0, stars);
      SAVE.unlocked = Math.max(SAVE.unlocked, levelIdx + 2);
      title = `Level ${n} complete!`;
      detail = `${L.name} · ${secs} s to spare (+${fmt(bonus)})\n` + (score > best ? 'New best!' : `Best ${fmt(best)}`) + ` · Total score ${fmt(levelTotal())}`;
      if (levelIdx + 1 < LEVELS.length) main = ['Next level', () => startGame('level', levelIdx + 1)];
      alt = ['Retry', () => startGame('level', levelIdx)];
      chime(523, 0, 0.25); chime(659, 0.12, 0.25); chime(784, 0.24, 0.25); chime(1047, 0.4, 0.3, 1.2);
      haptic('success');
    } else {
      title = kind === 'time' ? 'Out of time' : 'Stacked out';
      detail = `Level ${n}, ${L.name} · ${countCells(GOLD)} gold left`;
      main = ['Retry', () => startGame('level', levelIdx)];
    }
  } else if (mode === 'daily') {
    const isBest = recordDaily(score), place = addTop('daily', score);
    const st = SAVE.daily.streak;
    title = kind === 'stacked' ? 'Stacked out' : "Time's up";
    detail = `Daily board · ${lines} rows · ${st}-day streak` + (isBest ? ' · Best today!' : ` · Today's best ${fmt(SAVE.daily.best)}`) + (place ? `\n${placeText(place)} daily score` : '');
    main = ['Try again', () => startGame('daily')];
  } else if (mode === 'zen') {
    title = 'Nice and calm';
    detail = `${lines} rows cleared` + (lines ? ` · ${placeText(addTop('zen', lines))}` : '').replace(/ · $/, '');
  } else {
    const key = 'classic-' + SAVE.diff, best = SAVE.best[key] || 0, isBest = score > best, place = addTop(key, score);
    if (isBest) SAVE.best[key] = score;
    title = kind === 'stacked' ? 'Stacked out' : "Time's up";
    detail = `${lines} rows · ${DIFFS[SAVE.diff].name}` + (isBest ? ' · New best!' : ` · Best ${fmt(best)}`) + (place > 1 ? ` · ${placeText(place)}` : '');
  }
  const fresh = newUnlocks();
  persist();
  $('overT').textContent = title;
  $('overS').textContent = fmt(mode === 'zen' ? lines : score);
  $('overB').textContent = detail;
  $('overStars').hidden = mode !== 'level' || kind !== 'won';
  $('overStars').innerHTML = [1, 2, 3].map(i => `<span class="${i <= stars ? 'on' : ''}">★</span>`).join('');
  $('overU').hidden = !fresh.length;
  $('overU').textContent = fresh.length ? `New wood unlocked: ${fresh.map(k => WOODS[k].name).join(', ')}. Pick it in the Workshop.` : '';
  $('overMain').textContent = main[0];
  $('overAlt').hidden = !alt;
  if (alt) $('overAlt').textContent = alt[0];
  overActions = { main: main[1], alt: alt?.[1] };
  showScreen('over');
  hud();
}
function setPaused(p) {
  if (p && (state === 'play' || state === 'clearing')) { state = 'paused:' + state; showScreen('paused'); persist(); }
  else if (!p && state.startsWith('paused:')) { state = state.slice(7); showScreen(null); last = performance.now(); }
}
function quitToMenu() {
  if (mode === 'zen' && state.startsWith('paused')) { state = 'play'; finish('quit'); return; }
  state = 'menu'; piece = null; tutStep = -1; showBanner(''); persist();
  showScreen('menu');
}
const gravity = () => Math.max(R.minGrav, R.grav - Math.floor(lines / 8) * R.ramp) * (tutStep >= 0 && tutStep < 3 ? 2.5 : 1); // seconds per row

function hudLabels() {
  $('timeL').textContent = mode === 'level' ? `Level ${levelIdx + 1}` : R.timer ? 'Time' : 'Rows';
  $('timeU').hidden = !R.timer;
  $('scoreL').textContent = 'Score';
}
function hud() {
  // game controls only show while a game is running; visibility keeps the bar's height so the board doesn't resize
  $('bar').classList.toggle('idle', state !== 'play' && state !== 'clearing');
  if (state === 'menu') { $('timeV').textContent = '–'; $('scoreV').textContent = '–'; $('timeU').hidden = true; return; }
  $('timeU').hidden = !R.timer;
  $('timeV').textContent = R.timer ? Math.max(0, Math.ceil(timeLeft)) : lines;
  $('time').classList.toggle('low', !!R.timer && timeLeft <= 15 && state !== 'menu');
  $('scoreV').textContent = score;
}

// ---------- screens ----------
const SCREENS = ['menu', 'levels', 'classic', 'woods', 'stats', 'settings', 'over', 'paused'];
function showScreen(id) {
  for (const s of SCREENS) $(s).hidden = s !== id;
  if (id === 'menu') refreshMenu();
  if (id === 'levels') renderLevels();
  if (id === 'classic') setDiff(SAVE.diff);
  if (id === 'woods') renderWoods();
  if (id === 'stats') renderStats();
  if (id === 'settings') renderSettings();
}
function refreshMenu() {
  $('mLevelsSub').textContent = `Dig down to the gold · ${totalStars()} of ${LEVELS.length * 3} stars`;
  const d = SAVE.daily, t = today();
  $('mDailySub').textContent = d.date === t ? `Today's best ${d.best} · ${d.streak}-day streak`
    : d.last === yesterday() ? `Keep your ${d.streak}-day streak going` : 'A new board every day';
}
function renderLevels() {
  $('levelsSub').textContent = `${totalStars()} of ${LEVELS.length * 3} stars · Total score ${fmt(levelTotal())}`;
  $('levelGrid').innerHTML = LEVELS.map((L, i) => {
    const locked = i + 1 > SAVE.unlocked, s = SAVE.stars[i] || 0;
    const starRow = [1, 2, 3].map(k => `<span class="${k <= s ? 'on' : ''}">★</span>`).join('');
    return (i % 10 ? '' : `<h3 class="chap">${CHAPTERS[i / 10]}</h3>`) + `<button class="lvl${i % 10 === 9 ? ' boss' : ''}" type="button" data-i="${i}" ${locked ? 'disabled aria-label="Level ' + (i + 1) + ', locked"' : ''}><b>${i + 1}</b><small>${L.name}</small><i>${locked ? 'Locked' : starRow}</i>${SAVE.levelBest[i] ? `<em>${fmt(SAVE.levelBest[i])}</em>` : ''}</button>`;
  }).join('');
  $('levelGrid').querySelector(`[data-i="${Math.min(SAVE.unlocked, LEVELS.length) - 1}"]`)?.scrollIntoView({ block: 'center' });
}
function renderWoods() {
  const grid = $('woodGrid');
  grid.innerHTML = '';
  for (const k of Object.keys(WOODS)) {
    const ok = woodUnlocked(k), [a, b] = WOOD_RULES[k].prog();
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'wood' + (ok ? '' : ' locked');
    btn.setAttribute('aria-pressed', SAVE.wood === k);
    if (!ok) btn.disabled = true;
    const sw = document.createElement('canvas'), z = 26;
    sw.width = sw.height = z * 2 * dpr; sw.style.width = sw.style.height = z * 2 + 'px';
    const g = sw.getContext('2d');
    for (let i = 0; i < 4; i++) g.drawImage(makeSprite(z, WOODS[k]), (i % 2) * z * dpr, (i >> 1) * z * dpr, z * dpr, z * dpr);
    const name = document.createElement('b'); name.textContent = WOODS[k].name;
    const need = document.createElement('small');
    need.textContent = ok ? (SAVE.wood === k ? 'In use' : 'Tap to use') : `${WOOD_RULES[k].need} (${Math.min(a, b).toLocaleString()}/${b.toLocaleString()})`;
    btn.append(sw, name, need);
    btn.onclick = () => { SAVE.wood = k; persist(); buildSprites(); drawLogo(); drawNext(); renderWoods(); };
    grid.append(btn);
  }
}
function renderScores() {
  const when = d => d ? new Date(d + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Earlier';
  const list = (title, key, unit = '') => {
    const l = SAVE.top[key] || [];
    return `<h3>${title}</h3><dl>` + (l.length ? l.map((e, i) => `<dt>${i + 1}. ${when(e.d)}</dt><dd>${fmt(e.s)}${unit}</dd>`).join('')
      : '<dt class="none">No scores yet</dt><dd></dd>') + '</dl>';
  };
  const lv = SAVE.levelBest.map((s, i) => [s || 0, i]).filter(x => x[0]).sort((a, b) => b[0] - a[0]).slice(0, 5);
  $('hsList').innerHTML = `<h3>Levels</h3><dl><dt>Total score</dt><dd>${fmt(levelTotal())}</dd>` +
    lv.map(([s, i]) => `<dt>Level ${i + 1} · ${LEVELS[i].name}</dt><dd>${fmt(s)}</dd>`).join('') + '</dl>' +
    Object.keys(DIFFS).map(k => list(`Classic · ${DIFFS[k].name}`, 'classic-' + k)).join('') +
    list('Daily board', 'daily') + list('Zen', 'zen', ' rows');
}
function renderStats() {
  renderScores();
  const st = SAVE.stats, d = SAVE.daily;
  const rows = [
    ['Games played', st.games], ['Rows cleared', st.rows], ['Tetrises', st.tetrises], ['Best combo', st.bestCombo ? '×' + st.bestCombo : '–'],
    ['Gold blocks', st.golds], ['Knots broken', st.knots], ['Axes swung', st.axes],
    ['Level stars', `${totalStars()} / ${LEVELS.length * 3}`], ['Daily streak', `${d.streak} (best ${d.bestStreak})`],
  ];
  $('statList').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${typeof v === 'number' ? v.toLocaleString() : v}</dd>`).join('');
}
function segment(id, value, onPick) {
  document.querySelectorAll(`#${id} button`).forEach(b => {
    b.setAttribute('aria-pressed', b.dataset.v === value);
    b.onclick = () => onPick(b.dataset.v);
  });
}
function renderSettings() {
  const s = SAVE.settings;
  segment('dragSeg', s.drag, v => { s.drag = v; persist(); renderSettings(); });
  segment('hapSeg', s.haptics ? 'on' : 'off', v => { s.haptics = v === 'on'; persist(); renderSettings(); haptic('medium'); });
  segment('musSeg', musicChoice(), v => { s.music = v; persist(); renderSettings(); initAudio(); });
  for (const [id, key] of [['musVol', 'musicVol'], ['sfxVol', 'sfxVol']]) {
    const el = $(id);
    el.value = Math.round((s[key] ?? (key === 'musicVol' ? 0.7 : 1)) * 100);
    const fill = () => el.style.setProperty('--p', el.value + '%');
    fill();
    el.oninput = () => { s[key] = el.value / 100; fill(); initAudio(); applyVolumes(); };
    el.onchange = () => { persist(); if (key === 'sfxVol') sfx(0.5, 1); };
  }
  segment('sndSeg', s.sound ? 'on' : 'off', v => { s.sound = v === 'on'; persist(); renderSettings(); syncSound(); initAudio(); sfx(0.5, 1); });
}
function setDiff(d) {
  SAVE.diff = d; persist();
  segment('diff', d, setDiff);
  const best = SAVE.best['classic-' + d] || 0;
  $('diffNote').textContent = DIFFS[d].note + (best ? ` Best: ${best}.` : '');
}
const syncSound = () => { $('soundBtn').textContent = SAVE.settings.sound ? 'Sound' : 'Muted'; };

let last = performance.now(), softDrop = false;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if ((state === 'play' || state === 'clearing') && R.timer) {
    timeLeft -= dt;
    if (timeLeft <= 0) { timeLeft = 0; finish('time'); }
  }
  if (state === 'clearing') { clearT += dt; if (clearT > 0.28) finishClear(); }
  if (state === 'play' && R.grow && (growT += dt) >= R.grow) { growT = 0; grow(); }
  if (state === 'play' && piece) {
    dropAcc += dt;
    const step = softDrop ? Math.min(0.04, gravity()) : gravity();
    while (dropAcc >= step && piece) {
      dropAcc -= step;
      if (tryMove(0, 1)) { if (softDrop) score++; lockT = 0; }
      else break;
    }
    if (piece && collide(piece.m, piece.x, piece.y + 1)) { lockT += dt; if (lockT > 0.45) lock(); }
  }
  stepParticles(dt); stepFx(dt); musicTick();
  draw(); hud();
  requestAnimationFrame(loop);
}

// ---------- input ----------
addEventListener('keydown', e => {
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { setPaused(!state.startsWith('paused')); return; }
  if (state !== 'play' || !piece) return;
  switch (e.key) {
    case 'ArrowLeft': tryMove(-1, 0) && tut('move'); break;
    case 'ArrowRight': tryMove(1, 0) && tut('move'); break;
    case 'ArrowUp': case 'x': case 'X': tryRotate(1); break;
    case 'z': case 'Z': tryRotate(-1); break;
    case 'ArrowDown': softDrop = true; break;
    case ' ': hardDrop(); break;
    case 'c': case 'C': case 'Shift': holdPiece(); break;
    default: return;
  }
  e.preventDefault();
});
addEventListener('keyup', e => { if (e.key === 'ArrowDown') softDrop = false; });

let touch = null;
const wrap = $('wrap');
wrap.addEventListener('pointerdown', e => {
  if (state !== 'play' || e.target.closest('button')) return;
  initAudio();
  wrap.setPointerCapture(e.pointerId);
  touch = { id: e.pointerId, sx: e.clientX, sy: e.clientY, t: performance.now(), lastY: e.clientY, lastT: performance.now(), movedX: 0, dropped: 0, moved: false };
});
wrap.addEventListener('pointermove', e => {
  if (!touch || e.pointerId !== touch.id || !piece) return;
  const step = Math.max(cell, 14) * DRAG[SAVE.settings.drag];
  const wantX = Math.round((e.clientX - touch.sx) / step);
  let moved = false;
  while (touch.movedX < wantX && tryMove(1, 0)) { touch.movedX++; moved = true; }
  while (touch.movedX > wantX && tryMove(-1, 0)) { touch.movedX--; moved = true; }
  if (moved) { haptic('tick'); tut('move'); }
  if (touch.movedX !== wantX) touch.movedX = wantX; // hit a wall: don't build up a debt of moves
  const dy = e.clientY - touch.sy;
  const now = performance.now();
  const vy = (e.clientY - touch.lastY) / Math.max(1, now - touch.lastT);
  touch.lastY = e.clientY; touch.lastT = now;
  if (Math.abs(e.clientX - touch.sx) > 8 || Math.abs(dy) > 8) touch.moved = true;
  if (vy > 1.4 && dy > fxUnit() * 2) { hardDrop(); touch = null; return; }
  const wantDown = Math.floor(Math.max(0, dy) / step);
  while (touch.dropped < wantDown && tryMove(0, 1)) { touch.dropped++; score++; }
  touch.dropped = Math.max(touch.dropped, wantDown);
});
const endTouch = e => {
  if (!touch || e.pointerId !== touch.id) return;
  if (!touch.moved && performance.now() - touch.t < 300) tryRotate(1);
  touch = null;
};
wrap.addEventListener('pointerup', endTouch);
wrap.addEventListener('pointercancel', () => touch = null);

$('mLevels').onclick = () => showScreen('levels');
$('mClassic').onclick = () => showScreen('classic');
$('mDaily').onclick = () => startGame('daily');
$('mZen').onclick = () => startGame('zen');
$('mWoods').onclick = () => showScreen('woods');
$('mStats').onclick = () => showScreen('stats');
$('mSettings').onclick = () => showScreen('settings');
// Back returns to the pause screen when Settings was opened mid-game, so the game can be resumed
document.querySelectorAll('.back').forEach(b => b.onclick = () => showScreen(state.startsWith('paused') ? 'paused' : 'menu'));
$('pSettings').onclick = () => showScreen('settings');
$('levelGrid').onclick = e => { const b = e.target.closest('.lvl'); if (b && !b.disabled) startGame('level', +b.dataset.i); };
$('go').onclick = () => startGame('classic');
$('overMain').onclick = () => overActions.main?.();
$('overAlt').onclick = () => overActions.alt?.();
$('overMenu').onclick = () => { state = 'menu'; showScreen('menu'); };
$('resume').onclick = () => setPaused(false);
$('restart').onclick = () => startGame(mode, levelIdx);
$('quit').onclick = quitToMenu;
$('tutSkip').onclick = endTut;
$('tutAgain').onclick = () => { SAVE.tutorialDone = false; persist(); $('tutAgain').textContent = 'Tutorial will show next game'; };
$('holdBtn').onclick = holdPiece;
$('holdTray').onclick = holdPiece;
$('dropBtn').onclick = () => state === 'play' && hardDrop();
$('pauseBtn').onclick = () => setPaused(!state.startsWith('paused'));
$('soundBtn').onclick = () => { SAVE.settings.sound = !SAVE.settings.sound; persist(); syncSound(); initAudio(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) { setPaused(true); persist(); } });
addEventListener('resize', resize);
// browsers only allow sound after a tap; Safari wants it on the tap's end
addEventListener('pointerdown', initAudio, { once: true });
addEventListener('touchend', initAudio, { once: true });
// the web version works offline once loaded (the iPhone app loads from its own bundle and skips this)
if (location.protocol === 'https:' && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// a board sits behind the menu from the first frame
buildBoard(VBOT, 1, [1, 4]); nextKey = takeKey();
resize(); syncSound(); hudLabels(); hud();
showScreen('menu');
document.fonts.load('40px "Lilita One"').then(drawLogo, () => {});
requestAnimationFrame(loop);
