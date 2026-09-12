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

## Putting it on the web

There is no build step — it is static files — so Vercel serves the repo as it stands.

```bash
npx vercel          # preview
npx vercel --prod   # live
```

Or point Vercel at the GitHub repo and let it deploy on push. When it asks for a framework,
choose **Other**; leave the build command and output directory empty.

`vercel.json` sets three things worth knowing about:

- `Permissions-Policy: camera=(self)` — the camera is the whole app, so it is allowed
  explicitly. Microphone and location are switched off, since nothing here uses them.
- `Cache-Control: must-revalidate` on `js/` and `css/` — the filenames are not
  content-hashed, so without it a deploy can leave people running a stale module against a
  fresh page.
- `cleanUrls`, so the site lives at `/` rather than `/index.html`.

**HTTPS matters here.** `getUserMedia` only works on a secure origin, which Vercel gives
you, and it is the reason the app can be opened on a phone at all — `localhost` only ever
worked on the machine running it.

### Who is visiting

`index.html` loads Vercel **Web Analytics** and **Speed Insights** from `/_vercel/` on this
same origin — no third-party script, no cookie banner to add. They only exist once you turn
them on for the project (Vercel dashboard → your project → Analytics, and → Speed Insights);
until you do, both requests 404 and `js/analytics.js` quietly does nothing, which is also
what happens on localhost.

Alongside page views, the app reports a few anonymous events of its own:

| event | when | what it carries |
|---|---|---|
| `camera` | the permission prompt is answered | `granted`, `denied` or `failed` |
| `tracking_ready` | the models finish loading | load time to the nearest 100ms, whether the segmenter made it |
| `lit` | the first time a kind of cigarette is tried | which one |
| `session` | the tab is hidden or closed | seconds, and counts of cigarettes, draws, exhales, nose exhales and ash flicks |

Counts are rolled into that one `session` event rather than sent per puff, so a long session
is a handful of requests rather than hundreds.

**None of this touches the camera.** No frame, no landmark, no image, and no measurement of
anyone's face or hands ever leaves the browser — the video is read, used and discarded
inside the page. What is sent is what is in the table above and nothing else, and
**Anonymous usage stats** in the settings panel turns even that off.

One thing to expect: Vercel counts page views and visitors on every plan, but these custom
events need a Pro plan. On Hobby you will see the traffic and not the events.

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

### Picking one up

**Put any two fingertips together and reach in.** Whichever two — thumb and index, index
and middle, thumb and pinky — the app looks at all ten pairs and takes whichever is closest
to touching, then hands you the cigarette at that exact point. Which way your hand is
facing makes no difference; it works at any rotation.

**Index and middle get their own handling**, because that is how people actually hold a
cigarette. Hold those two straight out with the rest of your hand closed and it is read as
a scissor grip: the cigarette is placed back between your fingers at the knuckles rather
than out at the tips, and it lies **along** your fingers instead of drooping out of them —
because there, the fingers are doing the holding, not gravity. Only one pinched at the
fingertips hangs. Middle-and-ring and ring-and-pinky still have to close further than the
rest, since nobody means those.

A **ring marks the spot** the app is watching, tightening and turning amber as your fingers
come together. If the cigarette will not come out, look at where that ring actually is
rather than where you think your fingers are.

There is no need to time anything. Reach in with your fingers together and whatever is
under them comes out — from up to 172px off the centre of the card. Simply curling your
hand keeps hold of one too, so the grip does not depend on keeping a precise pinch while
you move.

Spreading your hand wide is the one unambiguous "let go" and drops it immediately, except
at your lips, where it leaves the cigarette hanging there.

Distances are measured in three dimensions, so pointing your hand at the camera no longer
reads as an open hand. If it still fights you, **Grip forgiveness** in the settings panel
moves the threshold either way, and **Show tracking** labels which two fingers the model
thinks are closest.

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
- **Grip forgiveness** — how close two fingertips have to be before it counts. Raise it if
  cigarettes will not come out, lower it if they jump into your hand unasked.
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
