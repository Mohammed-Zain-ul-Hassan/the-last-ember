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
