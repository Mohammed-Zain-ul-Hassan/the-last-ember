# The Last Ember

A city froze one second before the flood, held there by a single flame. You are the one who lit it.
Carry the flame through the still city, where every shadow moves with your light. Then hold it at the hearth
from sunset to dawn, while the night comes for the second you stole.

**Jam themes: Fire, Shadow and Time.** Each one is a mechanic, a story beat and the atmosphere:
- **Fire:** the flame you carry casts every shadow, and the hearth is your life.
- **Shadow:** lit shadows turn solid, shades rise from the fire's shadows, and one shadow hunts you.
- **Time:** frozen in the city, running out at the hearth, hour by hour until dawn.

## Play
- **In the browser:** https://the-last-ember-xi.vercel.app. This is the production build: Act I, with the hearth at `/classic.html`.
  This branch, `merged-game`, joins the two into one game.
- **Locally**, Node 20.19+ (or 22.12+):
  ```bash
  python run.py
  ```
  This checks Node, installs what is needed, serves the game on http://localhost:5174 and opens it.
  Without Python:
  ```bash
  npm i && npm run dev
  ```

## Live demo (the bot plays it)
```bash
python demo.py
```
This opens a Chrome window on the local dev server (http://localhost:5174, started with `python run.py` if it is not
running; no internet needed), and the bot plays both acts. Stop it any time (Ctrl+C, or close the terminal): the game
pauses where it stands and the window stays open, so anyone can resume from the menu and play. Run it again and the bot
takes over from exactly where it was, whatever was done in between.
- `python demo.py --restart` starts from the very beginning.
- `python demo.py --live` plays the deployed site instead.

If the bot stops making progress, it restarts its district (or skips ahead) by itself. Details: `scripts/demo.mjs`.

## Two acts, one night
1. **Act I: The Still City.** A third-person puzzle adventure through five districts: the Gate Ward, the Market of
   Weights, the Temple of Hours, the Library of Whispers and the Heart.
   - Light a frozen figure from its true angle, and its last ten seconds replay.
   - Spend Ash to step into a replay, or to rewind.
   - Walk on your own shadow.
   - The Wrong Shadow moves only when you look away.
2. **Act II: The Hearth.** Third-person action from 7 PM to dawn.
   - Defend the fire as shades rise from the shadows it throws.
   - At midnight the hearth dies, and you carry its last flame as a torch.
   - The Hollow Marshal waits at 3 AM, and the choice waits at dawn.

The title screen has Easy, Medium and Hard (shared by both acts), and a chapter list for every district and every hour.

## Controls
| Act I: The Still City | Act II: The Hearth |
|---|---|
| **W A S D:** walk (relative to the view) | **W A S D:** move |
| **Mouse:** look; the flame follows (look up to lift it) | **Mouse:** look |
| **Shift (hold):** draw the flame back; run | **Space:** jump, double jump |
| **E / click:** wake a shadow, rest, read | **Click / J:** strike |
| **Hold E:** step into a replay | **Right click / K:** heavy cleave; hold to charge |
| **Hold R:** rewind five seconds | **Shift / L:** shadow-step |
| **Right click / Q:** Flame Lock | **Hold R:** restart the level |
| **H:** ask the flame for a hint | |

In both acts, **Esc** pauses and frees the mouse.

## Trailer
The trailer pipeline is in [`trailer/`](trailer/):
- the game records itself with its sound (`?rec=1`);
- `scripts/plan_v2.py` and `scripts/cut_v2.py` cut it to the jam's rules;
- `scripts/score_v2.py` synthesises an original score;
- the edit is in Remotion.

Plan and research: [`docs/trailer-v2.md`](docs/trailer-v2.md).

## Assets
Everything is made in code by the team, or is free to use; each source and licence is in [`ASSETS.md`](ASSETS.md).

## Team
- Mohammed Zain ul Hassan
- Ahnaf Abdullah
- Moeez Abid (game design and narration of the Still City)
- Huzaifa Tahir

Built in 3 days for a vibe-coding game jam, with Claude Code. Three.js, TypeScript and Vite.
