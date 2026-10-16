# Visual / character critique log

Each round: screenshot the title, a combat frame and a card frame at 1280x720. Ask "would this frame stop a judge
scrolling?" List the biggest gaps, fix the top ones, repeat.

## Round 0 (playable-1, Day 1 11:50) — "decent, but no character" (user)
- **Fire has no shape.** The hearth is a glowing white blob of particles. The star of the game looks like a lamp.
- **The hero isn't on the title screen.** The title shows an empty ruin, so there's no character, no promise.
- **The knight is a mannequin:** ~7% of frame height, primitive limbs, a stiff idle, no signature silhouette moment.
  Nothing says "shadow knight"; he's just a dark figure.
- **Shades are blobs.** No menace, no anatomy, no spawn telegraph. The theme mechanic (rising from cast shadows)
  is invisible.
- **The world is static and placeless.** Random shard skyline, no moon/sun, no wind, no ash, no banners, nothing
  that says "fallen kingdom". The ground is a flat plane.
- **Silhouettes have no rim light**, so shapes merge into the dark background. AAA silhouette art lives on rim light.
- **The camera is distant and passive.** No framing intent, no reaction to big moments.
- **No story beats.** The knight never kneels, swears or reacts. Midnight, the torch and dawn don't exist yet.

## Round 1 plan (highest wow per hour first)
1. Shader flame (fbm-distorted teardrop, layered, HDR ramp) + smoke column + ember storm.
2. Knight v2: heroic proportions, long swept horns, tattered cape (alpha mask), greatsword with edge glow,
   shadow-smoke aura, kneel/oath pose on title and hour cards, idle breathing and cape in the wind.
3. Fresnel rim light on every silhouette, tinted by the hour's sky. This is the single biggest look upgrade.
4. Wraith shades: tall, hooded, tattered robes, long claws, an ink pool on the ground that ripples before they rise.
5. World: a sun/moon disc in the sky, light shafts, drifting fog banks, falling ash, kneeling statues of his fallen
   order, tattered banners, grass tufts.
6. Camera closer, plus slow-motion and zoom on the last kill of the hour; film grain.

## Round 1 result (Day 1 ~12:10)
Done: shader flame, knight v2 (horns, torn cape, greatsword with glowing edge, shadow-smoke aura, kneel pose),
fresnel rim tinted by the sky, wraith shades with tattered robes, claws and ink pools, kneeling statues, banners,
grass, fog banks, sun/moon disc, cathedral landmark, film grain, reverb + melody.
Critique: the first pass washed everything to mid-brown (fog cards, rim and stone too bright). Fixed by restoring
deep blacks. The title text was over the fire; moved it to the top third with the knight kneeling close beside the
flame. Ash read as snow; the skyline formed "hanging teeth" at the frame top; midnight hid the knight behind the
brazier; dawn was flat sepia. All fixed.

## Round 2 result (Day 1 ~12:20)
- The theme mechanic is now visible: violet ink-mist seeps from every cast-shadow zone (where shades rise).
- The great shade smoulders red so it reads in the dark. 3 AM sky lifted slightly. Wisps are smaller and colder.
- The shadow ending was unreachable (a wall blocked the walk left); the threshold moved to the arch's shadow.

## Round 3 candidates (next loop)
- The knight is ~1/5 of the frame in arena play; add dynamic zoom-in on combos and a kill-cam for the great shade.
- Shade hit-flash (ember rim pulse) and a stagger silhouette pop.
- The kneel pose reads hunched on the title; straighten the back, plant the sword more visibly.
- Human checks Claude can't do: does combat feel good? Is the audio mix right?

## Round 3 result (Day 1 afternoon) — user notes: "a shadow with an aura, not a stiff body"; "slashes are all the
same vertical swing"; "no jump animation"; "animations must be consistent"
- **Living shadow:** the body is pure matte black (no specular, so the fire can't light him like a mannequin).
  Silhouette edges erode into drifting smoke (noise discard on the fresnel edge), a deep-violet inner rim glows,
  every part has a flickering aura shell, violet shadow-fire rises behind him, and smoke bleeds off every limb.
  The dawn ending dissolves him through the same shader.
- **No more stiffness:** every pose goes through damped springs (follow-through and overshoot; stiff and exact
  during swings so they still hit their frames). The head lags the chest; idle has weight shift and breathing.
- **Jump cycle:** take-off stretch, rising tuck, falling reach, landing squash and crouch, then back to idle.
  Verified numerically per phase (sy 1.057 rise, knees 1.52 tucked, 0.6 extended falling, sy 0.944 on landing).
- **Slashes:** five variants (overhead cleave, diagonal, rising diagonal, horizontal sweep, backhand) with
  randomized angles and swing-plane tilt; the trail lives in the same tilted plane. Fixed a bug where the trail
  started mid-swing.
- **Round 3 asks:** shades flash ember-red when struck, the camera leans in during close combat, the kneel is
  straighter with the sword planted.
- **Bugs found:** a negative frame time from debug ticks exploded the springs (dt clamped, springs self-heal);
  adaptive resolution added for slow GPUs.

## Round 4 (Day 1 night, branch AhnafEdits) — user: "aura instead of a mere outline; the sword needs its own aura
and definition; fluid movement and a real idle"
- **Aura, not outline:** the OutlineEffect is gone. A screen-space aura (src/render/auraEffect.ts) renders his
  silhouette to a mask (body red, sword green) and feeds a persistent buffer that advects upward through swirling
  noise and decays, so shadow-fire hugs him at rest, streams behind a run, hangs behind a dash and gutters below 30%
  health. The hot rim is drawn only where he is this frame, so trails stay dark smoke. His body stays pure black.
- **Sword:** a diamond-section blade (lit facet, raised spine), burning edges, a rune channel with energy pulsing
  hilt to point, swept quillons, a pommel stone that breathes, and a violet light on the ground. Its own aura sheath
  is motion-blurred between frames into a short comet tail, so swings never strobe into ghost blades. It turns ember
  in the torch phase.
- **Movement:** per-joint spring gains (core leads, head, arms and blade follow), acceleration lean, stride that
  scales with speed, a streaming cape at a run, skid and brake poses, a pivot toward the camera instead of a flat
  mirror flip, a double-jump somersault, a hit recoil. The knight is drawn between sim steps (60 Hz sim, any
  refresh rate), which removes judder.
- **Idle:** an asymmetric breath (chest, shoulders, head, eyes, cape), weight shifting between legs, a guard stance
  after fighting that relaxes into rest, and fidgets: a glance back, a blade twirl, a shoulder roll, a flick.
- **Bug found:** Low quality (or auto quality at its lowest step) rendered a black screen; fixed in Stage.setSmaa.
- **Human checks Claude can't do:** whether the new idle and run *feel* right in the hand, and the aura's strength
  on a projector.

