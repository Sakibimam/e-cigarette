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

Then press **Enable camera**. First load downloads the three tracking models (~15 MB) from
Google's CDN, so it needs a network connection the first time.

## How to smoke

| step | what you do | what happens |
|---|---|---|
| 1 | **Pinch** thumb + index over one of the three cards on the right | the cigarette leaves the pack and follows your pinch |
| 2 | Carry it to your **lips** | it lights up; the coal sits at the far end |
| 3 | **Purse / funnel your lips** while it's at your mouth | the ember flares, the paper burns down, and your lungs fill (`LUNGS` meter) |
| 4 | Take it **away** from your mouth and **open your mouth** | a plume of smoke pours out of your lips, billows forward and drifts up |
| 5 | **Release the pinch** at your lips | the cigarette hangs off your lip hands-free — pinch near it again to take it back |
| 5b | **Spread your hand wide open** | you drop it, wherever you are — the one unambiguous way to let go |
| 6 | After three or four drags, **flick** your hand down sharply — or **tap** the stick with a finger on your other hand | the ash clump breaks off and falls |

While it sits in your lips the cigarette is drawn foreshortened and angled down out of
the corner of your mouth, with the filter end shaded where your lips cover it — the pose a
cigarette actually has when it points at the lens. Pull it out and it eases back to full
length.

The lungful belongs to *you*, not to the cigarette: you can draw, drop the cigarette, and
still exhale the smoke you took in. A cigarette held at your mouth blocks the plume — you
have to move it clear first, exactly like the real thing. Smoke the whole thing down and
it burns to the filter and falls away.

### Holding it

Either grip works, because nobody holds a cigarette in a thumb-and-index pinch:

- **pinch** thumb to index, or
- **just curl your hand** — index and middle out, the rest closed, the way you would round
  a real one. Two extended fingers or fewer counts as holding.

Splaying three fingers or more is the one unambiguous "let go", so that drops it instantly.
The pinch distance is measured in three dimensions, so pointing your hand at the camera no
longer reads as an open hand. If it still fights you, raise **Grip forgiveness** in the
settings panel and turn on **Show tracking** to watch what the model actually sees.

### Keeping hold of it

Hand tracking blinks. A fast move or a tilted palm loses the hand for a frame or two, and
the pinch gap flickers across its threshold constantly — so letting go on any single one of
those frames made a cigarette maddening to hold on to. A grip now has to lapse for a third
of a second before your fingers actually open, which rides straight over the noise.

Spreading your hand wide is unmistakable, though, so that drops it immediately with no
wait. Three of your four fingers extended past their middle knuckles counts as open, a test
that does not care how near the camera your hand is.

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
- **Grip forgiveness** — how loose a pinch still counts as holding. Raise it if the
  cigarette will not come out of the tray.
- **Sound** — the crackle, the breath and the ash tick
- **Smoke passes behind you** — the segmentation mask. Turn it off to save a little work.
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

## Making it sit in the room

- **Sound**, synthesised in WebAudio with no audio files: burning paper is broadband noise
  with sharp random transients, so crackles are noise bursts through a swept bandpass whose
  rate and loudness track how hard you are drawing. The exhale is filtered noise shaped by
  an envelope, and the coal keeps a quiet sizzling bed under it all.
- **The smoke is lit by your room.** A 48×27 copy of the video frame, sampled four times a
  second, gives the average colour and brightness around you; smoke is tinted toward it and
  dimmed in a dark room. Pure white smoke is the main thing that reads as pasted on. The
  tint is quantised so the sprite cache holds a handful of variants rather than one per
  frame, and it is capped and evicted besides.
- **The coal is a light source**, not just a bright dot: a warm falloff thrown onto the
  video under the cigarette and the smoke, flickering, and flaring as you draw — so your
  hand and face catch the glow and the smoke drifts through it.
- **Distance.** Eye separation says how far away you are, so leaning toward the camera
  grows the cigarette and its smoke instead of leaving a fixed-size sticker on the lens.
- **Smoke passes behind you.** A selfie segmenter gives your silhouette each frame; smoke
  that has risen above your head is drawn into its own layer, your outline is punched out
  of it, and it goes down before everything else. So a plume climbing past your face
  passes behind it while the one you have just blown stays in front. The mask is sampled
  on a stride into a quarter-size canvas and only recomputed at 20Hz — walking a million
  pixels per frame cost more than the whole rest of the app, and the coarser edge blurs
  into something that looks better anyway.
- **Your hands stir it.** Sweep a hand through your own cloud and the particles nearby get
  dragged along with it.
- **Nose exhale.** Keep your mouth shut on a full chest and it comes out of your nostrils
  instead, in two thin fast streams.
- **Head yaw** swings the cigarette in your lips and aims the plume where you are facing,
  worked out from how your nose sits between your eyes.

## How it works

- `js/vision.js` — MediaPipe Tasks Vision `HandLandmarker` + `FaceLandmarker` (GPU, with a
  CPU fallback). Exposes mirrored, normalised landmarks plus derived gestures: pinch
  strength with hysteresis, mouth centre and radius, head roll, and `suck` / `open` built
  from the `mouthPucker`, `mouthFunnel`, `cheekPuff` and `jawOpen` blendshapes.
- `js/smoke.js` — soft-sprite particle system with physics that tries to behave like real
  smoke rather than just drifting:
  - **turbulence belongs to the air, not the particle.** Eddies are sampled from a smooth
    curl field by *position*, so particles close together get almost the same push and the
    cloud folds and swirls instead of each puff jittering independently.
  - **quadratic drag**, the way air actually resists. A fast jet stalls hard while slow
    smoke keeps drifting, so the leading edge of an exhale piles up and mushrooms.
  - **opacity tracks density.** The same smoke spread over a bigger puff is thinner smoke,
    so alpha falls as the puff expands rather than fading on a timer.
  - **buoyancy fades as the puff grows**, because expansion is what entrainment — and so
    cooling — looks like. Old smoke levels off and drifts instead of climbing forever.
  - **exhales are jets first, plumes second**: fast and narrow at the start, slowing and
    widening as your lungs empty. The handover happens on its own, about a second in.
  - smoke leaving the coal stays laminar for its first stretch before it breaks up.
  Capped at 1100 live particles.
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
