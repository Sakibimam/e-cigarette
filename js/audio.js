/* audio.js — everything is synthesised: there are no sound files.
   Burning paper is broadband noise with sharp random transients, breath is
   filtered noise shaped by an envelope, so both fall out of a noise buffer and
   a couple of filters. */

function noiseBuffer (ctx, seconds = 2) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    // slightly brown-tinted noise: less harsh than pure white
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = w * 0.75 + last * 3;
  }
  return buf;
}

export class Sound {
  constructor () {
    this.ok = false;
    this.muted = false;
  }

  /** must be called from a user gesture */
  start () {
    if (this.ok) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.noise = noiseBuffer(ctx, 3);

    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(ctx.destination);

    // ---- ember bed: a quiet continuous sizzle while the coal is hot ----
    const bed = ctx.createBufferSource();
    bed.buffer = this.noise;
    bed.loop = true;
    const bedHp = ctx.createBiquadFilter();
    bedHp.type = 'highpass'; bedHp.frequency.value = 2600;
    const bedLp = ctx.createBiquadFilter();
    bedLp.type = 'lowpass'; bedLp.frequency.value = 9000;
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0;
    bed.connect(bedHp).connect(bedLp).connect(this.bedGain).connect(this.out);
    bed.start();

    // ---- breath bus, used for the exhale ----
    this.breathFilter = ctx.createBiquadFilter();
    this.breathFilter.type = 'bandpass';
    this.breathFilter.frequency.value = 700;
    this.breathFilter.Q.value = 0.7;
    this.breathGain = ctx.createGain();
    this.breathGain.gain.value = 0;
    const breath = ctx.createBufferSource();
    breath.buffer = this.noise; breath.loop = true;
    breath.connect(this.breathFilter).connect(this.breathGain).connect(this.out);
    breath.start();

    this.crackleAt = 0;
    this.ok = true;
  }

  resume () { if (this.ok && this.ctx.state === 'suspended') this.ctx.resume(); }
  setMuted (m) { this.muted = m; if (this.ok) this.out.gain.value = m ? 0 : 0.9; }

  /** one tick of burning paper */
  crackle (intensity = 1) {
    if (!this.ok || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.9;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800 + Math.random() * 4200;
    bp.Q.value = 1.4 + Math.random() * 3;
    const g = ctx.createGain();
    const peak = (0.035 + Math.random() * 0.07) * intensity;
    const dur = 0.02 + Math.random() * 0.05;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.out);
    src.start(t, Math.random() * 2);
    src.stop(t + dur + 0.02);
  }

  /** call every frame with how hard the coal is being drawn on, 0..1 */
  draw (intensity, dt) {
    if (!this.ok || this.muted) return;
    const target = intensity > 0.02 ? 0.012 + intensity * 0.055 : 0.004;
    this.bedGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.12);
    // crackles get faster and louder the harder you pull
    this.crackleAt -= dt * (3 + intensity * 26);
    while (this.crackleAt <= 0) {
      this.crackleAt += 1;
      this.crackle(0.5 + intensity);
    }
  }

  /** call every frame while smoke is leaving your mouth */
  blow (power) {
    if (!this.ok || this.muted) return;
    const t = this.ctx.currentTime;
    this.breathGain.gain.setTargetAtTime(power * 0.10, t, 0.05);
    this.breathFilter.frequency.setTargetAtTime(520 + power * 900, t, 0.08);
  }

  /** the coal goes quiet, the breath stops */
  quiet () {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.breathGain.gain.setTargetAtTime(0, t, 0.09);
  }

  /** ash breaking off: a soft dry tick */
  tick () {
    if (!this.ok || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    src.connect(lp).connect(g).connect(this.out);
    src.start(t, Math.random());
    src.stop(t + 0.16);
  }

  /** lighting up: a short rising sizzle */
  light () {
    if (!this.ok || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(4200, t + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    src.connect(bp).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + 0.6);
  }
}
