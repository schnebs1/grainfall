// Background music in the style of old handheld puzzle games: a narrow pulse-wave lead, a bass that bounces
// between octaves on every eighth note and a ticking hi-hat, all synthesised. Tune A is the Russian folk song
// Korobeiniki (public domain); tunes B and C are originals. Uses the game's audio context (actx) and soundOn().

// Tune C is calm: a soft mallet melody over held roots and a slow harp-like arpeggio, with rain on the leaves
// and the odd drip. It never hurries.
// lead: "Note:beats" per bar, bars split by '|', R is a rest. bass: one root per bar, or two ("F2/G2") for half bars;
// in a calm tune a root ending in m ("B2m") is a minor chord.
const TUNES = {
  a: {
    name: 'Korobeiniki', bpm: 150,
    parts: [
      { lead: 'E5:1 B4:.5 C5:.5 D5:1 C5:.5 B4:.5 | A4:1 A4:.5 C5:.5 E5:1 D5:.5 C5:.5 | B4:1.5 C5:.5 D5:1 E5:1 | C5:1 A4:1 A4:1 R:1 |' +
              'R:.5 D5:1 F5:.5 A5:1 G5:.5 F5:.5 | E5:1.5 C5:.5 E5:1 D5:.5 C5:.5 | B4:1 B4:.5 C5:.5 D5:1 E5:1 | C5:1 A4:1 A4:1 R:1',
        bass: 'E2 A2 E2 A2 D2 C2 E2 A2', repeat: 2 },
      { lead: 'E5:2 C5:2 | D5:2 B4:2 | C5:2 A4:2 | G#4:2 B4:2 | E5:2 C5:2 | D5:2 B4:2 | C5:1 E5:1 A5:2 | G#5:4',
        bass: 'A2 E2 A2 E2 A2 E2 A2 E2', repeat: 1 },
    ],
  },
  b: {
    name: 'Sawdust', bpm: 140,
    parts: [
      { lead: 'G5:.5 E5:.5 C5:1 D5:.5 E5:.5 F5:.5 D5:.5 | E5:1 C5:.5 A4:.5 G4:1 R:1 | A4:.5 C5:.5 F5:1 E5:.5 D5:.5 C5:.5 A4:.5 | B4:1 G4:1 D5:1 B4:1 |' +
              'G5:.5 E5:.5 C5:1 D5:.5 E5:.5 F5:.5 D5:.5 | E5:1 G5:.5 A5:.5 G5:1 E5:1 | F5:.5 E5:.5 D5:.5 C5:.5 D5:1 G4:1 | C5:2 R:2',
        bass: 'C3 A2 F2 G2 C3 A2 F2/G2 C3', repeat: 2 },
      { lead: 'A5:1 G5:.5 E5:.5 A5:1 G5:.5 E5:.5 | F5:1 E5:.5 D5:.5 C5:1 D5:1 | E5:1 D5:.5 C5:.5 E5:1 D5:.5 C5:.5 | D5:1 B4:1 G4:2 |' +
              'A5:1 G5:.5 E5:.5 A5:1 G5:.5 E5:.5 | F5:.5 G5:.5 A5:1 B5:1 C6:1 | B5:1 G5:1 D5:1 B4:1 | C6:2 R:2',
        bass: 'A2 F2 C3 G2 A2 F2/G2 G2 C3', repeat: 1 },
    ],
  },
  c: { name: 'Rainwood', bpm: 72, calm: true, parts: [] }, // parts below
};

// Rainwood wanders through five sections (about three minutes) before it loops: the theme, a variation, a lift,
// a minor-key verse and a quiet stretch that's mostly rain, then the theme and lift again.
// arp picks the accompaniment: up (rolling), wide (octave leaps) or sparse (two notes a bar).
{
  const theme = { lead: 'F#5:1.5 E5:.5 D5:2 | R:1 B4:1 D5:1 E5:1 | D5:1.5 B4:.5 A4:2 | R:2 A4:1 B4:1 |' +
                        'A5:1.5 F#5:.5 E5:2 | R:1 D5:1 E5:1 F#5:1 | E5:1.5 D5:.5 B4:1 A4:1 | A4:4',
                  bass: 'D3 B2m G2 A2 D3 B2m G2 A2', arp: 'up', repeat: 1 };
  const variation = { lead: 'A5:1.5 F#5:.5 E5:1 D5:1 | F#5:2 D5:1 B4:1 | B4:1 D5:1 G5:1.5 F#5:.5 | E5:2 R:1 C#5:1 |' +
                            'D5:.5 E5:.5 F#5:1 A5:1 B5:1 | A5:2 F#5:1 D5:1 | G5:1 F#5:1 E5:1 D5:1 | E5:2 A4:2',
                      bass: 'D3 B2m G2 A2 D3 B2m G2 A2', arp: 'wide', repeat: 1 };
  const lift = { lead: 'B5:2 A5:1 F#5:1 | E5:3 R:1 | F#5:1 E5:1 C#5:1 A4:1 | B4:3 R:1 |' +
                       'D5:1 E5:1 G5:1 F#5:1 | E5:2 A4:2 | F#5:1.5 E5:.5 D5:1 A4:1 | D5:4',
                 bass: 'G2 A2 F#2m B2m G2 A2 D3 D3', arp: 'up', repeat: 1 };
  const verse = { lead: 'D5:2 F#5:1 E5:1 | D5:1 B4:1 R:2 | A4:1.5 D5:.5 F#5:2 | E5:3 R:1 |' +
                        'D5:1 E5:1 F#5:1 A5:1 | G5:2 F#5:1 D5:1 | E5:1 G5:1 F#5:1 E5:1 | E5:2 C#5:2',
                  bass: 'B2m G2 D3 A2 B2m G2 E2m A2', arp: 'wide', repeat: 1 };
  const hush = { lead: 'R:4 | R:2 A5:2 | R:4 | F#5:2 E5:2 | R:4 | D5:2 B4:2 | R:4 | A4:4',
                 bass: 'D3 G2 D3 A2 D3 G2 E2m A2', arp: 'sparse', repeat: 1 };
  TUNES.c.parts = [theme, variation, lift, verse, hush, theme, lift];
}
const ARPS = { up: [0, 7, 12, 16, 19, 16, 12, 7], wide: [0, 12, 19, 24, 16, 19, 12, 7], sparse: [0, null, null, null, 16, null, null, null] };

const midi = name => {
  const [, l, acc, oct] = name.match(/([A-G])(#|b)?(\d)/);
  return 12 * (+oct + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[l] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0);
};
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

// Flatten a tune into timed events: { b: beat, d: beats, v: 'lead' | 'bass' | 'hat', f: Hz }.
function tuneEvents(tune) {
  const ev = [];
  let b = 0;
  for (const part of tune.parts) for (let rep = 0; rep < part.repeat; rep++) {
    const start = b;
    for (const tok of part.lead.replace(/\|/g, ' ').split(/\s+/).filter(Boolean)) {
      const [n, d] = tok.split(':');
      if (n !== 'R') ev.push({ b, d: +d, v: tune.calm ? 'bell' : 'lead', f: hz(midi(n)) });
      b += +d;
    }
    if (tune.calm) part.bass.split(' ').forEach((ch, bar) => {
      const root = midi(ch), minor = ch.endsWith('m'); // 16 in a pattern is the third, flattened for a minor chord
      ev.push({ b: start + bar * 4, d: 4, v: 'pad', f: hz(root) });
      ARPS[part.arp].forEach((iv, k) => iv !== null &&
        ev.push({ b: start + bar * 4 + k / 2, d: part.arp === 'sparse' ? 3 : 1.5, v: 'arp', f: hz(root + 12 + (minor && iv === 16 ? 15 : iv)) }));
    });
    else part.bass.split(' ').forEach((roots, bar) => {
      const rs = roots.split('/');
      for (let k = 0; k < 8; k++) {
        const root = midi(rs[Math.floor(k * rs.length / 8)]);
        ev.push({ b: start + bar * 4 + k / 2, d: 0.45, v: 'bass', f: hz(root + (k % 2) * 12) });
        if (k % 2) ev.push({ b: start + bar * 4 + k / 2, d: 0.1, v: 'hat' });
      }
    });
  }
  ev.sort((x, y) => x.b - y.b);
  return { ev, len: b };
}

let mus = { tune: '', ev: [], len: 0, idx: 0, out: null, bb: 0, tb: 0, rain: null, drip: 0 }, pulse, rainBuf;
const musicChoice = () => { const c = SAVE.settings.music; return c === 'off' || TUNES[c] ? c : 'a'; };

// The menu plays it too; a game starts the tune from the top. Paused and results screens are quiet.
// Called every frame: starts, stops and schedules notes a little ahead of the audio clock.
function musicTick() {
  const playing = state === 'play' || state === 'clearing';
  const want = actx && soundOn() && musicChoice() !== 'off' && volume('music') > 0 && (playing || state === 'menu');
  if (!want) { stopMusic(); return; }
  if (mus.tune !== musicChoice()) { stopMusic(); Object.assign(mus, tuneEvents(TUNES[musicChoice()]), { tune: musicChoice(), idx: 0 }); }
  if (!mus.out) {
    mus.out = actx.createGain(); mus.out.gain.value = 1; mus.out.connect(musBus);
    mus.bb = mus.ev[mus.idx].b; mus.tb = actx.currentTime + 0.05;
    if (TUNES[mus.tune].calm) startRain();
  }
  if (mus.rain && actx.currentTime + 0.15 > mus.drip) { drip(mus.drip); mus.drip += 0.6 + Math.random() * 2; }
  // hurry up when the clock is nearly out, like the old games did when the stack got high
  const spb = 60 / (TUNES[mus.tune].bpm * (playing && R.timer && timeLeft <= 20 && !TUNES[mus.tune].calm ? 1.3 : 1));
  while (true) {
    const e = mus.ev[mus.idx], t = mus.tb + (e.b - mus.bb) * spb;
    if (t > actx.currentTime + 0.15) break;
    if (t >= actx.currentTime - 0.02) playNote(e, t, e.d * spb);
    mus.bb = e.b; mus.tb = t;
    if (++mus.idx >= mus.ev.length) { mus.idx = 0; mus.bb -= mus.len; }
  }
}
function stopMusic() {
  if (!mus.out) return;
  const g = mus.out;
  g.gain.setTargetAtTime(0, actx.currentTime, 0.05);
  setTimeout(() => g.disconnect(), 400);
  mus.rain?.stop(actx.currentTime + 0.4); mus.rain = null;
  mus.out = null;
}
// a new game starts its tune from the top
const restartMusic = () => { stopMusic(); mus.idx = 0; };

// Rain: two seconds of looped noise, a soft hiss on top and a low patter underneath.
function startRain() {
  if (!rainBuf) {
    rainBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
    const d = rainBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = actx.createBufferSource(); src.buffer = rainBuf; src.loop = true;
  const hiss = actx.createBiquadFilter(); hiss.type = 'bandpass'; hiss.frequency.value = 2500; hiss.Q.value = 0.6;
  const low = actx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 400;
  const gh = actx.createGain(), gl = actx.createGain();
  gh.gain.setValueAtTime(0, actx.currentTime); gh.gain.linearRampToValueAtTime(0.014, actx.currentTime + 2);
  gl.gain.setValueAtTime(0, actx.currentTime); gl.gain.linearRampToValueAtTime(0.024, actx.currentTime + 2);
  // the shower comes and goes a little, over about half a minute
  const swell = actx.createOscillator(), depth = actx.createGain();
  swell.frequency.value = 0.035; depth.gain.value = 0.006;
  swell.connect(depth); depth.connect(gh.gain); depth.connect(gl.gain);
  swell.start(); src.onended = () => swell.stop();
  src.connect(hiss).connect(gh).connect(mus.out);
  src.connect(low).connect(gl).connect(mus.out);
  src.start();
  mus.rain = src; mus.drip = actx.currentTime + 1;
}
// a single drop off a leaf: a quick falling ping
function drip(t) {
  const o = actx.createOscillator(), g = actx.createGain(), f = 1400 + Math.random() * 1800;
  o.type = 'sine';
  o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.06);
  g.gain.setValueAtTime(0.005 + Math.random() * 0.009, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.09);
  o.connect(g).connect(mus.out); o.start(t); o.stop(t + 0.1);
}
// calm voices: a mallet note (sine plus a quickly fading overtone), a soft held root and a quiet plucked arpeggio
function softNote(f, t, len, vol, overtone) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine'; o.frequency.value = f;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + (overtone ? 0.01 : 0.4));
  g.gain.exponentialRampToValueAtTime(0.0005, t + len);
  o.connect(g).connect(mus.out); o.start(t); o.stop(t + len);
  if (overtone) {
    const o2 = actx.createOscillator(), g2 = actx.createGain();
    o2.type = 'sine'; o2.frequency.value = f * 4;
    g2.gain.setValueAtTime(vol * 0.25, t); g2.gain.exponentialRampToValueAtTime(0.0005, t + 0.25);
    o2.connect(g2).connect(mus.out); o2.start(t); o2.stop(t + 0.3);
  }
}

function playNote(e, t, d) {
  if (e.v === 'bell') return softNote(e.f, t, Math.max(1.2, d * 1.2), 0.09, true);
  if (e.v === 'pad') return softNote(e.f, t, d * 1.1, 0.07, false);
  if (e.v === 'arp') return softNote(e.f, t, d, 0.025, true);
  if (e.v === 'hat') {
    const src = actx.createBufferSource(); src.buffer = noise;
    const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = actx.createGain(); g.gain.setValueAtTime(0.035, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hp).connect(g).connect(mus.out); src.start(t); src.stop(t + 0.06);
    return;
  }
  if (!pulse) { // 25% duty pulse, the classic handheld lead
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) { re[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * 0.25); }
    pulse = actx.createPeriodicWave(re, im);
  }
  const o = actx.createOscillator(), g = actx.createGain();
  const lead = e.v === 'lead', vol = lead ? 0.06 : 0.11;
  if (lead) o.setPeriodicWave(pulse); else o.type = 'triangle';
  o.frequency.value = e.f;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.setValueAtTime(vol * 0.8, t + Math.max(0.01, d * 0.7));
  g.gain.linearRampToValueAtTime(0, t + d * 0.95);
  o.connect(g).connect(mus.out); o.start(t); o.stop(t + d);
}
