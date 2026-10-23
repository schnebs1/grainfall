// Shared wood drawing for the game page and the icon/artwork renderer (tools/art.html).
// Callers define a global `dpr` before calling makeSprite.

// Woods the blocks can be cut from. h/s/l are [min, max] per block; `light` woods are dark with pale grain.
const WOODS = {
  maple:  { name: 'Maple',  h: [27, 34], s: [52, 68], l: [63, 73] },
  birch:  { name: 'Birch',  h: [36, 44], s: [36, 50], l: [74, 82] },
  oak:    { name: 'Oak',    h: [30, 36], s: [42, 54], l: [52, 60] },
  cherry: { name: 'Cherry', h: [10, 17], s: [48, 60], l: [48, 56] },
  walnut: { name: 'Walnut', h: [20, 27], s: [30, 42], l: [32, 40], light: true },
  ebony:  { name: 'Ebony',  h: [18, 26], s: [8, 16],  l: [15, 21], light: true },
  redwood: { name: 'Redwood', h: [8, 14],  s: [55, 68], l: [38, 46] },
  olive:  { name: 'Olive',  h: [40, 48], s: [28, 40], l: [58, 68] },
};

// One wooden cube, s CSS px square: grain, rings, rare knot and a carved dimple.
// kind: '' plain, 'gold' gilded, 'knot' tough knotted block, 'cracked' a knot that has been hit, 'axe' the axe piece,
// 'amber' a resin block (adds time), 'keg' a powder keg, 'iron' an iron-banded block.
function makeSprite(s, wood = WOODS.maple, kind = '') {
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(s * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const inset = Math.max(0.6, s * 0.04), w = s - inset * 2;
  const R = s * 0.3, cx = s / 2, cy = s / 2;
  const r = Math.random, pick = ([lo, hi]) => lo + r() * (hi - lo);
  const gold = kind === 'gold', knotty = kind === 'knot' || kind === 'cracked';
  const amber = kind === 'amber';
  let hue = gold ? 42 + r() * 4 : amber ? 28 + r() * 4 : pick(wood.h), sat = gold ? 82 + r() * 10 : amber ? 92 : pick(wood.s);
  let lit = gold ? 56 + r() * 6 : amber ? 46 + r() * 4 : pick(wood.l);
  if (kind === 'keg') { hue = 14; sat = 45; lit = 34; } // dark red-brown staves
  const dir = wood.light && !gold ? 1 : -1; // grain darker than the base, or paler on dark woods
  g.save();
  g.beginPath(); g.roundRect(inset, inset, w, w, s * 0.1); g.clip();
  g.fillStyle = `hsl(${hue} ${sat}% ${lit}%)`;
  g.fillRect(0, 0, s, s);
  // grain runs across or down the face, so neighbouring blocks don't look stamped
  if (r() < 0.5) { g.translate(s / 2, s / 2); g.rotate(Math.PI / 2); g.translate(-s / 2, -s / 2); }
  const bend = (r() - 0.5) * 0.9 / s, phase = r() * 6.28, freq = (0.4 + r() * 0.6) / s;
  const grainLine = (y0, width, alpha, lightness) => {
    g.strokeStyle = `hsla(${hue - 6} ${sat + 8}% ${Math.max(4, Math.min(92, lightness))}% / ${alpha})`;
    g.lineWidth = width;
    g.beginPath();
    for (let x = -2; x <= s + 2; x += s / 12) {
      const y = y0 + Math.sin(x * freq * 6.28 + phase + y0 * 0.03) * s * 0.012 + bend * (x - s / 2) ** 2;
      x < 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  };
  // growth rings: soft earlywood bands with sharper latewood edges
  for (let y = -s * 0.3; y < s * 1.3; y += s * (0.07 + r() * 0.1)) {
    grainLine(y, s * (0.04 + r() * 0.06), 0.12 + r() * 0.1, lit + dir * 12);
    grainLine(y + s * 0.03, Math.max(0.5, s * (0.008 + r() * 0.014)), 0.35 + r() * 0.3, lit + dir * 30);
  }
  // fine fibres
  for (let k = 0; k < 40; k++) grainLine(r() * s * 1.4 - s * 0.2, Math.max(0.3, s * 0.006), 0.1 + r() * 0.12, lit + dir * (r() < 0.5 ? 25 : -12));
  // occasional small knot
  if (!kind && r() < 0.08) {
    const kx = s * (0.15 + r() * 0.7), ky = s * (0.15 + r() * 0.7), kr = s * (0.03 + r() * 0.03);
    for (let k = 4; k > 0; k--) {
      g.fillStyle = `hsla(${hue - 8} ${sat + 10}% ${Math.max(4, lit - 20 - k * 6)}% / .35)`;
      g.beginPath(); g.ellipse(kx, ky, kr * k * 0.5 + kr * 0.4, kr * k * 0.35 + kr * 0.25, 0, 0, Math.PI * 2); g.fill();
    }
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  // light from the top left, a little falloff across the face
  let lg = g.createLinearGradient(0, 0, s, s);
  lg.addColorStop(0, 'rgba(255,245,225,.28)'); lg.addColorStop(0.5, 'rgba(255,245,225,0)'); lg.addColorStop(1, 'rgba(70,30,5,.25)');
  g.fillStyle = lg; g.fillRect(0, 0, s, s);
  if (knotty) {
    // a big dark knot where the dimple would be, and a heavy dark rim so it reads as tough
    for (let k = 5; k > 0; k--) {
      g.fillStyle = `hsla(${hue - 8} ${sat + 12}% ${Math.max(6, Math.min(lit, 50) - 12 - k * 5)}% / .75)`;
      g.beginPath(); g.ellipse(cx, cy, R * (0.25 + k * 0.16), R * (0.18 + k * 0.12), -0.5, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(35,12,0,.6)'; g.lineWidth = s * 0.09;
    g.beginPath(); g.roundRect(inset + s * 0.045, inset + s * 0.045, w - s * 0.09, w - s * 0.09, s * 0.08); g.stroke();
    if (kind === 'cracked') {
      g.strokeStyle = 'rgba(20,6,0,.9)'; g.lineWidth = Math.max(1, s * 0.05); g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(s * 0.12, s * 0.28); g.lineTo(s * 0.34, s * 0.42); g.lineTo(s * 0.46, s * 0.36); g.lineTo(s * 0.6, s * 0.58); g.lineTo(s * 0.88, s * 0.7);
      g.moveTo(s * 0.46, s * 0.36); g.lineTo(s * 0.52, s * 0.14);
      g.moveTo(s * 0.6, s * 0.58); g.lineTo(s * 0.5, s * 0.86);
      g.stroke();
    }
  } else if (kind === 'axe') {
    // steel axe head on a short handle
    g.save(); g.translate(cx, cy); g.rotate(-0.65);
    g.fillStyle = '#5a2c0c'; g.beginPath(); g.roundRect(-s * 0.045, -s * 0.12, s * 0.09, s * 0.48, s * 0.03); g.fill();
    const steel = g.createLinearGradient(0, -s * 0.34, 0, s * 0.02);
    steel.addColorStop(0, '#f4f7fa'); steel.addColorStop(1, '#7c8893');
    g.fillStyle = steel; g.strokeStyle = 'rgba(25,30,35,.8)'; g.lineWidth = Math.max(0.6, s * 0.03);
    g.beginPath();
    g.moveTo(-s * 0.08, -s * 0.28); g.lineTo(s * 0.06, -s * 0.28);
    g.quadraticCurveTo(s * 0.2, -s * 0.36, s * 0.3, -s * 0.36);
    g.quadraticCurveTo(s * 0.36, -s * 0.16, s * 0.3, s * 0.04);
    g.quadraticCurveTo(s * 0.18, s * 0.0, s * 0.06, -s * 0.08);
    g.lineTo(-s * 0.08, -s * 0.08); g.closePath(); g.fill(); g.stroke();
    g.restore();
  } else if (kind === 'amber') {
    // clear resin: a glowing core with a little trapped seed in it
    const rg = g.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 0, cx, cy, R * 1.5);
    rg.addColorStop(0, 'rgba(255,236,150,.95)'); rg.addColorStop(0.6, 'rgba(255,170,40,.35)'); rg.addColorStop(1, 'rgba(120,40,0,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, R * 1.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(70,25,0,.8)';
    g.beginPath(); g.ellipse(cx + R * 0.15, cy + R * 0.2, R * 0.28, R * 0.15, 0.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,240,.8)';
    g.beginPath(); g.ellipse(cx - R * 0.45, cy - R * 0.5, R * 0.22, R * 0.12, -0.7, 0, Math.PI * 2); g.fill();
  } else if (kind === 'keg') {
    // two iron hoops and a lit fuse
    g.fillStyle = 'rgba(30,30,34,.85)';
    for (const y of [0.24, 0.68]) g.fillRect(0, s * y, s, s * 0.1);
    g.fillStyle = 'rgba(200,200,210,.35)';
    for (const y of [0.24, 0.68]) g.fillRect(0, s * y, s, s * 0.025);
    g.strokeStyle = '#e8dcc0'; g.lineWidth = Math.max(1, s * 0.05); g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, cy + s * 0.05); g.quadraticCurveTo(cx + s * 0.12, cy - s * 0.08, cx + s * 0.06, cy - s * 0.2); g.stroke();
    g.fillStyle = '#ffd24a';
    g.beginPath(); g.arc(cx + s * 0.06, cy - s * 0.22, s * 0.07, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff6d0';
    g.beginPath(); g.arc(cx + s * 0.06, cy - s * 0.22, s * 0.03, 0, Math.PI * 2); g.fill();
  } else if (kind === 'iron') {
    // a riveted steel plate across the middle
    const st = g.createLinearGradient(0, cy - s * 0.2, 0, cy + s * 0.2);
    st.addColorStop(0, '#c9d0d6'); st.addColorStop(0.5, '#7d8892'); st.addColorStop(1, '#4a535b');
    g.fillStyle = st; g.fillRect(0, cy - s * 0.2, s, s * 0.4);
    g.strokeStyle = 'rgba(20,24,28,.8)'; g.lineWidth = Math.max(0.6, s * 0.03);
    g.strokeRect(-1, cy - s * 0.2, s + 2, s * 0.4);
    for (const x of [0.22, 0.78]) {
      g.fillStyle = '#2d3338'; g.beginPath(); g.arc(s * x, cy, s * 0.065, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e8edf0'; g.beginPath(); g.arc(s * x - s * 0.015, cy - s * 0.015, s * 0.025, 0, Math.PI * 2); g.fill();
    }
  } else {
    // carved dimple: shadowed on the lit side, catching light on the far wall; grain shows through
    lg = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    lg.addColorStop(0, 'rgba(60,22,0,.6)'); lg.addColorStop(0.55, 'rgba(90,40,10,.08)'); lg.addColorStop(1, 'rgba(255,238,205,.6)');
    g.fillStyle = lg;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.lineWidth = Math.max(0.6, s * 0.035);
    g.strokeStyle = 'rgba(255,240,215,.55)';
    g.beginPath(); g.arc(cx, cy, R, Math.PI * 1.75, Math.PI * 0.75, true); g.stroke();
    g.strokeStyle = 'rgba(60,22,0,.4)';
    g.beginPath(); g.arc(cx, cy, R, Math.PI * 0.8, Math.PI * 1.7); g.stroke();
  }
  if (gold) {
    // polished sheen and a glint
    lg = g.createLinearGradient(0, 0, s, s);
    lg.addColorStop(0.25, 'rgba(255,255,240,0)'); lg.addColorStop(0.4, 'rgba(255,255,240,.55)'); lg.addColorStop(0.55, 'rgba(255,255,240,0)');
    g.fillStyle = lg; g.fillRect(0, 0, s, s);
    const gx = s * 0.74, gy = s * 0.26, gr = s * 0.16;
    g.fillStyle = 'rgba(255,255,245,.95)';
    g.beginPath(); g.moveTo(gx, gy - gr); g.quadraticCurveTo(gx, gy, gx + gr, gy); g.quadraticCurveTo(gx, gy, gx, gy + gr);
    g.quadraticCurveTo(gx, gy, gx - gr, gy); g.quadraticCurveTo(gx, gy, gx, gy - gr); g.fill();
  }
  g.restore();
  // sanded, rounded edges
  g.lineWidth = Math.max(1, s * 0.06);
  g.strokeStyle = 'rgba(255,240,215,.6)';
  g.beginPath(); g.moveTo(inset * 2, s - inset * 2.5); g.lineTo(inset * 2, inset * 2); g.lineTo(s - inset * 2.5, inset * 2); g.stroke();
  g.strokeStyle = 'rgba(80,35,8,.5)';
  g.beginPath(); g.moveTo(s - inset * 2, inset * 2.5); g.lineTo(s - inset * 2, s - inset * 2); g.lineTo(inset * 2.5, s - inset * 2); g.stroke();
  return c;
}
// Vertical wooden planks with long grain, rings, butt joints and the odd knot.
function woodPlanks(g, W, H, plankW, lit) {
  const r = Math.random;
  for (let x0 = 0; x0 < W; x0 += plankW) {
    // each plank may be two boards joined end to end
    const joints = [0, ...(r() < 0.6 ? [H * (0.2 + r() * 0.6)] : []), H];
    for (let b = 0; b < joints.length - 1; b++) {
      const y0 = joints[b], y1 = joints[b + 1];
      const hue = 22 + r() * 6, sat = 40 + r() * 12, l = lit + r() * 6 - 3;
      g.save();
      g.beginPath(); g.rect(x0, y0, plankW, y1 - y0); g.clip();
      g.fillStyle = `hsl(${hue} ${sat}% ${l}%)`;
      g.fillRect(x0, y0, plankW, y1 - y0);
      const bend = (r() - 0.5) * 0.6 / H, phase = r() * 6.28, freq = (0.5 + r()) / plankW, yc = y0 + r() * (y1 - y0);
      const line = (xs, width, alpha, dl) => {
        g.strokeStyle = `hsla(${hue - 4} ${sat + 8}% ${l + dl}% / ${alpha})`;
        g.lineWidth = width;
        g.beginPath();
        for (let y = y0 - 2; y <= y1 + 2; y += plankW / 3) {
          const x = xs + Math.sin(y * freq * 0.6 + phase + xs * 0.05) * plankW * 0.05 + bend * (y - yc) ** 2;
          y < y0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.stroke();
      };
      for (let x = x0 - plankW * 0.4; x < x0 + plankW * 1.4; x += plankW * (0.08 + r() * 0.14)) {
        line(x, plankW * (0.05 + r() * 0.08), 0.1 + r() * 0.12, -6);
        line(x + plankW * 0.04, Math.max(0.5, plankW * 0.02), 0.25 + r() * 0.3, -12);
      }
      for (let k = 0; k < 14; k++) line(x0 + r() * plankW, 0.5, 0.08 + r() * 0.12, r() < 0.5 ? -10 : 8);
      if (r() < 0.12) {
        const kx = x0 + plankW * (0.25 + r() * 0.5), ky = y0 + r() * (y1 - y0), kr = plankW * (0.08 + r() * 0.08);
        for (let k = 4; k > 0; k--) {
          g.fillStyle = `hsla(${hue - 6} ${sat + 10}% ${l - 6 - k * 2}% / .45)`;
          g.beginPath(); g.ellipse(kx, ky, kr * (0.3 + k * 0.25), kr * (0.6 + k * 0.5), 0, 0, Math.PI * 2); g.fill();
        }
      }
      g.restore();
      // seams: dark gap, lit left edge
      g.fillStyle = 'rgba(15,4,0,.55)'; g.fillRect(x0, y0, 1, y1 - y0);
      g.fillStyle = 'rgba(255,220,180,.07)'; g.fillRect(x0 + 1, y0, 1, y1 - y0);
      if (y0 > 0) { g.fillStyle = 'rgba(15,4,0,.5)'; g.fillRect(x0, y0, plankW, 1); }
    }
  }
}
