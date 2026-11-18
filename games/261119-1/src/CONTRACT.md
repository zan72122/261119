# ママのドレッサーでおでかけじゅんび — build contract

A wordless, one-finger 3D web game for a 5-year-old girl (iPhone / iPad Safari). One self-contained
`index.html` (built by `build.py` from `vendor/three.min.js` + `src/*.js`). No external loads, no assets from
outside: every texture is drawn on a canvas, every sound is synthesised with Web Audio.

## Story (what the player does)
Morning light. A little girl, fresh from the bath with a towel over her head, sits at **Mum's dresser**
(三面鏡 — a three-panel mirror, closed). Seen from behind and above; her face appears in the mirror.

1. **Open the mirror** — drag each mirror wing open. Her sleepy face appears in the glass.
2. **Towel** — pull the towel off her head. Wet hair flops flat. Towel ends up hung on the chair back.
3. **Dryer「ふぉーん!」** — pick up Mum's hair dryer; while held it roars and blows wherever the finger points.
   Wet dark strands dry, lighten and puff up into a big fluffy mop (funny). Blowing at other things does
   things too (tissues fly out of the box one after another, the hung towel flaps, the pochette swings …).
4. **Brush** — stroke the brush down the hair; it becomes sleek and glossy. Then — *pyoko!* — one cowlick springs
   up at the crown. Brushing it down only makes it pop back up.
5. **Music-box jewellery box** — lift the lid (a tune plays, a little flower twirls). Inside are three hair clips
   (ribbon / flower / star). Carry one to her hair: it snaps on and holds the cowlick down. More clips can be added.
6. **Pochette** — take the little shoulder bag from the chair back and put it on her. Ready!
7. **Genkan (front door)** — she stands at the door. Press the handle / swing the door open: sunshine, birds.
   Mum is waiting outside under a parasol (seen from behind). They hold hands and walk off. Gentle ending,
   then a new morning starts.

No text, no numbers, no fail states, no timers. The next thing to touch is always shown *inside the world*
(glow, wobble, light, the girl's gaze, finally a translucent demo finger).

## Visual bar
Photorealistic, ordinary-looking 3D: a real Japanese bedroom, real materials (wood grain, glass, terry cloth,
glossy plastic, satin, skin). NOT toy-like, NOT low-poly, NOT picture-book, nothing surreal or creepy.
Smooth silhouettes (enough segments, bevelled edges — no razor-sharp box corners), believable proportions and
scale, PBR materials (`MeshStandardMaterial` / `MeshPhysicalMaterial`) with procedural canvas textures
(albedo + roughness/bump where it matters). Soft, warm morning light.

## Tech conventions (all modules)
- three.js **r160** is the global `THREE` (UMD build, already in `vendor/`). Use r160 API:
  `texture.colorSpace = THREE.SRGBColorSpace`, physically based light units (no legacy lights), no `examples/jsm`
  add-ons (not available — write what you need yourself).
- Plain ES2017 script files, each wrapped in an IIFE, registering factory functions on the global `GF`
  (`window.GF`). No modules/imports, no build step, no `eval`, never write the literal `</script` in JS.
- `src/base.js` (already written — read it first) provides: `GF.makeRenderer`, `GF.makeEnv`, `GF.addLights`,
  `GF.LIGHT`, `GF.POS`, `GF.HEAD`, `GF.SHOTS`, `GF.applyShot`, `GF.canvasTex`, `GF.makeGlow`, `GF.rng`,
  `GF.noise2`, `GF.fbm`, `GF.damp`, `GF.ease`, `GF.clamp`, `GF.lerp`, `GF.smooth`. Use them; do not edit base.js.
- Units: metres, seconds, radians. World axes: **+X = screen right, +Y = up, +Z = toward the camera**.
  The girl faces **−Z** (toward the mirror); the camera looks at her back from +Z, from above.
- Renderer pipeline (fixed): sRGB output, ACES filmic tone mapping, exposure 1.0, PCFSoft shadows,
  `scene.environment = GF.makeEnv(renderer)`.
- Performance target: iPad at 30 fps+. Whole game budget ≈ 250k triangles, ≈ 150 draw calls, canvas textures
  ≤ 512² (1024² only for 1–2 big surfaces), all start-up generation fast (whole game < ~2 s on a tablet).
  Merge static geometry where easy, share materials, no per-frame allocations in `update` (reuse vectors).
- Every factory takes `opts.low` (boolean, low-power mode → fewer segments / strands / no extras).
- `update(dt, t)` is called once per frame by the game (`dt` ≤ 0.05 s, `t` = seconds since start).
- Meshes that should cast / receive the sun's shadow set `castShadow` / `receiveShadow` themselves.
- Interactive objects expose `setGlow(v)` (0..1 warm emissive pulse; `GF.makeGlow(meshes)` does it) and
  the game does the hit testing itself (big screen-space hit zones), so no raycast helpers are needed.
- Robustness: no exceptions on repeated / out-of-order / rapid calls; all setters idempotent and clamped.

## Layout (see `GF.POS`, `GF.HEAD`, `GF.SHOTS` in base.js for the numbers)
Dresser scene (world): floor y=0. The girl sits on the chair at the origin (seat top y=0.42), head centre
(0, 0.93, 0). Dresser top y=0.70, body x∈[−0.56,0.56], z∈[−0.72,−0.22], knee hole in the middle.
Centre mirror glass: x∈[−0.22,0.22], y∈[0.76,1.52], plane z=−0.685, vertical. Back wall z=−0.74.
Wings: vertical hinges at x=±0.235, z=−0.67, each wing 0.22 wide. Closed = folded flat over the centre glass
(wood back toward the room, the two free edges meet at x=0); open = swung 155° so the wing flares ~25° toward
the room and its mirror face looks at the girl.
Props on the dresser top: dryer stand (0.40,0.70,−0.43), music box (0.33,0.70,−0.30), tissue box
(−0.36,0.70,−0.42), brush cup (−0.27,0.70,−0.29). Chair back: posts at x=±0.17, z=0.20, top rail y=0.66,
finials top y=0.70; towel hangs on the left half of the rail, pochette on the right finial.
Camera "work" shot: from (0,1.72,1.62) looking at (0,0.98,−0.30): we see her back / the top-back of her head,
the dresser top to the left and right of her, and above her head the mirror with her reflected face.
Window with a sheer curtain on the left wall (x≈−1.7, z∈[0,1.3]); the sun comes from the upper left, slightly
behind the camera (`GF.LIGHT.keyPos`).

Head-local frame (`GF.HEAD`): origin = head centre, face toward −Z, back of the head +Z. Skull ellipsoid radii
(0.072, 0.096, 0.088). Neck capsule, shoulder ellipsoid, ear / brow / eye / nose / mouth heights are in `GF.HEAD`.

Genkan scene (world, shown instead of the dresser room): girl stands at (0,0,0.25) facing −Z on the tiled
entrance floor (y=0); raised hallway floor (y=0.12) for z>0.75 (the camera hovers over it). Door plane z=−1.50,
leaf 0.86 × 2.0, hinge at x=−0.43, lever handle at (0.33,0.98,−1.50), opens **outward** (away from the camera).
Outside: porch, garden path leading away (−Z), Mum at (0.42,0,−2.9) facing −Z (her back to us).

## Module APIs

### `src/sets.js` — `GF.createSets({renderer, low})` → 
```
{ root,                          // THREE.Group to add to the scene (contains both sets and their lights)
  activate(name),                // 'dresser' | 'genkan' — shows one set + its lights, hides the other
  dresser: {
    group, lights: {key, hemi, fill},
    wings: { L: {pivot, knob, setOpen(v), open}, R: {…} },   // v 0 = closed … 1 = open (see layout); knob = Object3D at the free-edge knob (for hit tests / glow)
    setWingGlow(side, v),        // 'L' | 'R' : glow the knob + edge of that wing
    mirror: { update(renderer, scene, camera), setSize(px), setEnabled(bool) },  // planar reflection of the centre glass, call before the main render
    setCurtainWind(v),           // 0..1 extra flutter (dryer pointed at the window / door breeze)
    update(dt, t) },
  genkan: {
    group, lights,
    door: { pivot, handle, setOpen(v), setHandle(p), open },  // v 0..1 (1 ≈ 80° outward); p 0..1 lever pressed
    setDoorGlow(v),              // glow on the lever handle
    setDaylight(v),              // 0 = door shut (dim interior, light leaking round the door) … 1 = sun floods in
    update(dt, t) } }
```
### `src/props.js` — `GF.createProps({low})` →
```
{ group,                         // everything, in world coordinates of the dresser scene (add to scene)
  dryer: { group, nozzle, home: {position, quaternion}, setOn(bool), setGlow(v), updateCord() },
           // group origin = where the hand holds it; the air leaves along local +Z from `nozzle` (Object3D at the nozzle mouth)
           // home = resting pose on its stand (world). The game sets group.position/quaternion every frame while held.
  brush: { group, home, setGlow(v) },   // origin = handle grip; bristles face local −Z; head toward local +Y
  tissue: { group, setGlow(v), blow(dirWorld, strength) → bool, count, reset(), restore(n) },
           // blow(): wind hits the box → (rate-limited internally) the top tissue is sucked out, flutters and settles; next one pops up
  musicBox: { group, lid: {pivot, knob}, setLid(v), lidOpen, setSpin(radPerSec), setGlow(v) },  // v 0 closed … 1 open
  clips: [ {id, group, home: {position, quaternion}, setGlow(v)} ×3 ],   // ids 'ribbon','flower','star'; group origin = underside centre, local +Z = outward (away from hair), +Y = up
  pochette: { group, home, worn, setWorn(bool), swing(impulse), setGlow(v) },
           // group = hanging on the chair finial (origin = top of strap loop); worn = a second group modelled to sit on the girl's
           // back/hip (to be parented to girl.torsoAnchor: origin = chest centre between the shoulder blades, same axes as head-local)
  towel: { head, hung, setState(s), setSlide(p, dx), flap(v), setGlow(v) },
           // head = draped-on-the-head form in HEAD-LOCAL coords (the game parents it to girl.headAnchor);
           // hung = hanging over the chair rail (world). s: 'head' | 'hung' | 'hidden'. setSlide: p 0 = on the head … 1 = slid off (dx = −1..1 sideways lean of the pull)
  finger: { group, setOpacity(v) },    // translucent demo finger, origin = fingertip, pointing along local −Y (finger body extends to +Y)
  update(dt, t) }
```
### `src/girl.js` — `GF.createGirl({low})` and `GF.createMom({low})`
```
girl: { group,                   // root on the floor; seated pose puts the head centre at GF.POS.headSit when group is at the origin
  headAnchor,                    // Object3D at the head centre, head-local axes; moves with her head (reactions, breathing)
  torsoAnchor,                   // Object3D at the chest centre between the shoulder blades (for the worn pochette)
  handR,                         // Object3D in her right palm
  setPose(p),                    // 'sit' | 'stand'
  setFace({smile, blink, squint, mouthO, gazeX, gazeY}),  // any subset; targets 0..1 (gaze −1..1), smoothed internally; she also blinks by herself
  lookAt(worldPos | null),       // where her eyes / a little of her head go (null = looks at herself in the mirror)
  setWindFace(v),                // 0..1 while the dryer blows at her: eyes squeeze, shoulders up a little
  react(name),                   // 'wake' | 'tickle' | 'surprise' | 'happy' | 'nod'  — short one-shot body + face animations
  setTowelOn(bool),              // optional pose tweak
  setWalk(v), holdHand(v),       // 0..1 walk-cycle amount (legs/arms swing, the game moves group.position) ; raise the right hand to Mum's
  update(dt, t) }
mom:  { group, handL, reach(v), setWalk(v), update(dt, t) }   // back view, under a parasol; handL = Object3D in her left palm
```
### `src/hair.js` — `GF.createHair({anchor, low})` →
```
{ group,                         // add to the scene (simulated in world space, roots follow `anchor` = girl.headAnchor)
  update(dt, t),
  setWind(origin | null, dir, strength),   // dryer / breeze: THREE.Vector3 world origin + unit dir, strength 0..1; null = off
  brush(pointWorld, velWorld, radius) → contact 0..1,
  wetness, fluff, smoothness,    // getters, 0..1 averages over the head
  setTowel(v),                   // 1 = pressed flat under the towel, 0 = free
  cowlick: { state, pop(), pin(), unpin(), tip(outVec3) },   // state 'none' | 'up' | 'pinned'
  onPop,                         // callback(count) each time the cowlick springs up
  surfacePoint(rayOrigin, rayDir, out) → bool,   // out = {position, normal} world, on the outer hair surface (to snap clips / brush / dryer target)
  setPreset(name),               // 'wet' | 'fluffy' | 'sleek' — instant
  serialize(), restore(obj),     // small JSON-able state
  setDetail(f) }                 // 0.4..1 fraction of strands drawn
```
### `src/audio.js` — `GF.createAudio()` → all sound, synthesised (see the audio brief for the list)
```
{ unlock(), suspend(), resume(), play(name, {vol, rate, pan}), 
  dryer: {set(on, load)}, brush: {set(speed)}, musicBox: {start(), stop(), setRate(r)}, ambience(name, level), update(dt) }
```
### `src/game.js` — renderer, camera, input, story state machine, hints, fx particles, save/restore, perf, fallback.

## House rules for implementers
- You own exactly the file(s) named in your brief. Do not touch other files, do not commit, do not push.
- No test suites, no test scaffolding, no extra verification. The only checking you do: make sure your file
  parses and runs without console errors, and LOOK at it — render it in headless Chromium with
  `node <scratch>/dev/shot.js page.html out.png [w h waitMs js]` (copy `<scratch>/dev/harness.example.html`
  into your own scratch sub-folder and load your module there), read the PNG, and iterate on the look until it
  honestly passes the visual bar. Keep preview files in the scratch folder, never in the repo.
- Finish by reporting, briefly: what you built, the exact public API (anything that differs from this contract),
  key dimensions/anchors other modules must know, and known weaknesses.
