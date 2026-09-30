# Graziella · Sticker Studio

A photoreal 3D Graziella (the 1964 Italian folding bike) you can cover in stickers.
Vite + React for the UI, vanilla three.js for the engine.

```bash
npm install                   # icons are Font Awesome Pro: needs your FA package token in ~/.npmrc
npm run dev                   # http://127.0.0.1:5218
npm run build                 # static build in dist/
node tools/fetch-assets.mjs   # optional: a local copy of the CC0 assets (~180 MB), faster and offline
```

The city, the garage and the studio HDRIs use CC0 assets from
[Poly Haven](https://polyhaven.com) (textures, props, skies). They are not in
the repository: without a local copy the app streams them straight from Poly
Haven's CDN (`src/engine/sets/manifest.js` maps every file), a few requests at
a time with retries, textures at 1k (the path tracer packs them at 1024 px
anyway). `tools/fetch-assets.mjs` downloads them into `public/sets` and
`public/hdri` and marks the copy with `public/sets/local.json`; the app then
uses it. Add `?cdn` to the URL to force streaming.

## Deploy on Vercel

Import the repository in Vercel (the framework, build command and output come
from `vercel.json`) and add one environment variable:

| Name | Value |
|---|---|
| `FONTAWESOME_NPM_AUTH_TOKEN` | your Font Awesome Pro package token |

The install step writes it into `.npmrc` on the build machine only; the
repository never contains the token. The deployed site streams the CC0 assets
from Poly Haven.

## What it does

- **The bike** is modelled entirely in code (no asset): 20" whitewall tyres with
  tread, moulded sidewall lettering and a loaded contact patch, 36 spokes laced
  3-cross, chrome C-section fenders with rolled edges and a real underside, a
  sprung saddle built as a leather shell with thickness (embossed border, rolled
  skirt, suede underside, cantle plate, copper rivets), weld fillets computed
  from the actual tube intersections, 1960s side-pull calipers and stamped
  levers, tall quill stem, rack with spring clip, chain closed link by link on
  the real tangent path, working folding hinge with a latch lever.
- **Stickers wrap the surface.** Every sticker-able part has UVs in metres; a
  sticker is a rectangle laid out in that space and clipped exactly to its
  edge, so it wraps round a tube like real vinyl (`src/engine/stickers/decal.js`).
  Artwork becomes a die-cut sticker automatically: white vinyl carrier from a
  distance-transform offset contour (concave corners rounded), a bevel normal
  map so the cut edge catches light, and ORM / thin-film maps for foil and
  holographic finishes (`artwork.js`, `finishes.js`).
- **Two renderers, one look.** Live raster (IBL + N8AO + accumulated floor
  shadows sampled from the environment itself) and, whenever the view is still,
  a progressive path tracer (three-gpu-pathtracer, WebGL) that crossfades in,
  with an edge-aware denoiser that fades out as samples accumulate. Both feed
  the same post stack: exposure, bloom, Khronos Neutral / AgX / ACES, SMAA,
  chromatic aberration, vignette, grain.
- **Ambientazioni.** Three places to photograph it (Scena → Ambientazione):
  - *Studio*: the seamless paper studio, with procedural HDR softbox lights
    (Studio, Nero, Tramonto) and three CC0 HDRIs. One float equirect feeds both
    renderers; the floor tint is solved per channel so the paper has no seam.
  - *Città*: an Italian old-town street built in code. Palazzi with deep window
    reveals, louvred shutters (open, closed, ajar), sills, string courses,
    cornicioni, balconies, portoni, shop shutters and painted signs, rising damp
    and rain streaks in the vertex colours; granite pavements and kerbs,
    porphyry setts in fans with real relief near the bike, lanterns, a bar with
    its tables out, a side alley. Pomeriggio, Nuvole, Tramonto, Sera.
  - *Garage*: a 1960s box garage with a roller shutter, fluorescent battens as
    real area lights, a workbench under a pegboard of tools and the clutter of
    a garage (CC0 props). Serranda su (late sun under the shutter) and Neon.
- **Colour.** Sixteen period paints plus any custom colour (saturation / value
  field, hue, hex, recent colours); Lucida, Metallizzata, Perlata (thin-film
  pearl), Satinata, Opaca; fenders in chrome, in the frame colour or white.
- **Delights.** Fold (P), pedal (G), bell (B, or click it), kickstand (C: inside
  a set the bike parks itself, the stand swings down, it leans onto it and the
  front wheel flops over), photo export that waits for the path tracer, double
  click to focus, undo / redo, autosave.
- **Clean path tracing in seconds.** The denoiser is guided by three noise-free
  images: the last raster frame (every texture and shadow edge is already in
  it), and the normals and depth of the view. It smooths the path tracer's
  noise hard on flat regions without touching edges, and fades out as the
  image converges: a set looks finished after about 16 samples.

## Layout

```
src/engine/Studio.js           renderer, camera, raster <-> path tracing switch
src/engine/bike/               the Graziella (dims, frame, wheel, drivetrain, cockpit, saddle, extras)
src/engine/stickers/           decal wrap, artwork processing, finishes, manager, library (artwork)
src/engine/environment.js      procedural studios + HDRIs -> one equirect
src/engine/floor.js            seamless floor + env-sampled soft shadows
src/engine/post.js             post stack, PT input with denoise
src/engine/pathtracer.js       three-gpu-pathtracer wrapper (async BVH worker)
src/engine/ptProxy.js          clearcoat -> single-lobe proxies for the path tracer
src/engine/sets/               the places: stage (lighting rig), sky, assets, build kit, facade, city, garage, signs
src/engine/assetUrl.js         local copy or Poly Haven CDN, request queue
src/engine/animations.js       fold, pedal, bell, photo
src/engine/interaction.js      pointer, drag & drop, keyboard
src/ui/                        React panels
```

## Notes

- The WebGL path-tracing backend mis-shades clearcoat (renders black) and RGB
  vertex colours. Clearcoated materials are swapped for equivalent proxies only
  while the path tracer builds its scene; tyre colours are RGBA.
- The BVH builds in a worker (`GenerateMeshBVHWorker`), so `three-mesh-bvh` and
  `three-gpu-pathtracer` are excluded from Vite's dep optimiser.
- Geometry rule: every generated surface must face outward. `orientToNormals`
  re-winds per triangle (tube caps, lathe lids), `orientOutward` fixes shells
  whose normals come from `computeVertexNormals`, and `xf()` re-winds geometry
  moved by a mirroring matrix. `tools/backfaces.mjs` must report "none".

## How a set is lit

- **Raster preview.** The sun is a `SunLight` (three r186 addon, two cascaded
  shadow maps fitted to the view) with exactly the irradiance painted out of
  the HDRI. Ambient light is a probe: the set is captured into a cube map from
  where the bike stands (bike hidden), twice, so the second capture carries one
  bounce. The studio floor's accumulated visibility darkens the ground's
  ambient and area lights under the bike. Shaders compile in parallel
  (`compileAsync`) while rendering is suspended.
- **Path tracing.** Real geometry and area lights, and the HDRI sky *with* its
  sun (spread to 0.7 degrees) as the importance-sampled environment. The path
  tracer reads the scene through `PathTracer.sceneState`, which swaps in the
  sky, per-light `userData.ptIntensity` and the proxies only for as long as it
  reads. An injected "clamp indirect" (after Cycles) limits what a path gathers
  after a rough bounce, which removes sun caustics without touching direct light.
- Traps: an emitter that is also an area light counts twice (keep the mesh's
  emission low in the path tracer); a point light inside an opaque bulb or an
  area light inside a lamp or balcony is blocked in the path tracer (make the
  bulb transmissive there, keep lights clear of geometry); the path tracer
  picks one light per sample, so switched-off lights are hidden from it (twelve
  dark lanterns would leave the sun sampled once in thirteen); long headless
  path tracing screenshots can come back black, use `engine.photo()` for stills.

## Checks

Headless Chrome with the real GPU (ANGLE Metal):

```bash
node tools/shot.mjs shots/out.png --view tre4           # raster
node tools/shot.mjs shots/out.png --pt 1 --spp 128      # path traced
node tools/uitest.mjs                                    # arm, ghost, place, drag, undo
node tools/animtest.mjs                                  # fold + pedal frames
node tools/envgrid.mjs                                   # every environment
node tools/sheet.mjs                                     # sticker artwork sheet
node tools/backfaces.mjs                                 # back faces in red + winding/normal audit
node tools/setshot.mjs --set citta --light sera --views tre4,fronte [--pt 1 --spp 96]
node tools/rpcompare.mjs --set garage --light giorno     # raster vs path traced, per region
node tools/ambienttest.mjs                               # every ambient and light from the UI
node tools/painttest.mjs                                 # custom colour, finishes, fenders
node tools/setqa.mjs citta pomeriggio                    # a ring of views at the orbit limits
node tools/setanim.mjs                                   # fold + pedal inside a set
node tools/photo.mjs garage neon 128 tre4                # a path-traced still via the photo job
```

HDRIs: Poly Haven (CC0): studio_small_09, photo_studio_loft_hall, brown_photostudio_02.
Sets: Poly Haven (CC0) textures, models and skies, listed in `tools/fetch-assets.mjs`.
