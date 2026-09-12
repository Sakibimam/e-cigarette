/* vision.js — MediaPipe hand + face landmark tracking, normalised for the app.
   All coordinates returned are in 0..1 image space, already mirrored when
   `mirror` is true so that moving your right hand right moves it right on screen. */

const VER = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const SEG_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite';

// landmark indices
const WRIST = 0, THUMB_TIP = 4, INDEX_MCP = 5, INDEX_TIP = 8, MIDDLE_MCP = 9,
      MIDDLE_TIP = 12, RING_TIP = 16, PINKY_MCP = 17, PINKY_TIP = 20;

// fingertip / middle-knuckle pairs, for telling an open hand from a closed one
const TIPS = [8, 12, 16, 20];
const PIPS = [6, 10, 14, 18];

/* Every fingertip, thumb included. A pinch is just any two of these brought
   together — which two is up to you, and so is which way your hand is facing. */
const FINGERTIPS = [4, 8, 12, 16, 20];
const FINGER_NAME = { 4: 'thumb', 8: 'index', 12: 'middle', 16: 'ring', 20: 'pinky' };
// adjacent fingers rest close together, so they have to close further than a
// thumb-and-finger pair before it counts as deliberate
const NEIGHBOURS = new Set(['8,12', '12,16', '16,20']);

export const HAND_BONES = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17]
];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// depth is noisier than x/y, so it counts for less — but including it at all
// stops a hand pointed at the camera from reading as an open one
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.6);

export class Vision {
  constructor () {
    this.ready = false;
    this.mirror = true;
    this.pinchEase = 0;      // raised by the settings slider to forgive a loose pinch
    this._segAt = -1e9;
    this.lastTime = -1;
    this.hands = [];
    this.face = null;
    this._pinchState = new Map();
  }

  async init (log = () => {}) {
    log('loading vision runtime…');
    const tv = await import(`${CDN}/vision_bundle.mjs`);
    const fileset = await tv.FilesetResolver.forVisionTasks(`${CDN}/wasm`);

    const build = async (delegate) => {
      log(`loading models (${delegate.toLowerCase()})…`);
      const hand = await tv.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.5, minTrackingConfidence: 0.5
      });
      const face = await tv.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate },
        runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true
      });
      return { hand, face };
    };

    try {
      ({ hand: this.handLm, face: this.faceLm } = await build('GPU'));
    } catch (e) {
      console.warn('[vapor] GPU delegate failed, falling back to CPU', e);
      ({ hand: this.handLm, face: this.faceLm } = await build('CPU'));
    }

    this.ready = true;
    log('tracking ready');

    /* The segmenter is what lets smoke pass behind you instead of painting
       over your face. It is the least important of the three, so it loads
       last and the app carries on perfectly well without it. */
    try {
      log('loading depth mask…');
      this.segmenter = await tv.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SEG_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false
      });
      this.maskCanvas = document.createElement('canvas');
      this.maskCtx = this.maskCanvas.getContext('2d');
      log('tracking ready');
    } catch (e) {
      console.warn('[vapor] segmenter unavailable, smoke will draw over you', e);
      this.segmenter = null;
    }
  }

  /**
   * A canvas whose opaque pixels are you, in unmirrored video space.
   * Returns null when segmentation is off or unavailable.
   */
  segment (video, tMs) {
    if (!this.segmenter) return null;
    // a person does not change shape in 16ms; 20Hz is plenty and frees the
    // frame budget for everything else
    if (tMs - this._segAt < 48) return this.maskReady ? this.maskCanvas : null;
    this._segAt = tMs;
    let mask = null;
    try {
      const res = this.segmenter.segmentForVideo(video, tMs);
      mask = res?.categoryMask;
      if (!mask) return this.maskReady ? this.maskCanvas : null;

      /* The mask arrives at full video resolution, and walking a million
         pixels in JS every frame costs more than everything else in the app
         put together. It is only ever used as a soft silhouette, so sample it
         on a stride into a quarter-size canvas — 16x less work, and the
         coarser edge blurs into something that actually looks better. */
      const w = mask.width, h = mask.height;
      const STEP = 4;
      const mw = Math.ceil(w / STEP), mh = Math.ceil(h / STEP);
      if (this.maskCanvas.width !== mw || this.maskCanvas.height !== mh) {
        this.maskCanvas.width = mw;
        this.maskCanvas.height = mh;
        this._img = this.maskCtx.createImageData(mw, mh);
        const d = this._img.data;
        for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = 0; }
      }
      const src = mask.getAsUint8Array();
      const out = this._img.data;
      let j = 3;
      for (let y = 0; y < mh; y++) {
        const row = Math.min(h - 1, y * STEP) * w;
        for (let x = 0; x < mw; x++, j += 4) {
          out[j] = src[row + Math.min(w - 1, x * STEP)] ? 255 : 0;
        }
      }
      this.maskCtx.putImageData(this._img, 0, 0);
      this.maskReady = true;
      return this.maskCanvas;
    } catch (e) {
      return this.maskReady ? this.maskCanvas : null;
    } finally {
      if (mask && mask.close) mask.close();
    }
  }

  /** Run detection for the current video frame. Returns { hands, face }. */
  detect (video, tMs) {
    if (!this.ready) return { hands: this.hands, face: this.face };
    if (video.currentTime === this.lastTime) return { hands: this.hands, face: this.face };
    this.lastTime = video.currentTime;

    try {
      const hr = this.handLm.detectForVideo(video, tMs);
      const fr = this.faceLm.detectForVideo(video, tMs);
      this.hands = this._readHands(hr);
      this.face = this._readFace(fr);
    } catch (e) {
      // one malformed frame must never take the app down with it
      if (!this._warned) { console.warn('[vapor] detection frame skipped', e); this._warned = true; }
    }
    return { hands: this.hands, face: this.face };
  }

  _mx (x) { return this.mirror ? 1 - x : x; }

  _readHands (res) {
    const out = [];
    const lists = res?.landmarks || [];
    for (let i = 0; i < lists.length; i++) {
      const raw = lists[i];
      if (!raw || raw.length < 21) continue;
      const lm = raw.map(p => ({ x: this._mx(p.x), y: p.y, z: p.z }));

      // handedness is reported for the *camera* image; mirror flips its meaning
      let side = res.handedness?.[i]?.[0]?.categoryName || 'Right';
      if (this.mirror) side = side === 'Right' ? 'Left' : 'Right';

      const span = Math.max(0.04, dist3(lm[WRIST], lm[MIDDLE_MCP]));

      /* Find whichever two fingertips are closest to touching and treat that
         as the pinch. Thumb to index, index to middle, thumb to pinky — they
         all work, and the cigarette is taken at that exact point, so it does
         not matter which way your hand came in. */
      let pinchGap = Infinity, fa = THUMB_TIP, fb = INDEX_TIP;
      for (let i = 0; i < FINGERTIPS.length; i++) {
        for (let j = i + 1; j < FINGERTIPS.length; j++) {
          const a = FINGERTIPS[i], b = FINGERTIPS[j];
          let d = dist3(lm[a], lm[b]) / span;
          if (NEIGHBOURS.has(a + ',' + b)) d *= 1.55;
          if (d < pinchGap) { pinchGap = d; fa = a; fb = b; }
        }
      }

      let extended = 0;
      for (let f = 0; f < TIPS.length; f++) {
        if (dist(lm[TIPS[f]], lm[WRIST]) > dist(lm[PIPS[f]], lm[WRIST]) * 1.06) extended++;
      }

      /* Hysteresis, so a held pinch does not flicker. A splayed hand should
         not stay latched on through it — but the override has to check the
         gap too, because your index finger is extended when you pinch with it,
         and cancelling on extended fingers alone would kill the commonest
         pinch there is. */
      const was = this._pinchState.get(side) || false;
      const eng = 0.46 + this.pinchEase, rel = 0.70 + this.pinchEase;
      const splayed = extended >= 4 && pinchGap > eng;
      const pinching = splayed ? false : (was ? pinchGap < rel : pinchGap < eng);
      this._pinchState.set(side, pinching);

      // the cigarette is taken at the point between those two fingers
      const px = (lm[fa].x + lm[fb].x) / 2;
      const py = (lm[fa].y + lm[fb].y) / 2;

      // direction the held object should point: away from the wrist
      const ang = Math.atan2(py - lm[WRIST].y, px - lm[WRIST].x);

      // A finger is extended when its tip is further from the wrist than its
      // middle knuckle. Counting them is scale free, so it works the same
      // whether your hand is near the camera or far from it.
      /* Nobody holds a cigarette in a thumb-and-index pinch — it sits clamped
         between the index and middle fingers with the rest of the hand curled.
         So either counts as a grip: a real pinch, or a hand that is not open.
         Only splaying three fingers or more reads as letting go. */
      const gripping = pinching || extended <= 2;

      // where the cigarette sits in the hand, depending on which grip it is
      const gx = pinching ? px : (lm[6].x + lm[10].x) / 2;
      const gy = pinching ? py : (lm[6].y + lm[10].y) / 2;
      const fingers = FINGER_NAME[fa] + '+' + FINGER_NAME[fb];

      out.push({
        index: i, side, landmarks: lm, span,
        pinch: { x: px, y: py },
        pinchStrength: Math.max(0, Math.min(1,
          Math.max(1 - (pinchGap - 0.2) / (rel - 0.2), gripping ? 0.5 : 0))),
        pinchGap,
        pinching,
        gripping,
        fingers,
        grab: { x: gx, y: gy },
        pinchPoint: { x: px, y: py },
        extended,
        open: extended / TIPS.length,   // 1 = flat open palm
        angle: ang,
        wrist: lm[WRIST],
        indexTip: lm[INDEX_TIP],
        middleTip: lm[MIDDLE_TIP]
      });
    }
    // forget hands that left the frame
    for (const side of [...this._pinchState.keys()]) {
      if (!out.some(h => h.side === side)) this._pinchState.delete(side);
    }
    return out;
  }

  _readFace (res) {
    const lm = res?.faceLandmarks?.[0];
    if (!lm) return null;

    const bs = {};
    for (const c of (res.faceBlendshapes?.[0]?.categories || [])) bs[c.categoryName] = c.score;

    const P = i => ({ x: this._mx(lm[i].x), y: lm[i].y, z: lm[i].z });

    const upper = P(13), lower = P(14);          // inner lip centres
    const left = P(61), right = P(291);          // mouth corners
    const eyeA = P(33), eyeB = P(263);           // outer eye corners
    const nose = P(1), chin = P(152);

    const mouth = { x: (upper.x + lower.x) / 2, y: (upper.y + lower.y) / 2 };
    const mouthW = dist(left, right);
    const openRatio = dist(upper, lower) / Math.max(1e-4, mouthW);

    // head roll from the eye line; mirroring already applied
    const roll = Math.atan2(eyeB.y - eyeA.y, eyeB.x - eyeA.x);
    const scale = Math.max(0.05, dist(eyeA, eyeB));

    /* Turn your head and the near eye swings away from your nose while the far
       one closes in on it. The imbalance between those two distances is a
       usable yaw without needing the full transform matrix out of the model. */
    const dl = dist(nose, eyeA), dr = dist(nose, eyeB);
    const yaw = Math.max(-1, Math.min(1, (dr - dl) / Math.max(1e-4, dr + dl) * 2.6));

    const jawOpen = bs.jawOpen ?? 0;
    const pucker = bs.mouthPucker ?? 0;
    const funnel = bs.mouthFunnel ?? 0;
    const cheekPuff = Math.max(bs.cheekPuff ?? 0, 0);

    return {
      mouth, mouthW, openRatio, roll, scale, yaw,
      nose, chin, corners: { left, right },
      jawOpen, pucker, funnel, cheekPuff,
      // "sucking" = lips tight / pursed, "blowing" = lips funnelled open
      suck: Math.max(pucker, funnel * 0.85, cheekPuff * 0.6),
      open: Math.max(jawOpen, Math.min(1, openRatio * 2.2)),
      landmarks: lm
    };
  }
}
