# The Last Ember: the loop (story branch)

Built on `story`, from the teammate's pitch: every shadow faces away from the exit; one shadow matches nothing in
the room and points at something that has not happened yet; that shadow is yours. The twist: the city froze because
the flame was lit with someone standing in its heart, and every replay shows people reaching for that person: you.

Shaped by three brainstorms (story beats, build plan, a critic) and sourced research (Braid, BioShock, Obra Dinn,
Outer Wilds, Celeste, Brothers, Spec Ops, Inside; Cavanagh on why viewers miss wrong shadows unless staged).

## The truth (only said at the end)
On the city's last night the hearth was dying. The knight did not sleep at his post (that is the lie his memory
tells). He stepped into the hearth and gave it himself. It caught, and time stopped one minute before dawn, with his
people turned back at the Dawn Gate, reaching for him. The night has replayed ever since. The shades are those
people, still reaching for the one in the fire.

## The rules the player sees
- **Still shadows.** Every stone and post throws a second shadow west, away from the Dawn Gate, from a dawn that
  never came. They never move with the fire, the fire cannot lift them, and the knight casts none.
  (`render/frozenShadows.ts`: one depth map baked per level, sampled by every `surface()` material.)
- **The ownerless shadow.** A knight's shadow with no knight, arms open, lying long out of the hearth: ink black, his
  own violet at its edge. It stands where he will stand: in the hearth (7-11 PM, a new pose each hour), at the next
  brazier before he reaches it (1 AM, 3 AM), in the gatehouse at 5 AM. (`render/ghost.ts`, its own lower-angle map.)
- **Time has stopped in the firelight.** Rain hangs in the air inside the light's radius; nothing splashes there.
- **The memories are replays.** Shadow theatre that ends where it is still happening.

## Beats
| Hour | Line | Whisper (once) | Memory after |
|---|---|---|---|
| 7 PM | The sun sets, as it has every night. Keep the hearth. | The fire moves. These shadows do not. / One shadow here belongs to no one. | Your oath: keep it burning. Whatever it costs. |
| 9 PM | They rise from the dark, and every hand reaches for the fire. | The shadow in the hearth has moved since the last hour. | Their faces. Every one of them turned toward the fire. |
| 11 PM | The flame sinks lower. The shadow in its heart does not. | It stands in the heart of the fire now. Arms open. | (the lie) You closed your eyes. The fire went out. |
| Midnight | The hearth is ash. The shadow that stood in it is gone. | | |
| 1 AM | The hearth is ash. Its fire is in your hand. Its shadow went ahead. | Someone is already waiting at the brazier ahead. / It was here before you. | At the Dawn Gate they stopped running. They turned back. Why? (restaged) |
| 3 AM | No moon. No stars. Only the torch, and a shadow that waits ahead. | Its shadow is ahead of you again. / He was nearest the fire. He almost reached it. | Someone stepped into the fire. Every hand reached for him. (restaged: he climbs in; time stops) |
| 5 AM | Dawn is one minute away. It has been for a hundred years. | Every shadow here has its back to the Dawn Gate. | |

## Dawn: the reveal (about 25 s), then the choice
The sun reaches the Dawn Gate for the first time in a hundred years. The last memory is not a memory: the people,
frozen mid-reach at the gate; the camera follows their reach to the fire and the one standing in it, arms wide, in
front of the flame. His eyes open, violet. *It was you. You never closed your eyes. You stepped in. You gave the fire
yourself, and the night stopped.*

The choice is a walk, not a menu (Brothers, not Mass Effect):
- **Back to the fire** (walk west into the gatehouse shadow): he kneels with the torch; the sun sinks back; time
  stops everywhere (rain, embers). *No one aged. No one woke. No one was lost. The sun sets, as it has every night.*
  The title comes back frozen: beginning again is the loop.
- **Into the morning** (walk east into the sun): the torch goes out, the first moment with no fire on screen; the
  still shadows turn and fade as the sun climbs; he fades. *Somewhere, a shadow moved. Then all of them did. They went
  home. So did he.*

## Trailer cards (themes)
- The fire stopped time.
- Time froze every shadow.
- One shadow is waiting for you to light the fire.
