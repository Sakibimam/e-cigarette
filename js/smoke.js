/* smoke.js — soft-sprite particle smoke with buoyancy, curl wobble and drag. */

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------------------------------------------------------------- eddies
   Turbulence has to be a property of the AIR, not of each particle: real
   smoke swirls because neighbouring parcels sit in the same eddy. Sampling a
   smooth field by position gives that coherence — two particles close
   together get almost the same push, so the cloud folds and curls instead of
   fizzing. The field is the curl of a sum of sinusoids, which makes it
   (near enough) divergence free, so it stirs the smoke without compressing it. */
const F1 = 0.0062, F2 = 0.0165;
const RATIO = F2 / F1;

function curlAt (x, y, t, s, out) {
  const a = x * F1 / s + t * 0.30;
  const b = y * F1 / s - t * 0.21;
  const c = x * F2 / s - t * 0.17;
  const d = y * F2 / s + t * 0.26;
  out.x = -Math.sin(a) * Math.sin(b) + 0.35 * RATIO * Math.cos(c) * Math.cos(d);
  out.y = -Math.cos(a) * Math.cos(b) + 0.35 * RATIO * Math.sin(c) * Math.sin(d);
}
const _curl = { x: 0, y: 0 };

function makePuff (size, tint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const h = size / 2;

  // irregular cloud built from overlapping soft blobs
  for (let i = 0; i < 18; i++) {
    const r = size * rnd(0.10, 0.20);
    const a = Math.random() * TAU;
    const d = Math.pow(Math.random(), 0.6) * size * 0.26;
    const x = h + Math.cos(a) * d, y = h + Math.sin(a) * d;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0.0, 'rgba(255,255,255,0.20)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.09)');
    grd.addColorStop(1.0, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }

  // radial fade so sprites never show a square edge
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createRadialGradient(h, h, size * 0.06, h, h, h);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.6, 'rgba(0,0,0,0.8)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, size, size);

  if (tint) {
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = tint;
    g.fillRect(0, 0, size, size);
  }
  return c;
}

export class SmokeSystem {
  constructor (max = 900) {
    this.max = max;
    this.particles = [];
    this.sprites = new Map();
    this.density = 1;
    this.wind = 0;
    this.t = 0;
  }

  _spriteSet (tint) {
    let set = this.sprites.get(tint);
    if (!set) {
      set = [makePuff(128, tint), makePuff(128, tint), makePuff(128, tint), makePuff(128, tint)];
      this.sprites.set(tint, set);
    }
    return set;
  }

  /**
   * emit({x,y,count,speed,dir,spread,size,grow,life,tint,alpha,rise,drag})
   * x/y in canvas pixels, dir in radians.
   */
  emit (o) {
    const set = this._spriteSet(o.tint || '#e8e8ec');
    const n = Math.round((o.count ?? 1) * (o.scaleCount === false ? 1 : this.density));
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= this.max) this.particles.shift();
      const dir = (o.dir ?? -Math.PI / 2) + rnd(-1, 1) * (o.spread ?? 0.5);
      const sp = (o.speed ?? 40) * rnd(0.55, 1.45);
      const life = (o.life ?? 3) * rnd(0.7, 1.35);
      this.particles.push({
        x: o.x + rnd(-1, 1) * (o.jitter ?? 3),
        y: o.y + rnd(-1, 1) * (o.jitter ?? 3),
        vx: Math.cos(dir) * sp + (o.vx0 || 0),
        vy: Math.sin(dir) * sp + (o.vy0 || 0),
        size: 0, size0: 0,
        grow: (o.grow ?? 26) * rnd(0.7, 1.4),
        life, max: life,
        rot: Math.random() * TAU,
        spin: rnd(-0.9, 0.9),
        alpha: (o.alpha ?? 0.5) * rnd(0.65, 1.15),
        rise: o.rise ?? 26,
        drag: o.drag ?? 0.72,
        swirl: o.swirl ?? 45,
        drag2: (o.drag2 ?? 0.008) / (o.fieldScale ?? 1),
        fieldScale: o.fieldScale ?? 1,
        laminar: o.laminar ?? 0,
        thin: o.thin ?? 1.15,
        img: set[(Math.random() * set.length) | 0]
      });
      const np = this.particles[this.particles.length - 1];
      np.size = np.size0 = (o.size ?? 16) * rnd(0.7, 1.3);
    }
  }

  update (dt) {
    this.t += dt;
    const list = this.particles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) { list.splice(i, 1); continue; }

      const age = 1 - p.life / p.max;
      const alive = p.max - p.life;

      // eddies sampled from the air, so nearby particles swirl together
      curlAt(p.x, p.y, this.t, p.fieldScale, _curl);
      // smoke leaving a coal rises as a smooth thread before it breaks up,
      // so hold the turbulence off for the first stretch of its life
      const turb = p.laminar > 0 ? Math.min(1, alive / p.laminar) ** 2 : 1;

      // Buoyancy is driven by how much warmer the smoke is than the room, and
      // a puff cools as it entrains air — which is exactly what its expansion
      // measures. So lift fades as the puff grows, and old smoke levels off
      // and drifts instead of climbing forever.
      const warmth = Math.sqrt(p.size0 / p.size);
      p.vx += (_curl.x * p.swirl * turb + this.wind) * dt;
      p.vy += (_curl.y * p.swirl * turb - p.rise * (0.35 + age) * warmth) * dt;

      // Quadratic drag, the way air actually resists: a fast jet stalls
      // hard while slow drifting smoke keeps going. That difference is what
      // makes an exhale pile up and mushroom at its leading edge.
      const sp = Math.hypot(p.vx, p.vy);
      const damp = Math.pow(p.drag, dt) / (1 + p.drag2 * sp * dt);
      p.vx *= damp;
      p.vy *= damp;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // entrainment slows as the puff grows and its edge velocity drops
      p.size += p.grow * Math.max(0.18, 1 - age * 0.8) * dt;
      p.rot += p.spin * dt;
    }
  }

  draw (ctx) {
    ctx.save();
    for (const p of this.particles) {
      const age = 1 - p.life / p.max;
      // fade in fast, out slow
      const fade = age < 0.14 ? age / 0.14 : Math.pow(1 - (age - 0.14) / 0.86, 1.5);
      // the same smoke spread over a bigger puff is thinner smoke: opacity
      // tracks density rather than being a free-floating fade
      const dens = Math.pow(p.size0 / p.size, p.thin);
      const a = p.alpha * fade * dens;
      if (a <= 0.004) continue;
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.drawImage(p.img, -p.size, -p.size, p.size * 2, p.size * 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  clear () { this.particles.length = 0; }
  get count () { return this.particles.length; }
}
