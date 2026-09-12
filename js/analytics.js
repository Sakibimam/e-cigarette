/* analytics.js — Vercel Web Analytics.
 *
 * Nothing here touches the camera. No frame, no landmark, no image, no
 * measurement of anyone's face or hands ever leaves the browser — the only
 * things sent are anonymous counts of what happened in a session, and only
 * when the project has Web Analytics switched on in its Vercel dashboard.
 *
 * `window.va` is a queue stub set up in index.html, so calls made before the
 * script loads (or when it never loads, as on localhost) are harmless no-ops.
 */

const SUMMARY_AT = 4000;   // don't bother reporting a session shorter than this

export const analytics = {
  on: true,
  started: 0,
  sent: false,
  counts: { lit: 0, puffs: 0, exhales: 0, ash: 0, noseBlows: 0 },
  seenTypes: new Set(),

  init () {
    this.started = Date.now();
    // report once, when the tab is put away — beforeunload is unreliable on
    // phones, visibilitychange is not
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.summary();
    });
    addEventListener('pagehide', () => this.summary());
  },

  event (name, data) {
    if (!this.on) return;
    try {
      if (typeof window.va === 'function') window.va('event', { name, ...(data ? { data } : {}) });
    } catch (e) { /* analytics must never break the app */ }
  },

  /** the camera prompt is the one thing that decides whether a visit works */
  camera (outcome) { this.event('camera', { outcome }); },

  ready (ms, segmenter) {
    this.event('tracking_ready', { load_ms: Math.round(ms / 100) * 100, segmenter: !!segmenter });
  },

  lit (typeId) {
    this.counts.lit++;
    // one event the first time each kind is tried, not one per cigarette
    if (!this.seenTypes.has(typeId)) {
      this.seenTypes.add(typeId);
      this.event('lit', { type: typeId });
    }
  },

  puff () { this.counts.puffs++; },
  exhale () { this.counts.exhales++; },
  nose () { this.counts.noseBlows++; },
  ashed () { this.counts.ash++; },

  /** one roll-up per session rather than an event per puff */
  summary () {
    if (this.sent || !this.on) return;
    const ms = Date.now() - this.started;
    if (ms < SUMMARY_AT || !this.counts.lit) return;
    this.sent = true;
    this.event('session', {
      seconds: Math.round(ms / 1000),
      lit: this.counts.lit,
      puffs: this.counts.puffs,
      exhales: this.counts.exhales,
      nose: this.counts.noseBlows,
      ash: this.counts.ash,
      types: [...this.seenTypes].join('+')
    });
  }
};
