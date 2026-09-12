/* app.js — Vapor: grab a virtual cigarette with a pinch, draw on it with your
   lips, take it away and blow real smoke.  */

import { Vision, HAND_BONES } from './vision.js';
import { SmokeSystem } from './smoke.js';
import { CIG_TYPES, MAX_LEN, drawCigarette, cigTip, cigLength, cigDrawLength, roundRect } from './cigarettes.js';

const $ = id => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const TAU = Math.PI * 2;

const video = $('video');
const canvas = $('scene');
const ctx = canvas.getContext('2d', { alpha: false });

const layer = document.createElement('canvas');
const layerCtx = layer.getContext('2d');

const vision = new Vision();
const smoke = new SmokeSystem(1100);

const opt = {
  grip: 0.1,
  occlude: true,
  density: 1.2,
  sens: 0.22,
  skeleton: false,
  mirror: true
};

/* ---------------------------------------------------------- room light
   A tiny copy of the video frame is enough to know what colour the room is.
   Smoke lit by a warm lamp is warm; pure white smoke is the main thing that
   reads as pasted on top of the picture rather than being in it. */
const probe = document.createElement('canvas');
probe.width = 48; probe.height = 27;
const probeCtx = probe.getContext('2d', { willReadFrequently: true });

function sampleRoom () {
  try {
    probeCtx.drawImage(video, 0, 0, probe.width, probe.height);
    const d = probeCtx.getImageData(0, 0, probe.width, probe.height).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return { r: r / n, g: g / n, b: b / n };
  } catch (e) { return null; }
}

/** blend a smoke colour toward the light in the room, then quantise it so the
 *  sprite cache holds a handful of variants instead of a new one every frame */
function litTint (hex) {
  const n = parseInt(hex.slice(1), 16);
  const k = 0.42;
  const q = v => Math.round(Math.min(255, Math.max(0, v)) / 24) * 24;
  return 'rgb(' + q(lerp((n >> 16) & 255, app.room.r, k)) + ',' +
                  q(lerp((n >> 8) & 255, app.room.g, k)) + ',' +
                  q(lerp(n & 255, app.room.b, k)) + ')';
}

const app = {
  running: false,
  W: 1280, H: 720, S: 1, Sc: 1,
  room: { r: 150, g: 150, b: 150 }, lum: 0.6, roomAt: 0,
  t: 0, last: 0,
  cigs: [],
  nextId: 1,
  grabCool: {},               // holderId -> seconds until it can grab again
  pointer: { down: false, x: 0, y: 0, px: 0, py: 0 },
  keys: { suck: false, open: false },
  tray: [],
  flash: [0, 0, 0],
  face: null,
  hands: [],
  hudCharge: 0,
  // what is actually held in your lungs — survives dropping the cigarette
  lung: { charge: 0, type: CIG_TYPES[0] },
  blowT: 0, nosing: 0,
  fps: 0
};

/* ------------------------------------------------------------------ tray */

function layoutTray () {
  const { W, H } = app;
  const n = CIG_TYPES.length;
  const x = W - W * 0.115;
  const gap = Math.min(H * 0.235, H * 0.82 / n);
  const cy = H * 0.5;
  const r = Math.min(Math.min(W, H) * 0.115, gap * 0.62);
  app.tray = CIG_TYPES.map((type, i) => ({
    type, i, x, r,
    y: cy + (i - (n - 1) / 2) * gap
  }));
  app.flash = CIG_TYPES.map(() => 0);
}

function drawTray (dt) {
  const { S } = app;
  for (const slot of app.tray) {
    const bob = Math.sin(app.t * 1.3 + slot.i * 1.9) * 5 * S;
    const tilt = Math.sin(app.t * 0.8 + slot.i * 2.4) * 0.06;
    const near = nearestPinchDist(slot.x, slot.y);
    const hot = clamp(1 - near / (slot.r * 1.45));
    app.flash[slot.i] = Math.max(0, app.flash[slot.i] - dt * 2.4);
    const flash = app.flash[slot.i];

    const w = slot.r * 1.55, h = slot.r * 1.15;
    const bx = slot.x - w / 2, by = slot.y - h / 2 + bob;

    ctx.save();
    // card
    ctx.globalAlpha = 0.42 + hot * 0.3 + flash * 0.4;
    ctx.fillStyle = '#0b0b12';
    roundRect(ctx, bx, by, w, h, 18 * S);
    ctx.fill();
    ctx.globalAlpha = 0.5 + hot * 0.5 + flash;
    ctx.strokeStyle = hot > 0.02
      ? `rgba(255,150,70,${0.35 + hot * 0.65})`
      : 'rgba(255,255,255,.18)';
    ctx.lineWidth = (1.2 + hot * 1.6) * S;
    roundRect(ctx, bx, by, w, h, 18 * S);
    ctx.stroke();
    ctx.restore();

    // halo when a pinch approaches
    if (hot > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(slot.x, slot.y + bob, 0, slot.x, slot.y + bob, slot.r * 1.3);
      g.addColorStop(0, `rgba(255,140,60,${0.16 * hot})`);
      g.addColorStop(1, 'rgba(255,110,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(slot.x, slot.y + bob, slot.r * 1.3, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // the cigarette itself, drawn small and angled
    const sc = (slot.r * 1.25) / MAX_LEN;
    const ang = -0.42 + tilt;
    const L = slot.type.len * sc;
    drawCigarette(ctx, {
      type: slot.type,
      x: slot.x - Math.cos(ang) * L / 2,
      y: slot.y + bob - Math.sin(ang) * L / 2 - h * 0.08,
      angle: ang, burn: 0, ember: 0, scale: sc, alpha: 0.95
    });

    // label
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255,255,255,${0.55 + hot * 0.45})`;
    ctx.font = `600 ${Math.round(12 * S * 1.05)}px ui-sans-serif,system-ui,sans-serif`;
    ctx.fillText(slot.type.name.toUpperCase(), slot.x, by + h - 16 * S);
    ctx.fillStyle = `rgba(255,255,255,${0.22 + hot * 0.25})`;
    ctx.font = `${Math.round(9.5 * S * 1.05)}px ui-sans-serif,system-ui,sans-serif`;
    ctx.fillText(slot.type.note, slot.x, by + h - 4 * S);
    ctx.restore();
  }
}

function nearestPinchDist (x, y) {
  let best = 1e9;
  for (const h of app.hands) {
    const p = toPx(h.pinch);
    best = Math.min(best, dist(p.x, p.y, x, y));
  }
  if (app.pointer.down) best = Math.min(best, dist(app.pointer.x, app.pointer.y, x, y));
  return best;
}

/* ------------------------------------------------------------- holders */

const toPx = p => ({ x: p.x * app.W, y: p.y * app.H });

const holderVel = new Map();

function holders (dt) {
  const list = [];
  for (const h of app.hands) {
    const p = toPx(h.grab || h.pinch);
    const w = toPx(h.wrist);
    list.push({
      id: 'h:' + h.side,
      x: p.x, y: p.y,
      angle: h.holdAngle ?? Math.atan2(p.y - w.y, p.x - w.x),
      scissor: h.scissor,
      pinching: h.pinching,               // two fingers deliberately together
      holding: h.gripping ?? h.pinching,   // that, or simply a hand not open
      strength: h.pinchStrength,
      fingers: h.fingers,
      open: h.open ?? 0,
      openHand: !!h.openHand,
      tip: toPx(h.indexTip)
    });
  }
  if (app.pointer.down || app.pointer.wasDown) {
    list.push({
      id: 'ptr',
      x: app.pointer.x, y: app.pointer.y,
      angle: app.pointer.angle ?? -0.5,
      pinching: app.pointer.down,
      holding: app.pointer.down,
      strength: app.pointer.down ? 1 : 0,
      open: app.pointer.down ? 0 : 1,
      openHand: !app.pointer.down,
      tip: { x: app.pointer.x, y: app.pointer.y }
    });
  }

  // per-holder velocity, smoothed a little so one noisy frame is not a flick
  for (const h of list) {
    const prev = holderVel.get(h.id);
    if (prev && dt > 0) {
      const vx = (h.x - prev.x) / dt, vy = (h.y - prev.y) / dt;
      h.vx = lerp(prev.vx, vx, 0.55);
      h.vy = lerp(prev.vy, vy, 0.55);
    } else { h.vx = 0; h.vy = 0; }
    h.speed = Math.hypot(h.vx, h.vy);
    holderVel.set(h.id, { x: h.x, y: h.y, vx: h.vx, vy: h.vy });
  }
  for (const id of [...holderVel.keys()]) {
    if (!list.some(h => h.id === id)) holderVel.delete(id);
  }
  return list;
}

function holderById (id) { return app.holders.find(h => h.id === id); }

/* --------------------------------------------------------------- mouth */

function mouthState () {
  const f = app.face;
  if (f) {
    return {
      x: f.mouth.x * app.W,
      y: f.mouth.y * app.H,
      r: Math.max(46, f.scale * app.W * 0.62),
      roll: f.roll,
      yaw: f.yaw ?? 0,
      nose: { x: f.nose.x * app.W, y: f.nose.y * app.H },
      suck: app.keys.suck ? 1 : f.suck,
      open: app.keys.open ? 1 : f.open,
      real: true
    };
  }
  // no face: a virtual mouth keeps the mouse/keyboard fallback usable
  return {
    x: app.W * 0.5, y: app.H * 0.62,
    r: Math.min(app.W, app.H) * 0.12,
    roll: 0, yaw: 0,
    nose: { x: app.W * 0.5, y: app.H * 0.52 },
    suck: app.keys.suck ? 1 : 0,
    open: app.keys.open ? 1 : 0,
    real: false
  };
}

/* ---------------------------------------------------------- cigarettes */

function spawnCig (type, holder) {
  if (app.cigs.filter(c => c.state !== 'dropped').length >= 2) return null;
  const cig = {
    id: app.nextId++,
    type,
    x: holder.x, y: holder.y,
    angle: holder.angle,
    scale: app.Sc,
    burn: 0, ash: 0, ember: 0.35, emberTarget: 0.35,
    squash: 1, dock: 0, ashHint: 0, ashCool: 0, grip: GRIP_GRACE,
    alpha: 0, lit: true,
    state: 'held', holderId: holder.id,
    vx: 0, vy: 0, spin: 0,
    wisp: 0, drawGlow: 0
  };
  app.cigs.push(cig);
  return cig;
}

/** the butt of the cigarette when held: sits a little behind the pinch */
function placeHeld (cig, h, dt) {
  const L = cigDrawLength(cig);
  const back = L * 0.3;
  // Clamped between two fingers it simply lies along them — that is what the
  // fingers are doing. Only a cigarette pinched at the tips hangs, so only
  // that one gets the droop.
  const a = h.scissor ? h.angle : coalDown(h.angle, cig.angle);
  const tx = h.x - Math.cos(a) * back;
  const ty = h.y - Math.sin(a) * back;
  const k = 1 - Math.pow(0.0008, dt);     // critically smooth follow
  cig.x = lerp(cig.x, tx, k);
  cig.y = lerp(cig.y, ty, k);
  cig.angle = angLerp(cig.angle, a, k);
}

/* A cigarette held in the lips points mostly AT the camera, so on screen it
   reads as a short stub angled down and out from the corner of the mouth —
   not a full-length stick lying across the face. */
const DOCK_TILT = 0.92;      // ~53 deg below horizontal
const DOCK_SQUASH = 0.46;    // foreshortening from pointing at the lens

function placeDocked (cig, m, dt) {
  const k = 1 - Math.pow(0.0015, dt);
  const off = cig.dockSide ?? 1;
  // turning your head swings the stick with it and foreshortens it further
  const swing = (m.yaw ?? 0) * 0.5 * off;
  const a = off === 1 ? m.roll + DOCK_TILT - swing : m.roll + Math.PI - DOCK_TILT + swing;
  // sit the butt at the lip line, tucked toward the chosen corner
  const cos = Math.cos(m.roll), sin = Math.sin(m.roll);
  const ox = m.r * 0.22 * off, oy = m.r * 0.05;
  const bx = m.x + cos * ox - sin * oy;
  const by = m.y + sin * ox + cos * oy;
  cig.x = lerp(cig.x, bx, k);
  cig.y = lerp(cig.y, by, k);
  cig.angle = angLerp(cig.angle, a, k);
}

/* The coal always rides below the fingers, the way a real one does — ash falls
   away from your hand and the smoke rises past it. Rather than clamping (which
   would flatten every hand pose to the same angle) the hand's pitch is remapped
   onto a band that stays below level: pointing your hand up gives a shallow
   droop, pointing it down gives a steep one. */
function coalDown (a, prev) {
  const c = Math.cos(a);
  const tilt = Math.asin(lerp(0.20, 0.95, (Math.sin(a) + 1) / 2));
  // near-vertical hands have an unstable left/right sign — keep the last one
  const right = Math.abs(c) < 0.16 && prev !== undefined ? Math.cos(prev) >= 0 : c >= 0;
  return right ? tilt : Math.PI - tilt;
}

function angLerp (a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}

/* ----------------------------------------------------------------- ash */

/** shortest distance from a point to the cigarette, treated as a segment */
function distToCig (cig, px, py) {
  const tip = cigTip(cig);
  const dx = tip.x - cig.x, dy = tip.y - cig.y;
  const len2 = dx * dx + dy * dy || 1;
  let u = ((px - cig.x) * dx + (py - cig.y) * dy) / len2;
  u = clamp(u);
  return dist(px, py, cig.x + dx * u, cig.y + dy * u);
}

/** the point the ash actually sits at, three quarters of the way out */
function ashPoint (cig) {
  const tip = cigTip(cig);
  return { x: lerp(cig.x, tip.x, 0.82), y: lerp(cig.y, tip.y, 0.82) };
}

function knockAsh (cig, msg) {
  if (cig.ash < 0.12) return false;
  const p = ashPoint(cig);
  const amount = cig.ash;
  const S = app.Sc;

  // the clump breaks off and falls
  for (let i = 0; i < Math.round(9 + amount * 16); i++) {
    smoke.emit({
      x: p.x, y: p.y, count: 1, scaleCount: false,
      jitter: cig.type.width * 0.5 * S,
      dir: Math.PI / 2 + (Math.random() - 0.5) * 1.1,
      spread: 0.3,
      speed: (30 + Math.random() * 70) * S,
      size: (2.2 + Math.random() * 3.4) * S * (0.7 + amount),
      grow: 1.5 * S,
      life: 0.85 + Math.random() * 0.7,
      alpha: 0.5 + Math.random() * 0.35,
      rise: -900 * S, swirl: 10 * S,
      drag: 0.99, drag2: 0.003, thin: 0.45, fieldScale: S,
      tint: litTint(Math.random() < 0.4 ? '#4a4643' : '#8d8880')
    });
  }
  // and a little grey dust hangs where it broke
  smoke.emit({
    x: p.x, y: p.y, count: Math.round(5 + amount * 6), scaleCount: false,
    jitter: 5 * S, dir: Math.PI / 2, spread: 1.1,
    speed: 26 * S, size: 5 * S, grow: 20 * S,
    life: 1.5, alpha: 0.3, rise: 4 * S, swirl: 40 * S,
    drag: 0.95, drag2: 0.006, thin: 1.0, fieldScale: S,
    tint: litTint('#b8b2aa')
  });

  cig.ash = 0;
  cig.ashCool = 0.45;
  if (msg) toast(msg);
  return true;
}

/** a sharp flick of the holding hand, or a tap from the other hand, ashes it */
function ashGestures () {
  for (const cig of app.cigs) {
    if (cig.state === 'dropped' || cig.ash < 0.12 || cig.ashCool > 0) continue;

    // flick: the hand holding it jerks hard, not straight up
    const h = cig.holderId ? holderById(cig.holderId) : null;
    if (h && h.speed > 1500 * app.S && h.vy > -0.35 * h.speed) {
      knockAsh(cig, 'ash flicked off');
      continue;
    }
    // tap: a finger from any other hand strikes the stick
    for (const o of app.holders) {
      if (o.id === cig.holderId || !o.tip) continue;
      if (o.speed > 620 * app.S && distToCig(cig, o.tip.x, o.tip.y) < 34 * app.S) {
        knockAsh(cig, 'tapped the ash off');
        break;
      }
    }
  }
}

/* ------------------------------------------------------------ gestures */

/* Reaching for one used to need a clean open-to-pinched transition in exactly
   the right place, which is a lot to ask of a hand tracker. Now it is a dwell:
   come in from any direction with any two fingers together, and if there is
   something under them you get it. A short cooldown afterwards stops one
   gesture emptying the whole tray. */
function handleGrabs (m, dt) {
  for (const h of app.holders) {
    app.grabCool[h.id] = Math.max(0, (app.grabCool[h.id] || 0) - dt);
    // a hand splayed wide is letting go, not reaching for something, even if
    // two of its fingers happen to fall close enough to read as a pinch
    if (!h.pinching || h.openHand || app.grabCool[h.id] > 0) continue;
    if (app.cigs.some(c => c.state === 'held' && c.holderId === h.id)) continue;
    {
      // 1. pick an existing cigarette back up (docked or free)
      let picked = null, bestD = 1e9;
      for (const c of app.cigs) {
        if (c.state === 'dropped' || c.holderId === h.id) continue;
        // distance to the stick itself, so a long thin one is no harder to
        // catch than a short fat one
        const d = Math.min(distToCig(c, h.x, h.y),
                           h.tip ? distToCig(c, h.tip.x, h.tip.y) : 1e9);
        if (d < Math.max(78 * app.Sc, m.r * 0.95) && d < bestD) { bestD = d; picked = c; }
      }
      if (picked) {
        picked.state = 'held';
        picked.holderId = h.id;
        picked.grip = GRIP_GRACE;
        app.grabCool[h.id] = 0.65;
        toast('picked it back up');
        continue;
      }
      // 2. otherwise pull a fresh one from the tray
      for (const slot of app.tray) {
        const reach = Math.min(dist(h.x, h.y, slot.x, slot.y),
                               h.tip ? dist(h.tip.x, h.tip.y, slot.x, slot.y) : 1e9);
        if (reach < slot.r * 1.45) {
          const c = spawnCig(slot.type, h);
          if (c) {
            app.flash[slot.i] = 1;
            app.grabCool[h.id] = 0.65;
            toast(`${slot.type.name} — bring it to your lips`);
          } else {
            toast('both hands full');
          }
          break;
        }
      }
    }
  }
}

/** how long a grip survives lost tracking or a flickering pinch */
const GRIP_GRACE = 0.34;

function releaseCig (cig, m, why) {
  cig.grip = GRIP_GRACE;
  if (cig.holderId) app.grabCool[cig.holderId] = 0.6;
  const nearMouth = m.real && dist(cig.x, cig.y, m.x, m.y) < m.r * 1.25;
  if (nearMouth) {
    cig.state = 'docked';
    cig.holderId = null;
    cig.dockSide = cig.x >= m.x ? 1 : -1;
    toast('hanging off your lip — purse to draw');
  } else {
    cig.state = 'dropped';
    cig.holderId = null;
    cig.vx = (Math.random() - 0.5) * 90;
    cig.vy = -40;
    cig.spin = (Math.random() - 0.5) * 5;
    if (why === 'open') toast('let it go');
  }
}

/* ---------------------------------------------------------------- loop */

function step (dt) {
  const m = mouthState();

  /* Lean toward the camera and your face grows; the cigarette in your hand
     has to grow with it or it reads as a sticker on the lens. Eye separation
     is the yardstick — 0.115 of frame width is roughly arm's length. */
  const depth = app.face ? clamp(app.face.scale / 0.115, 0.62, 1.9) : 1;
  app.Sc = lerp(app.Sc, app.S * depth, 1 - Math.pow(0.02, dt));

  // the room's colour changes slowly, so there is no need to look every frame
  app.roomAt -= dt;
  if (app.roomAt <= 0) {
    app.roomAt = 0.25;
    const c = sampleRoom();
    if (c) {
      const k = 0.35;
      app.room.r = lerp(app.room.r, c.r, k);
      app.room.g = lerp(app.room.g, c.g, k);
      app.room.b = lerp(app.room.b, c.b, k);
      app.lum = clamp((0.2126 * app.room.r + 0.7152 * app.room.g + 0.0722 * app.room.b) / 255, 0.12, 1);
    }
  }
  app.holders = holders(dt);
  handleGrabs(m, dt);
  ashGestures();

  let anyInhale = 0, anyExhale = 0;
  app.cigAtMouth = false;

  for (let i = app.cigs.length - 1; i >= 0; i--) {
    const cig = app.cigs[i];
    const t = cig.type;
    cig.scale = app.Sc;
    cig.alpha = Math.min(1, cig.alpha + dt * 5);

    // ease between "held in the hand" and "seated in the lips"
    const dockT = cig.state === 'docked' ? 1 : 0;
    const kd = 1 - Math.pow(0.004, dt);
    cig.dock = lerp(cig.dock, dockT, kd);
    cig.squash = lerp(cig.squash, 1 - (1 - DOCK_SQUASH) * dockT, kd);

    if (cig.state === 'held') {
      const h = holderById(cig.holderId);
      /* Hand tracking blinks — a fast move or a tilted palm loses the hand for
         a frame or two, and the pinch gap flickers across its threshold. Letting
         go on any one of those frames is what made a cigarette so hard to keep
         hold of, so a lapse has to persist before the fingers actually open.
         Spreading your hand wide is unambiguous, though, so that releases at
         once — no waiting. */
      if (!h) {
        cig.grip -= dt;
        if (cig.grip <= 0) releaseCig(cig, m, 'lost');
      } else {
        placeHeld(cig, h, dt);
        if (h.openHand) {
          releaseCig(cig, m, 'open');
        } else if (h.holding) {
          cig.grip = GRIP_GRACE;
        } else {
          cig.grip -= dt;
          if (cig.grip <= 0) releaseCig(cig, m, 'slip');
        }
      }
    } else if (cig.state === 'docked') {
      placeDocked(cig, m, dt);
    } else if (cig.state === 'dropped') {
      cig.vy += 900 * dt;
      cig.x += cig.vx * dt;
      cig.y += cig.vy * dt;
      cig.angle += cig.spin * dt;
      cig.alpha -= dt * 1.1;
      cig.ember = Math.max(0, cig.ember - dt);
      if (cig.alpha <= 0 || cig.y > app.H + 200) { app.cigs.splice(i, 1); continue; }
    }

    /* ---- draw / inhale ---------------------------------------------- */
    const butt = { x: cig.x, y: cig.y };
    const dMouth = dist(butt.x, butt.y, m.x, m.y);
    const atMouth = cig.state !== 'dropped' && dMouth < m.r * 1.15;
    const suckOver = (m.suck - opt.sens) / Math.max(0.08, 0.62 - opt.sens);
    const inhaling = atMouth && suckOver > 0 && cig.burn < 1;
    const intensity = inhaling ? clamp(suckOver) : 0;
    anyInhale = Math.max(anyInhale, intensity);

    cig.drawGlow = lerp(cig.drawGlow, intensity, 1 - Math.pow(0.002, dt));
    cig.emberTarget = cig.state === 'dropped' ? 0
      : 0.3 + 0.7 * cig.drawGlow + Math.sin(app.t * 9 + cig.id) * 0.04;
    cig.ember = lerp(cig.ember, cig.emberTarget, 1 - Math.pow(0.02, dt));

    if (inhaling) {
      app.lung.charge = clamp(app.lung.charge + intensity * 0.62 * dt);
      app.lung.type = t;
      cig.burn = clamp(cig.burn + t.burnRate * (0.5 + intensity * 1.8) * dt);
      // roughly three or four decent drags builds a full head of ash
      cig.ash = Math.min(1.3, cig.ash + intensity * (t.ashRate ?? 0.24) * dt);
    } else if (cig.lit && cig.state !== 'dropped') {
      cig.burn = clamp(cig.burn + t.idleBurn * dt);
    }

    cig.ashCool = Math.max(0, cig.ashCool - dt);
    cig.ashHint = lerp(cig.ashHint, cig.ash > 0.55 && cig.state !== 'dropped' ? 1 : 0,
                       1 - Math.pow(0.05, dt));
    if (cig.ash >= 1.3 && cig.state !== 'dropped') {
      knockAsh(cig, 'the ash fell on its own');
    }

    if (cig.burn >= 1 && cig.state !== 'dropped') {
      toast('burnt down to the filter');
      cig.state = 'dropped';
      cig.holderId = null;
      cig.vx = 0; cig.vy = 0; cig.spin = 2;
    }

    /* ---- ember wisp -------------------------------------------------- */
    const tip = cigTip(cig);
    if (cig.ember > 0.05) {
      cig.wisp += dt * t.wispRate * (0.45 + cig.drawGlow * 2.2) * opt.density;
      while (cig.wisp >= 1) {
        cig.wisp -= 1;
        smoke.emit({
          x: tip.x, y: tip.y - 2 * app.Sc,
          count: 1, scaleCount: false, jitter: 2.5 * app.Sc,
          dir: -Math.PI / 2 + (Math.random() - 0.5) * 0.5,
          spread: 0.25,
          speed: 24 * app.Sc, size: 3.2 * app.Sc, grow: 13 * app.Sc,
          life: 3.0,
          alpha: (0.11 + cig.drawGlow * 0.1) * 2.1 * (0.55 + app.lum * 0.6),
          rise: 52 * app.Sc, swirl: 46 * app.Sc,
          drag: 0.96, drag2: 0.004, thin: 0.85, laminar: 0.75, fieldScale: app.Sc,
          tint: litTint(t.tint)
        });
      }
    }

    if (atMouth) app.cigAtMouth = true;
  }
  /* ---- exhale: one plume, from your mouth, once the cigarette is clear -- */
  {
    const t = app.lung.type;
    const openOver = (m.open - 0.15) / 0.45;
    const blowing = !app.cigAtMouth && app.lung.charge > 0.03 && openOver > 0;
    if (blowing) {
      const power = clamp(openOver);
      anyExhale = power;
      app.blowT += dt;
      // you blow hardest at the start: a fast narrow jet that decays into a
      // slow, wide, buoyant plume as your lungs empty
      const jet = Math.exp(-app.blowT * 1.5);
      const drain = Math.min(app.lung.charge, dt * (0.5 + power * 0.9));
      app.lung.charge -= drain;
      app.exhaling += t.puffCount * drain * 3.2 * (0.5 + power) * opt.density;
      while (app.exhaling >= 1) {
        app.exhaling -= 1;
        const spread = 0.26 + (1 - jet) * 0.48;
        const dir = Math.PI / 2 + m.roll * 0.7 + (m.yaw ?? 0) * 0.55;
        smoke.emit({
          x: m.x + Math.cos(dir) * m.r * 0.25,
          y: m.y + m.r * 0.16 + Math.sin(dir) * m.r * 0.25,
          count: 1, scaleCount: false,
          jitter: m.r * 0.3,
          dir, spread,
          speed: t.puffSpeed * app.Sc * (0.5 + power * 0.7) * (0.45 + jet * 0.9),
          size: t.puffSize * 1.1 * app.Sc,
          grow: t.puffSize * 1.35 * app.Sc,
          life: t.puffLife,
          alpha: t.alpha * 0.85 * (0.5 + power * 0.6) * (0.55 + app.lum * 0.6),
          rise: 74 * app.Sc, swirl: 58 * app.Sc,
          drag: 0.95, drag2: 0.006, thin: 0.9, fieldScale: app.Sc,
          tint: litTint(t.tint)
        });
      }
    } else {
      app.exhaling = 0;
      app.blowT = 0;
    }

    /* Mouth shut on a full chest is how most of it actually comes out: two
       thin, fast streams straight down from the nostrils. */
    const noseBlow = !app.cigAtMouth && !blowing && app.lung.charge > 0.12 &&
                     m.real && m.open < 0.12 && m.suck < 0.2;
    if (noseBlow) {
      const drain = Math.min(app.lung.charge, dt * 0.3);
      app.lung.charge -= drain;
      app.nosing += t.puffCount * drain * 2.6 * opt.density;
      const cos = Math.cos(m.roll), sin = Math.sin(m.roll);
      // nostrils sit between the nose tip and the top lip, a little apart
      const bx = lerp(m.nose.x, m.x, 0.42), by = lerp(m.nose.y, m.y, 0.42);
      while (app.nosing >= 1) {
        app.nosing -= 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        const off = m.r * 0.17 * side;
        const dir = Math.PI / 2 + m.roll * 0.8 + (m.yaw ?? 0) * 0.5 + side * 0.12;
        smoke.emit({
          x: bx + cos * off, y: by + sin * off,
          count: 1, scaleCount: false, jitter: m.r * 0.05,
          dir, spread: 0.16,
          speed: t.puffSpeed * 0.55 * app.Sc,
          size: t.puffSize * 0.42 * app.Sc,
          grow: t.puffSize * 1.5 * app.Sc,
          life: t.puffLife * 0.85,
          alpha: t.alpha * 0.7 * (0.55 + app.lum * 0.6),
          rise: 60 * app.Sc, swirl: 44 * app.Sc,
          drag: 0.95, drag2: 0.008, thin: 0.95, laminar: 0.22, fieldScale: app.Sc,
          tint: litTint(t.tint)
        });
      }
      anyExhale = Math.max(anyExhale, 0.35);
    } else {
      app.nosing = 0;
    }
  }

  // a leftover lungful seeps away slowly even if you never open your mouth
  app.lung.charge = Math.max(0, app.lung.charge - dt * 0.02);
  app.hudCharge = app.lung.charge;
  smoke.density = 1;
  smoke.wind = Math.sin(app.t * 0.21) * 5 * app.S;
  // sweep a hand through your own cloud and it should move
  smoke.setStirrers(app.holders
    .filter(h => h.speed > 120 * app.S)
    .map(h => ({ x: h.x, y: h.y, vx: h.vx * 0.75, vy: h.vy * 0.75, r: 130 * app.Sc })));
  smoke.update(dt);

  updateHud(anyInhale, anyExhale, m);
}

/* -------------------------------------------------------------- render */

function render (dt) {
  const { W, H } = app;
  ctx.save();
  if (opt.mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0, W, H);
  ctx.restore();

  // gentle filmic darkening so smoke and embers read against the camera feed
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  /* The coal is a live coal: it should throw light on whatever is near it.
     Drawn over the video but under the cigarette and the smoke, so your hand
     and face catch the glow and the smoke drifts through it. */
  for (const c of app.cigs) {
    if (c.ember < 0.08) continue;
    const tip = cigTip(c);
    const flick = 0.86 + Math.sin(app.t * 17 + c.id * 3) * 0.09 + Math.sin(app.t * 7.3) * 0.05;
    const heat = c.ember * flick;
    const R = (90 + c.drawGlow * 150) * app.Sc * (0.7 + heat * 0.6);
    const g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, R);
    g.addColorStop(0, `rgba(255,146,54,${0.3 * heat * (c.alpha ?? 1)})`);
    g.addColorStop(0.35, `rgba(255,96,18,${0.13 * heat * (c.alpha ?? 1)})`);
    g.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(tip.x, tip.y, R, 0, TAU); ctx.fill();
    ctx.restore();
  }

  drawTray(dt);
  drawGrabPoints();

  if (opt.skeleton) drawTracking();

  for (const c of app.cigs) drawCigarette(ctx, c);

  for (const c of app.cigs) drawAshHint(c);

  /* Smoke that has risen past your head belongs behind it. Draw that part
     into its own layer, punch your silhouette out of it, and lay it down
     before the rest — so a plume climbing past your face goes behind you
     while the one you have just blown stays in front. */
  const mouth = mouthState();
  const behindLine = mouth.y - mouth.r * 1.9;
  const isBehind = p => p.y < behindLine;

  if (opt.occlude && app.mask && mouth.real) {
    if (layer.width !== (W >> 1) || layer.height !== (H >> 1)) {
      layer.width = W >> 1; layer.height = H >> 1;
    }
    layerCtx.setTransform(1, 0, 0, 1, 0, 0);
    layerCtx.clearRect(0, 0, layer.width, layer.height);
    smoke.draw(layerCtx, isBehind, 0.5);

    layerCtx.globalCompositeOperation = 'destination-out';
    layerCtx.save();
    if (opt.mirror) { layerCtx.translate(layer.width, 0); layerCtx.scale(-1, 1); }
    layerCtx.drawImage(app.mask, 0, 0, layer.width, layer.height);
    layerCtx.restore();
    layerCtx.globalCompositeOperation = 'source-over';

    ctx.drawImage(layer, 0, 0, W, H);
    smoke.draw(ctx, p => !isBehind(p));
  } else {
    smoke.draw(ctx);
  }

  // ember light spill on top of the smoke
  for (const c of app.cigs) {
    if (c.ember < 0.45) continue;
    const tip = cigTip(c);
    const R = c.type.width * app.S * (3 + c.ember * 5);
    const g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, R);
    g.addColorStop(0, `rgba(255,150,60,${0.1 * c.ember * (c.alpha ?? 1)})`);
    g.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(tip.x, tip.y, R, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

/* You cannot aim at something you cannot see. This marks the exact point
   between the two fingers the tracker has picked out, so it is obvious where
   the cigarette will be taken from and how close to pinched your hand reads. */
function drawGrabPoints () {
  const S = app.S;
  for (const h of app.holders) {
    if (h.id === 'ptr') continue;
    const busy = app.cigs.some(c => c.state === 'held' && c.holderId === h.id);
    if (busy) continue;
    const k = clamp(h.strength);
    const r = (10 + (1 - k) * 26) * S;
    ctx.save();
    ctx.lineWidth = (1.4 + k * 1.6) * S;
    ctx.strokeStyle = h.pinching
      ? `rgba(255,168,86,${0.5 + k * 0.45})`
      : `rgba(226,230,255,${0.16 + k * 0.3})`;
    ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, TAU); ctx.stroke();
    if (h.pinching) {
      ctx.fillStyle = 'rgba(255,150,60,.16)';
      ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = `rgba(255,255,255,${0.35 + k * 0.5})`;
    ctx.beginPath(); ctx.arc(h.x, h.y, 2.4 * S, 0, TAU); ctx.fill();
    if (opt.skeleton && h.fingers) {
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.font = `${Math.round(11 * S)}px ui-sans-serif,system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(h.fingers, h.x, h.y - r - 7 * S);
    }
    ctx.restore();
  }
}

/** a nudge above the cigarette once there is enough ash to knock off */
function drawAshHint (cig) {
  const a = cig.ashHint * (cig.alpha ?? 1);
  if (a < 0.05) return;
  const S = app.S;
  const p = ashPoint(cig);
  const pulse = 0.72 + Math.sin(app.t * 4) * 0.28;
  const y = p.y - 40 * S - pulse * 5 * S;
  const label = 'flick to ash';

  ctx.save();
  ctx.globalAlpha = a * 0.92;
  ctx.font = `600 ${Math.round(13 * S)}px ui-sans-serif,system-ui,sans-serif`;
  const w = ctx.measureText(label).width + 22 * S;
  const h = 24 * S;

  ctx.fillStyle = 'rgba(12,12,16,.74)';
  roundRect(ctx, p.x - w / 2, y - h, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(255,150,70,${0.35 + pulse * 0.4})`;
  ctx.lineWidth = 1.2 * S;
  roundRect(ctx, p.x - w / 2, y - h, w, h, h / 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(240,236,230,.95)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, p.x, y - h / 2);

  // little arrow pointing down at the ash
  ctx.strokeStyle = `rgba(255,150,70,${0.5 + pulse * 0.5})`;
  ctx.lineWidth = 1.6 * S;
  ctx.beginPath();
  ctx.moveTo(p.x, y + 1 * S);
  ctx.lineTo(p.x, y + 9 * S);
  ctx.moveTo(p.x - 4 * S, y + 5 * S);
  ctx.lineTo(p.x, y + 9.5 * S);
  ctx.lineTo(p.x + 4 * S, y + 5 * S);
  ctx.stroke();
  ctx.restore();
}

function drawTracking () {
  const { W, H, S } = app;
  ctx.save();
  ctx.lineWidth = 2 * S;
  for (const h of app.hands) {
    ctx.strokeStyle = h.pinching ? 'rgba(255,150,60,.9)' : 'rgba(150,170,255,.55)';
    for (const [a, b] of HAND_BONES) {
      ctx.beginPath();
      ctx.moveTo(h.landmarks[a].x * W, h.landmarks[a].y * H);
      ctx.lineTo(h.landmarks[b].x * W, h.landmarks[b].y * H);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (const p of h.landmarks) {
      ctx.beginPath(); ctx.arc(p.x * W, p.y * H, 2.4 * S, 0, TAU); ctx.fill();
    }
    const p = toPx(h.pinch);
    ctx.strokeStyle = `rgba(255,190,90,${0.3 + h.pinchStrength * 0.7})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, 14 * S + (1 - h.pinchStrength) * 18 * S, 0, TAU); ctx.stroke();
  }
  const m = mouthState();
  ctx.strokeStyle = m.real ? 'rgba(120,255,200,.5)' : 'rgba(255,255,255,.2)';
  ctx.setLineDash([6 * S, 6 * S]);
  ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/* ----------------------------------------------------------------- hud */

let toastTimer = 0;
function toast (msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function setStatus (text, cls) {
  $('statusText').textContent = text;
  $('statusDot').className = 'dot ' + (cls || '');
}

function updateHud (inhale, exhale, m) {
  let pinch = 0;
  for (const h of app.hands) pinch = Math.max(pinch, h.pinchStrength);
  if (app.pointer.down) pinch = 1;
  $('mPinch').style.width = (pinch * 100).toFixed(0) + '%';
  $('mInhale').style.width = (inhale * 100).toFixed(0) + '%';
  $('mExhale').style.width = (exhale * 100).toFixed(0) + '%';
  $('mCharge').style.width = (app.hudCharge * 100).toFixed(0) + '%';

  const held = app.cigs.filter(c => c.state !== 'dropped');
  if (!held.length) setStatus(app.hands.length ? 'pinch a cigarette' : 'show your hands', app.hands.length ? 'live' : 'warn');
  else if (inhale > 0.05) setStatus('drawing…', 'live');
  else if (held.some(c => c.ash > 0.55)) setStatus('ash building — flick it', 'warn');
  else if (exhale > 0.05) setStatus('exhaling', 'live');
  else if (!m.real) setStatus('no face — using fallback', 'warn');
  else setStatus(held[0].type.name.toLowerCase() + ' lit', 'live');
}

/* --------------------------------------------------------------- input */

function canvasPoint (e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (app.W / r.width),
    y: (e.clientY - r.top) * (app.H / r.height)
  };
}

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  const p = canvasPoint(e);
  Object.assign(app.pointer, { down: true, wasDown: true, x: p.x, y: p.y, px: p.x, py: p.y, angle: -0.5 });
});
canvas.addEventListener('pointermove', e => {
  const p = canvasPoint(e);
  if (app.pointer.down) {
    const dx = p.x - app.pointer.px, dy = p.y - app.pointer.py;
    if (Math.hypot(dx, dy) > 4) {
      app.pointer.angle = angLerp(app.pointer.angle ?? -0.5, Math.atan2(dy, dx), 0.25);
      app.pointer.px = p.x; app.pointer.py = p.y;
    }
  }
  app.pointer.x = p.x; app.pointer.y = p.y;
});
const endPointer = () => { app.pointer.down = false; setTimeout(() => { app.pointer.wasDown = false; }, 60); };
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { app.keys.suck = true; e.preventDefault(); }
  if (k === 'e') app.keys.open = true;
  if (k === 'x') for (const c of app.cigs) if (c.state !== 'dropped') releaseCig(c, { real: false });
  if (k === 'f') {
    let done = false;
    for (const c of app.cigs) if (c.state !== 'dropped') done = knockAsh(c, 'ash flicked off') || done;
    if (!done) toast('no ash to knock off yet');
  }
  if (k >= '1' && k <= String(app.tray.length)) {
    const slot = app.tray[+k - 1];
    const c = spawnCig(slot.type, { id: 'ptr', x: slot.x, y: slot.y, angle: -0.5 });
    if (c) { app.flash[slot.i] = 1; c.state = 'docked'; c.holderId = null; c.dockSide = 1; toast(slot.type.name + ' lit'); }
  }
});
addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === ' ') app.keys.suck = false;
  if (k === 'e') app.keys.open = false;
});

/* ------------------------------------------------------------ settings */

$('panelToggle').onclick = () => $('panelBody').classList.toggle('open');
$('optDensity').oninput = e => { opt.density = +e.target.value; };
$('optSens').oninput = e => { opt.sens = +e.target.value; };
$('optGrip').oninput = e => { opt.grip = +e.target.value; vision.pinchEase = opt.grip; };
$('optOcclude').onchange = e => { opt.occlude = e.target.checked; };
$('optSkeleton').onchange = e => { opt.skeleton = e.target.checked; };
$('optMirror').onchange = e => { opt.mirror = vision.mirror = e.target.checked; };

/* ------------------------------------------------------------ lifecycle */

async function start () {
  const btn = $('startBtn');
  const status = $('gateStatus');
  btn.disabled = true;
  status.classList.remove('err');

  try {
    status.textContent = 'requesting camera…';
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    await new Promise(r => {
      if (video.videoWidth) return r();
      video.onloadedmetadata = r;
    });

    app.W = canvas.width = video.videoWidth || 1280;
    app.H = canvas.height = video.videoHeight || 720;
    app.S = app.W / 1280;
    $('frame').style.aspectRatio = `${app.W} / ${app.H}`;
    layoutTray();

    await vision.init(msg => { status.textContent = msg; });
    vision.mirror = opt.mirror;
    vision.pinchEase = opt.grip;

    $('gate').classList.add('hide');
    setTimeout(() => { $('gate').style.display = 'none'; }, 500);
    app.running = true;
    app.last = performance.now();
    requestAnimationFrame(frame);
    toast('pinch a cigarette from the right');
  } catch (err) {
    console.error('[vapor]', err);
    btn.disabled = false;
    status.classList.add('err');
    status.textContent = err.name === 'NotAllowedError'
      ? 'camera permission denied — allow it and try again'
      : (err.message || String(err));
  }
}

function frame (now) {
  if (!app.running) return;
  const dt = Math.min(0.05, Math.max(0, (now - app.last) / 1000)) || 0.016;
  app.last = now;
  app.t += dt;

  /* Whatever goes wrong in a single frame, the next one still has to run.
     An exception escaping here would skip the requestAnimationFrame below and
     kill the loop for good — the app would simply freeze, with the camera
     still on and nothing moving. */
  try {
    const res = vision.detect(video, now);
    app.hands = res.hands || [];
    app.face = res.face || null;
    app.mask = opt.occlude ? vision.segment(video, now) : null;
    step(dt);
    render(dt);
  } catch (e) {
    app.errs = (app.errs || 0) + 1;
    if (app.errs < 4) console.error('[vapor] frame error', e);
  }
  requestAnimationFrame(frame);
}

$('startBtn').onclick = start;
addEventListener('resize', layoutTray);
layoutTray();

// debugging / kiosk helpers
window.vapor = { app, opt, smoke, vision, start, toast, litTint, CIG_TYPES };
if (new URLSearchParams(location.search).has('auto')) start();
