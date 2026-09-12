/* cigarettes.js — the three smokeable types and how they are drawn. */

const TAU = Math.PI * 2;

export const CIG_TYPES = [
  {
    id: 'classic',
    name: 'Classic',
    note: 'full flavour · grey smoke',
    len: 190, width: 15,
    filter: 52, filterColor: '#c89a5c', filterDark: '#a97c42',
    paper: '#f6f3ec', paperShade: '#d9d4c8',
    band: null,
    burnRate: 0.016,        // fraction of the stick per second while drawing
    idleBurn: 0.0035,
    tint: '#e9e9ee',
    puffCount: 64, puffSize: 23, puffSpeed: 540, puffLife: 4.8, alpha: 0.48,
    wispRate: 11
  },
  {
    id: 'menthol',
    name: 'Menthol',
    note: 'cool · bright blue smoke',
    len: 200, width: 14,
    filter: 58, filterColor: '#e9e4d6', filterDark: '#cfc8b6',
    paper: '#ffffff', paperShade: '#dfe9ee',
    band: { at: 0.30, w: 12, color: '#38c9a8' },
    burnRate: 0.014,
    idleBurn: 0.003,
    tint: '#d8f2ff',
    puffCount: 58, puffSize: 20, puffSpeed: 620, puffLife: 4.1, alpha: 0.42,
    wispRate: 10
  },
  {
    id: 'cigar',
    name: 'Cigar',
    note: 'heavy · thick rolling clouds',
    len: 215, width: 26,
    filter: 46, filterColor: '#5a3a22', filterDark: '#3f2716',
    paper: '#7b4a27', paperShade: '#54301a',
    band: { at: 0.26, w: 20, color: '#c9a227' },
    burnRate: 0.009,
    idleBurn: 0.002,
    tint: '#d6cdbf',
    puffCount: 76, puffSize: 29, puffSpeed: 410, puffLife: 6.0, alpha: 0.54,
    wispRate: 14
  },
  {
    id: 'bidi',
    name: 'Bidi',
    note: 'tendu leaf · harsh and fast',
    style: 'bidi',
    len: 132, width: 15,
    taper: 0.58,                       // narrows toward the lit end
    filter: 20, filterColor: '#b2222e', filterDark: '#7d1620',   // thread wrap
    paper: '#6f4a28', paperShade: '#40280f',
    band: null,
    burnRate: 0.030,                   // goes down fast
    idleBurn: 0.009,                   // and keeps burning if you leave it
    tint: '#e0d4b8',                   // pungent, faintly yellow
    puffCount: 66, puffSize: 23, puffSpeed: 500, puffLife: 4.7, alpha: 0.50,
    wispRate: 15,
    ashRate: 0.34                      // crumbles quicker than a cigarette
  }
];

export const MAX_LEN = Math.max(...CIG_TYPES.map(t => t.len));

export const typeById = id => CIG_TYPES.find(t => t.id === id) || CIG_TYPES[0];

/** current drawn length: the filter never burns away */
export function cigLength (cig) {
  const t = cig.type;
  return t.filter + (t.len - t.filter) * (1 - cig.burn);
}

/** on-screen length: `squash` foreshortens it when it points at the camera */
export function cigDrawLength (cig) {
  return cigLength(cig) * (cig.scale ?? 1) * (cig.squash ?? 1);
}

/** world position of the burning tip */
export function cigTip (cig) {
  const L = cigDrawLength(cig);
  return { x: cig.x + Math.cos(cig.angle) * L, y: cig.y + Math.sin(cig.angle) * L };
}

/**
 * Draw a cigarette. (cig.x, cig.y) is the butt end; it extends along cig.angle.
 * `ember` 0..1 controls how hot the coal glows.
 */
export function drawCigarette (ctx, cig) {
  if (cig.type.style === 'bidi') return drawBidi(ctx, cig);
  const t = cig.type;
  const s = cig.scale ?? 1;
  const sq = cig.squash ?? 1;
  const L = cigDrawLength(cig);          // foreshortened
  const w = t.width * s;                 // width is NOT foreshortened
  const fl = t.filter * s * sq;
  const ember = cig.ember ?? 0;
  const ashLen = (5 + (cig.ash ?? 0) * 30) * s * sq;

  ctx.save();
  ctx.globalAlpha = cig.alpha ?? 1;
  ctx.translate(cig.x, cig.y);
  ctx.rotate(cig.angle);

  // drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = 14 * s;
  ctx.shadowOffsetY = 5 * s;
  ctx.fillStyle = '#000';
  roundRect(ctx, 0, -w / 2, L, w, w / 2);
  ctx.fill();
  ctx.restore();

  // ---- filter ----
  const fg = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
  fg.addColorStop(0, lighten(t.filterColor, 22));
  fg.addColorStop(0.45, t.filterColor);
  fg.addColorStop(1, t.filterDark);
  ctx.fillStyle = fg;
  roundRect(ctx, 0, -w / 2, Math.min(fl, L), w, w / 2);
  ctx.fill();

  // speckle on the filter
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, 0, -w / 2, Math.min(fl, L), w, w / 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  for (let i = 0; i < 26; i++) {
    ctx.fillRect(Math.random() * fl, -w / 2 + Math.random() * w, 1.1 * s, 1.1 * s);
  }
  ctx.restore();

  // ---- paper ----
  const bodyLen = Math.max(0, L - fl - ashLen);
  if (bodyLen > 0) {
    const pg = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
    pg.addColorStop(0, lighten(t.paper, 12));
    pg.addColorStop(0.42, t.paper);
    pg.addColorStop(1, t.paperShade);
    ctx.fillStyle = pg;
    ctx.fillRect(fl, -w / 2, bodyLen, w);

    // seam line
    ctx.fillStyle = 'rgba(0,0,0,.07)';
    ctx.fillRect(fl, w * 0.18, bodyLen, 1 * s);

    if (t.band) {
      const bx = fl + bodyLen * t.band.at;
      const bw = t.band.w * s;
      if (bx + bw < fl + bodyLen) {
        ctx.fillStyle = t.band.color;
        ctx.fillRect(bx, -w / 2, bw, w);
        ctx.fillStyle = 'rgba(0,0,0,.18)';
        ctx.fillRect(bx, w * 0.2, bw, w * 0.3);
      }
    }
    // scorch just behind the ash
    const sg = ctx.createLinearGradient(fl + bodyLen - 22 * s, 0, fl + bodyLen, 0);
    sg.addColorStop(0, 'rgba(60,40,20,0)');
    sg.addColorStop(1, `rgba(50,32,16,${0.35 + ember * 0.3})`);
    ctx.fillStyle = sg;
    ctx.fillRect(fl + bodyLen - 22 * s, -w / 2, 22 * s, w);
  }

  // ---- ash + coal ----
  const ax = fl + bodyLen;
  const ag = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
  ag.addColorStop(0, '#9a948e');
  ag.addColorStop(0.4, '#6f6a66');
  ag.addColorStop(1, '#413d3a');
  ctx.fillStyle = ag;
  ctx.fillRect(ax, -w / 2, ashLen, w);
  // ash cracks
  ctx.strokeStyle = 'rgba(30,26,24,.5)';
  ctx.lineWidth = 1 * s;
  for (let i = 1; i < 4; i++) {
    const cx = ax + (ashLen * i) / 4;
    ctx.beginPath();
    ctx.moveTo(cx, -w / 2);
    ctx.lineTo(cx + 2 * s, w / 2);
    ctx.stroke();
  }

  // coal face
  const ex = L, hot = 0.25 + ember * 0.75;
  const eg = ctx.createRadialGradient(ex - w * 0.1, 0, 1, ex - w * 0.1, 0, w * 0.85);
  eg.addColorStop(0, `rgba(255,${210 + 40 * hot | 0},150,${0.85 * hot + 0.15})`);
  eg.addColorStop(0.35, `rgba(255,${120 + 60 * hot | 0},30,${0.9 * hot + 0.1})`);
  eg.addColorStop(1, `rgba(120,30,0,${0.25 + hot * 0.3})`);
  ctx.fillStyle = eg;
  ctx.beginPath();
  ctx.ellipse(ex - w * 0.08, 0, w * 0.5, w * 0.5, 0, 0, TAU);
  ctx.fill();

  // lips shadow: darkens the end that disappears between them
  if (cig.dock > 0.01) {
    const sh = ctx.createLinearGradient(-w * 0.3, 0, fl * 1.5, 0);
    sh.addColorStop(0, `rgba(12,8,6,${0.72 * cig.dock})`);
    sh.addColorStop(0.45, `rgba(12,8,6,${0.4 * cig.dock})`);
    sh.addColorStop(1, 'rgba(12,8,6,0)');
    ctx.fillStyle = sh;
    roundRect(ctx, -w * 0.3, -w / 2, fl * 1.5 + w * 0.3, w, w / 2);
    ctx.fill();
  }

  ctx.restore();

  emberBloom(ctx, cig, w, ember);
}

/** the soft orange halo around the coal, drawn in world space so it stays round */
function emberBloom (ctx, cig, w, ember) {
  if (ember <= 0.02) return;
  const tip = cigTip(cig);
  const R = w * (1.6 + ember * 2.6);
  const g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, R);
  g.addColorStop(0, `rgba(255,170,80,${0.42 * ember})`);
  g.addColorStop(0.4, `rgba(255,90,20,${0.2 * ember})`);
  g.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = cig.alpha ?? 1;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, R, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * A bidi: a short cone of tendu leaf, tied off with thread at the wide end,
 * no filter. Drawn as a tapered path rather than the cigarette's straight tube.
 */
function drawBidi (ctx, cig) {
  const t = cig.type;
  const s = cig.scale ?? 1;
  const sq = cig.squash ?? 1;
  const L = cigDrawLength(cig);
  const w = t.width * s;
  const tie = t.filter * s * sq;
  const ember = cig.ember ?? 0;
  const ashLen = (4 + (cig.ash ?? 0) * 24) * s * sq;
  const taper = t.taper ?? 0.6;
  // half-height at distance x along the roll
  const hw = x => (w / 2) * (1 - (1 - taper) * Math.min(1, x / Math.max(1, L)));

  const cone = (x0, x1) => {
    ctx.beginPath();
    ctx.moveTo(x0, -hw(x0));
    ctx.lineTo(x1, -hw(x1));
    ctx.lineTo(x1, hw(x1));
    ctx.lineTo(x0, hw(x0));
    ctx.closePath();
  };

  ctx.save();
  ctx.globalAlpha = cig.alpha ?? 1;
  ctx.translate(cig.x, cig.y);
  ctx.rotate(cig.angle);

  // shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = 13 * s;
  ctx.shadowOffsetY = 5 * s;
  ctx.fillStyle = '#000';
  cone(0, L); ctx.fill();
  ctx.restore();

  // leaf body
  const bodyEnd = Math.max(tie, L - ashLen);
  const lg = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
  lg.addColorStop(0, lighten(t.paper, 26));
  lg.addColorStop(0.4, t.paper);
  lg.addColorStop(1, t.paperShade);
  ctx.fillStyle = lg;
  cone(0, bodyEnd); ctx.fill();

  // leaf mottling and the rolled seam
  ctx.save();
  cone(0, bodyEnd); ctx.clip();
  ctx.strokeStyle = 'rgba(30,17,6,.4)';
  ctx.lineWidth = 1.1 * s;
  for (let i = 0; i < 5; i++) {
    const x = tie + (bodyEnd - tie) * (0.1 + i * 0.19);
    ctx.beginPath();
    ctx.moveTo(x, -w / 2);
    ctx.lineTo(x + 5 * s, w / 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,220,170,.13)';
  ctx.fillRect(0, -w * 0.30, bodyEnd, 1.6 * s);
  ctx.restore();

  // thread tied round the wide end
  ctx.fillStyle = t.filterColor;
  cone(0, tie); ctx.fill();
  ctx.strokeStyle = t.filterDark;
  ctx.lineWidth = 1.2 * s;
  for (let i = 0; i < 4; i++) {
    const x = tie * (0.16 + i * 0.24);
    ctx.beginPath();
    ctx.moveTo(x, -hw(x));
    ctx.lineTo(x + 2.5 * s, hw(x));
    ctx.stroke();
  }

  // ash + coal
  const ag = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
  ag.addColorStop(0, '#9a948e');
  ag.addColorStop(0.4, '#6b6663');
  ag.addColorStop(1, '#3c3835');
  ctx.fillStyle = ag;
  cone(bodyEnd, L); ctx.fill();

  const ex = L, hot = 0.25 + ember * 0.75, tw = hw(L) * 2;
  const eg = ctx.createRadialGradient(ex - tw * 0.2, 0, 1, ex - tw * 0.2, 0, tw * 0.9);
  eg.addColorStop(0, `rgba(255,${215 + 40 * hot | 0},160,${0.85 * hot + 0.15})`);
  eg.addColorStop(0.35, `rgba(255,${110 + 60 * hot | 0},25,${0.9 * hot + 0.1})`);
  eg.addColorStop(1, `rgba(110,26,0,${0.25 + hot * 0.3})`);
  ctx.fillStyle = eg;
  ctx.beginPath();
  ctx.ellipse(ex - tw * 0.15, 0, tw * 0.55, tw * 0.55, 0, 0, TAU);
  ctx.fill();

  if (cig.dock > 0.01) {
    const sh = ctx.createLinearGradient(-w * 0.3, 0, tie * 2.2, 0);
    sh.addColorStop(0, `rgba(12,8,6,${0.72 * cig.dock})`);
    sh.addColorStop(0.45, `rgba(12,8,6,${0.4 * cig.dock})`);
    sh.addColorStop(1, 'rgba(12,8,6,0)');
    ctx.fillStyle = sh;
    cone(-w * 0.3, tie * 2.2); ctx.fill();
  }

  ctx.restore();
  emberBloom(ctx, cig, w * 0.8, ember);
}

export function roundRect (ctx, x, y, w, h, r) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function lighten (hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + amt);
  const g = Math.min(255, ((n >> 8) & 255) + amt);
  const b = Math.min(255, (n & 255) + amt);
  return `rgb(${r},${g},${b})`;
}
