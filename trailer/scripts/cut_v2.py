"""The Last Ember, trailer v2: the cut, bar by bar (120 BPM: a bar is 2.0 s). Read by plan_v2.py.

Shape (docs/trailer-v2.md has the why, with sources):
  cold open on the verb (the flame sweeps every shadow; something stands in the dark) -> title -> ACT I
  -> tell, show, repeat for each theme (card, then one unhurried take of exactly that) -> the stalker, cuts tightening
  -> stopdown -> the Heart ("It has your hands") -> ACT II braam -> the hours, building -> midnight stopdown
  -> escalation (cuts 4 s down to 1 s, Shepard riser, a beat of silence) -> the Marshal, one 21 s take on the drop
  -> dawn -> button (back in the city, his shadow) -> theme montage -> end card.
Every gameplay shot is anchored to an event in its take's moments log (capture-v2.mjs); `pre` is how many seconds
before the event the shot starts (negative: after it).
"""

THEMES = [
    {"name": "FIRE", "how": "the flame you carry casts every shadow",
     "card": ["Aim the flame: every shadow in the city swings with it.", "At the hearth, the fire is your life."]},
    {"name": "TIME", "how": "frozen in the city, running out at the hearth",
     "card": ["Light a frozen figure from its true angle: its last ten seconds return.", "Ash is time. Spend it to step in, or rewind."]},
    {"name": "SHADOW", "how": "shadows hold you up, and one hunts you",
     "card": ["A lit shadow turns solid: walk the bridge your body casts.", "And one shadow moves only when you look away."]},
]
FIRE, TIME, SHADOW = 0, 1, 2


def build(gp, scene, card, over, cue, here):
    # ---------------- COLD OPEN: no logo. The verb in the first frame, something waiting in the dark.
    cue("cold")
    gp("hook", "A1_main", "wrongSeen@gateWard", 3, "Hook: he sweeps the flame down a frozen street; every shadow swings; far off, a figure that is not frozen", pre=4.5)
    # ---------------- TITLE (over the title screen: the knight, the flame, the rain)
    cue("title")
    card("title", "title", 2.5, "Title: THE LAST EMBER, the logline, FIRE / SHADOW / TIME")
    # ---------------- ACT I
    card("act1", "act", 1.5, "ACT I: The Still City", act="ACT I", name="THE STILL CITY", subtitle="Everyone stopped one second before the flood.")
    cue("still")
    gp("walk", "A1_main", "district@gateWard", 4, "The frozen city: rain hanging in the air, statues mid-step, the flame the only light", pre=-6.5)
    over("line", here() - 3.5, 2.5, text="You carry the last flame.")
    # ---------------- FIRE: tell, then show it in one unhurried take
    card("card_fire", "card", 2.5, "Theme explainer: FIRE", theme=FIRE)
    cue("puzzle")
    gp("fire_take", "A1_main", "wake#1", 10, "One take: aim the flame, the coaching ring, the shadow lines up, the figure wakes and replays its last ten seconds", pre=13)
    over("lowerThird", here() - 10 + 0.5, 2.5, theme=FIRE)
    # ---------------- TIME
    card("card_time", "card", 2.5, "Theme explainer: TIME", theme=TIME)
    cue("still")
    gp("step_in", "A1_main", "stepIn#1", 4, "Spend Ash: step into the replay as a ghost and do what the figure did", pre=1.5)
    over("lowerThird", here() - 4 + 0.5, 2.5, theme=TIME)
    gp("replay2", "A1_main", "wake#3", 2, "A second figure, a second last moment (the Market or the Temple)", pre=1.0)
    # ---------------- SHADOW
    card("card_shadow", "card", 2.5, "Theme explainer: SHADOW", theme=SHADOW)
    gp("bridge", "A1_main", "bridge", 4, "Draw the flame back: his own shadow runs out over the canal and holds him up", pre=3)
    over("lowerThird", here() - 4 + 0.5, 2.5, theme=SHADOW)
    # ---------------- THE STALKER: cuts tighten 3 -> 1.5 bars, the heartbeat quickens
    cue("stalk")
    gp("stalk1", "A1_main", "wrongSeen@library", 3, "The Wrong Shadow, wearing his face, frozen in the lamplight", pre=1.5)
    gp("stalk2", "A1_main", "wrongShift@library", 1.5, "Look away: it is closer", pre=0.5)
    gp("stalk3", "A1_main", "wrongLit@library", 1.5, "Swing the flame onto it: it stops dead", pre=0.5)
    # ---------------- THE HEART: who it is (stopdown into the reveal)
    cue("reveal")
    scene("heart", "A1_main", "ending", 3, "The Heart: \"It has your hands.\" The shadow is him; he lit the flame", pre=-1.0)
    # ---------------- ACT II: one braam, then the sun moves for the first time
    cue("act")
    card("act2", "act", 2, "ACT II: The Hearth", act="ACT II", name="THE HEARTH", subtitle="Carry it out. Hold it until dawn.")
    cue("hearth")
    gp("sunset", "A2_7pm", "mode:play", 5, "7 PM: sunset on the hearth grounds, the first shades, the knight's sword cuts", pre=-1.0)
    over("line", here() - 4, 2.5, text="For the first time in four thousand years, the sun sets.")
    cue("drive")
    gp("rise", "A2_9pm", "spawn#3", 3, "9 PM: shades rise out of the shadows the fire throws", pre=0.6)
    gp("crawl", "A2_11pm", "pounce#1", 1.5, "11 PM: a crawler pounces, the cleave answers", pre=0.8)
    gp("ember", "A2_11pm", "feed#1", 1.5, "An ember carried home: the hearth flares", pre=1.8)
    # ---------------- MIDNIGHT: stopdown, only the fire
    cue("midnight")
    scene("midnight", "A2_midnight", "mode:midnight", 3, "Midnight: the hearth dies; he lights the torch from its last flame", pre=-1.0)
    # ---------------- ESCALATION: the torch in the dark; cuts 2 -> 1 -> 0.5 bars; a Shepard riser; one silent beat
    cue("escalate")
    gp("e1", "A2_1am", "kill#2", 2, "1 AM: the lower city, the torch swings every shadow", pre=1.2)
    gp("e2", "A2_5am", "bolt#3", 1, "5 AM: lantern-eater bolts over the wall walk", pre=0.6)
    gp("e3", "A2_1am", "kill#5", 0.5, "A kill in torchlight", pre=0.4)
    gp("e4", "A2_9pm", "kill#6", 0.5, "A dash-strike through a shade", pre=0.4)
    gp("e5", "A2_5am", "kill#4", 0.5, "On the wall", pre=0.4)
    gp("e6", "A2_3am", "spawn#2", 0.5, "The cathedral: something vast stirs", pre=0.3)
    # ---------------- CLIMAX: the drop. One uninterrupted 21 s take.
    cue("climax")
    gp("climax", "A2_3am", "marshalCry#1", 10.5, "Climax, one take: the Hollow Marshal rises, his cry, the waves jumped, the kill", pre=3.0)
    # ---------------- DAWN
    cue("dawn")
    scene("dawn", "A2_dawn", "mode:choice", 3, "Dawn: the light reaches the gate; the choice", pre=4.0)
    # ---------------- BUTTON: back in the city, one shadow still standing
    cue("after")
    gp("button", "A1_library", "wrongSeen#1", 1.5, "Button: in the still city a shadow with his face turns toward the camera", pre=0.3)
    # ---------------- THEME MONTAGE: three hits, one word each
    cue("montage")
    gp("m_fire", "A2_7pm", "fireburst#1", 0.5, "Montage FIRE: a burst of hearth fire", pre=0.2)
    over("tag", here() - 0.5, 0.5, theme=FIRE)
    gp("m_time", "A1_main", "rewind#1", 0.5, "Montage TIME: a rewind", pre=0.2)
    over("tag", here() - 0.5, 0.5, theme=TIME)
    gp("m_shadow", "A2_9pm", "spawn#8", 0.5, "Montage SHADOW: a shade rising from a cast shadow", pre=0.2)
    over("tag", here() - 0.5, 0.5, theme=SHADOW)
    # ---------------- END CARD (held 6 s)
    cue("end")
    card("end", "end", 3, "End card: name, play link, FIRE / SHADOW / TIME, Built in 3 days with Claude Code")
