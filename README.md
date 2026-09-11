# Vapor — a virtual cigarette you smoke with your hands and face

A browser app that watches you through your webcam, lets you **pinch a cigarette out of
the air**, **draw on it with your lips**, and **blow real volumetric smoke** out of your
mouth when you take it away.

Everything runs locally in the browser. No frames, no landmarks and no video ever leave
your machine.

## Run it

```bash
./start.sh            # serves on http://localhost:8777 and opens your browser
```

or any static server (`python3 -m http.server 8777`). A plain `file://` open will **not**
work — ES modules and camera access both require an http(s) origin. `localhost` counts as
a secure origin; to use it from a phone or another machine you need real HTTPS.

Then press **Enable camera**. First load downloads the two tracking models (~12 MB) from
Google's CDN, so it needs a network connection the first time.

## How to smoke

| step | what you do | what happens |
|---|---|---|
| 1 | **Pinch** thumb + index over one of the three cards on the right | the cigarette leaves the pack and follows your pinch |
| 2 | Carry it to your **lips** | it lights up; the coal sits at the far end |
| 3 | **Purse / funnel your lips** while it's at your mouth | the ember flares, the paper burns down, and your lungs fill (`LUNGS` meter) |
| 4 | Take it **away** from your mouth and **open your mouth** | a plume of smoke pours out of your lips, billows forward and drifts up |
| 5 | **Release the pinch** at your lips | the cigarette hangs off your lip hands-free — pinch near it again to take it back |
| 6 | After three or four drags, **flick** your hand down sharply — or **tap** the stick with a finger on your other hand | the ash clump breaks off and falls |

While it sits in your lips the cigarette is drawn foreshortened and angled down out of
the corner of your mouth, with the filter end shaded where your lips cover it — the pose a
cigarette actually has when it points at the lens. Pull it out and it eases back to full
length.

The lungful belongs to *you*, not to the cigarette: you can draw, drop the cigarette, and
still exhale the smoke you took in. A cigarette held at your mouth blocks the plume — you
have to move it clear first, exactly like the real thing. Smoke the whole thing down and
it burns to the filter and falls away.

### Ash

Every drag builds ash on the coal, so three or four good ones leave a long grey clump. Once
there is enough, a `flick to ash` prompt appears over the stick and the status line nags
you. Two ways to knock it off:

- **flick** — a sharp downward jerk of the hand holding it. Carrying it to your mouth at
  normal speed will not trigger it; it wants a real flick.
- **tap** — strike the stick with the index finger of your *other* hand, the way you tap
  a cigarette over an ashtray. Works while it is hanging in your lips too.

Ignore it long enough and the clump falls on its own. `F` does it from the keyboard.

### The four types

| | burn | smoke |
|---|---|---|
| **Classic** | fast | grey, medium plume |
| **Menthol** | medium | bright blue-white, fast and thin |
| **Cigar** | slow | warm, heavy, thick rolling clouds |
| **Bidi** | very fast — about 3× a cigarette, and it keeps burning when you leave it alone | pungent, faintly yellow |

The bidi is drawn as it really is: a short tapered cone of tendu leaf, no filter, tied off
with crimson thread at the wide end. It also crumbles into ash faster than the rest.

## Controls

Settings are behind the **⚙** in the top right:

- **Smoke density** — particles per puff (turn it down if your machine struggles)
- **Lip threshold** — how hard you have to purse your lips before it counts as a draw.
  Lower = easier. Raise it if the ember flares while you talk.
- **Show tracking** — draws the hand skeleton, pinch ring and mouth radius
- **Mirror camera** — on by default so the picture moves the way you do

### Keyboard / mouse fallback

Works with no hands or no face in frame, useful for testing and for demos:

| key | action |
|---|---|
| `1` `2` `3` `4` | light a classic / menthol / cigar / bidi straight into your mouth |
| `space` | draw (hold) |
| `E` | open your mouth and blow |
| `F` | flick the ash off |
| `X` | drop everything |
| drag | move a cigarette with the mouse |

If no face is detected the app falls back to a virtual mouth in the middle of the frame,
so the keyboard controls still do something visible.

`?auto=1` on the URL skips the splash and asks for the camera immediately (kiosk mode).

## How it works

- `js/vision.js` — MediaPipe Tasks Vision `HandLandmarker` + `FaceLandmarker` (GPU, with a
  CPU fallback). Exposes mirrored, normalised landmarks plus derived gestures: pinch
  strength with hysteresis, mouth centre and radius, head roll, and `suck` / `open` built
  from the `mouthPucker`, `mouthFunnel`, `cheekPuff` and `jawOpen` blendshapes.
- `js/smoke.js` — soft-sprite particle system. Four pre-rendered irregular puff sprites per
  smoke colour, buoyancy that grows with particle age, two-frequency curl turbulence,
  exponential drag, fast fade-in / slow fade-out. Capped at 1100 live particles.
- `js/cigarettes.js` — the three types and the canvas drawing: gradient paper, speckled
  filter, brand band, scorch mark, cracked ash and a radial coal that brightens as you draw.
- `js/app.js` — the state machine (`held` → `docked` → `dropped`), the tray, the lung
  model, and the render loop.

## Notes

- Two cigarettes at once, max — one per hand.
- Tracking wants an evenly lit face and hands inside the frame. Backlighting (a bright
  window behind you) is the usual reason a pinch stops registering.
- This is a toy. It is not an argument for smoking — there is no safe way to do the real
  thing, and this one only costs you frame rate.
