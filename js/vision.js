/* vision.js — MediaPipe hand + face landmark tracking, normalised for the app.
   All coordinates returned are in 0..1 image space, already mirrored when
   `mirror` is true so that moving your right hand right moves it right on screen. */

const VER = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// landmark indices
const WRIST = 0, THUMB_TIP = 4, INDEX_MCP = 5, INDEX_TIP = 8, MIDDLE_MCP = 9,
      MIDDLE_TIP = 12, RING_TIP = 16, PINKY_MCP = 17, PINKY_TIP = 20;

export const HAND_BONES = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17]
];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class Vision {
  constructor () {
    this.ready = false;
    this.mirror = true;
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
  }

  /** Run detection for the current video frame. Returns { hands, face }. */
  detect (video, tMs) {
    if (!this.ready) return { hands: this.hands, face: this.face };
    if (video.currentTime === this.lastTime) return { hands: this.hands, face: this.face };
    this.lastTime = video.currentTime;

    let hr, fr;
    try {
      hr = this.handLm.detectForVideo(video, tMs);
      fr = this.faceLm.detectForVideo(video, tMs);
    } catch (e) {
      return { hands: this.hands, face: this.face };
    }

    this.hands = this._readHands(hr);
    this.face = this._readFace(fr);
    return { hands: this.hands, face: this.face };
  }

  _mx (x) { return this.mirror ? 1 - x : x; }

  _readHands (res) {
    const out = [];
    const lists = res?.landmarks || [];
    for (let i = 0; i < lists.length; i++) {
      const raw = lists[i];
      const lm = raw.map(p => ({ x: this._mx(p.x), y: p.y, z: p.z }));

      // handedness is reported for the *camera* image; mirror flips its meaning
      let side = res.handedness?.[i]?.[0]?.categoryName || 'Right';
      if (this.mirror) side = side === 'Right' ? 'Left' : 'Right';

      const span = Math.max(0.04, dist(lm[WRIST], lm[MIDDLE_MCP]));
      const pinchGap = dist(lm[THUMB_TIP], lm[INDEX_TIP]) / span;

      // hysteresis so a held pinch does not flicker
      const was = this._pinchState.get(side) || false;
      const pinching = was ? pinchGap < 0.78 : pinchGap < 0.52;
      this._pinchState.set(side, pinching);

      const px = (lm[THUMB_TIP].x + lm[INDEX_TIP].x) / 2;
      const py = (lm[THUMB_TIP].y + lm[INDEX_TIP].y) / 2;

      // direction the held object should point: away from the wrist
      const ang = Math.atan2(py - lm[WRIST].y, px - lm[WRIST].x);

      out.push({
        index: i, side, landmarks: lm, span,
        pinch: { x: px, y: py },
        pinchStrength: Math.max(0, Math.min(1, 1 - (pinchGap - 0.35) / 0.75)),
        pinching,
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

    const jawOpen = bs.jawOpen ?? 0;
    const pucker = bs.mouthPucker ?? 0;
    const funnel = bs.mouthFunnel ?? 0;
    const cheekPuff = Math.max(bs.cheekPuff ?? 0, 0);

    return {
      mouth, mouthW, openRatio, roll, scale,
      nose, chin, corners: { left, right },
      jawOpen, pucker, funnel, cheekPuff,
      // "sucking" = lips tight / pursed, "blowing" = lips funnelled open
      suck: Math.max(pucker, funnel * 0.85, cheekPuff * 0.6),
      open: Math.max(jawOpen, Math.min(1, openRatio * 2.2)),
      landmarks: lm
    };
  }
}
