# The Last Ember: 3D variant, direction

Written Day 1 (Fri 16 Oct), 11:40. Branch `variant-3d`. The 2.5D team owns `main`; nothing here needs to match it.

The soul is fixed (see `story.md`): a shadow knight, an ancient hearth, sunset to dawn as hour chapters, shades that
are his fallen people, the midnight torch, the dawn choice. What follows is three different *forms* for that soul.

---

## A. HEARTHHENGE: the shadows are the map (tilt-shift diorama)

**Pitch.** The camera looks down at a tiny ring of standing stones in an ocean of black, like a model on a table.
In the middle burns the last hearth. It is the only light in the world, so every stone throws a long black spoke
outward and the courtyard reads as a dial, gold wedges between dark spokes. The shades are made of night and can
only walk in darkness, so the shadows the fire casts are their roads in. The knight holds the gold. Because this is
real 3D, *the height of the flame decides how long the shadows are*. A roaring fire stands taller than the stones,
and their shadows shrink to stubs. A dying fire sits lower than the stones, and their shadows run to the horizon.
The knight casts a shadow too, so wherever he stands he opens a road through the light that leads straight to him.

**Fusion.** *Fire sets the height of the light, the height of the light sets the length of every shadow, shadows are
the only ground the shades can walk, and time burns the fire down.* One more turn of the screw: **after midnight
the light is in his hand.** Every step he takes swings every shadow in the world around the stones like the hands
of a clock. A shade sheltering behind a stone is safe until he walks around it, and then its shelter swings away and
it burns. The verbs are move, cut, flare and shadow-step. A flare makes the flame leap so every shadow snaps short
and anything left standing in the new light burns, but it spends the fire, and the fire is the clock. Embers from
freed shades feed it back, and each one carries a memory.

**Trailer money shot.** At 1 AM, top-down: the knight walks a slow circle around a standing stone with the torch
held high, and the stone's shadow sweeps across the courtyard like a clock hand. Four shades are huddled inside it.
As it passes, they are left in the light and burn to embers one by one. Then cut to the stone ring from above, all
twelve spokes stretching while the hearth gutters at midnight.

**Biggest risk.** Readability. The player has to *see* which ground is safe for shades, and the GPU shadow and the
gameplay shadow have to agree. The mitigation is one shared model. Gameplay computes the same point-light/occluder
geometry on the CPU (light height, occluder height, a ray test), drives a flow field the shades follow, and the
renderer's shadow map draws that same light. The art is high contrast: lit ground is warm gold, shadow is
near-black.

## B. SHADOW PLAY: the wall is the battlefield (fixed cinematic camera)

**Pitch.** One fixed, theatrical camera. In the foreground there is a small 3D courtyard with the hearth. Behind it
stands the vast wall of the fallen keep, and the fire projects everything onto that wall as a giant shadow play. The
shades live *only on the wall*: they are shadows with no bodies. The knight fights them with his own projected
shadow. Walk toward the fire and your shadow on the wall becomes a slow, enormous giant that cleaves ten shades at
once. Step back and it shrinks to a quick, small duellist.

**Fusion.** Fire is the projector, shadow is the battlefield and your weapon, and time dims the fire so the wall
fades and the shades grow bolder. At midnight the projector moves into his hand: now aiming the torch aims the play.

**Trailer money shot.** The knight takes three steps toward the hearth, and on the wall behind him his shadow rises
from man-sized to cathedral-sized and brings its sword down across a horde.

**Biggest risk.** Control mapping. You move in one space and fight in another. It is the most surprising of the
three, but making it feel good is a research problem, not a 30-hour build. It would also look closest to
*Contrast* (2013).

## C. THE EMBER ROAD: the hearth walks (third-person journey)

**Pitch.** Over the shoulder, Journey and *Shadow of the Colossus*. The hearth is a great iron brazier on a sled,
and the knight drags it east by chains across a black, endless plain of a fallen kingdom, toward where the sun used
to rise. The brazier's pool of light is the only safe place in the world, and it moves only when he pulls. When he
lets go to fight, the light stops. At midnight the brazier dies in the middle of nowhere and he walks on with only a
torch.

**Fusion.** The fire is a moving island, the shadow is the sea, and time is distance: the hours are the miles to
the dawn he will not survive.

**Trailer money shot.** An extreme wide shot of one small pool of orange crawling across an infinite black plain,
the chain taut, a hundred red eyes pacing at its edge.

**Biggest risk.** A journey needs a world. Long terrain, set dressing, pacing and a camera that frames both the
fight and the vista add up to a lot of content to author, and the slow walk is weak in a 3-minute trailer.

---

## Pick: A, HEARTHHENGE

1. It is the only one where shadow is real *geometry* that changes play: flame height and shadow length is a 3D
   fact that a 2.5D game cannot show, and that is the surprise.
2. All three themes sit in one physical quantity, the flame. Its height is the fire, the shadows it casts are the
   shadow, and its burning down is the time.
3. The midnight turn, when the light moves into his hand and he steers every shadow, gives the second half a new
   verb rather than a reskin, and it is the trailer's money shot.
4. It is buildable: one arena, top-down steering on a plane, a CPU shadow test and a flow field, and one
   shadow-casting light. The diorama camera hides low-detail primitives and runs on integrated GPUs.
5. The dawn choice can be *walked*, not clicked. The sunrise sweeps every shadow west, and the player either steps
   into the light or stays in the last sliver of shadow.
