"""The Last Ember, trailer v2: the cut, bar by bar (120 BPM: a bar is 2.0 s). Read by plan_v2.py.

Shape (Moeez, 2026-10-18: "around 3 minutes, and the last 2 minutes should be of pure gameplay"; the why, with
sources: docs/trailer-v2.md):
  TEASER, 0:00-0:59 (the stylised minute): cold open on the verb -> title -> ACT I -> tell, show for each theme
    (card, then a glimpse of exactly that) -> the Heart ("It has your hands") -> ACT II braam -> a quickening
    glimpse of the hours -> midnight.
  GAMEPLAY, 0:59-2:59 (120 s, raw only: no cards, no cutscenes, no lettering but small corner tags): the story again,
    played: one unhurried take of the true angle -> stepping into a replay -> the shadow bridge -> the stalker
    -> the hearth at sunset -> the hours building -> the torch in the dark -> the Marshal, one 21 s take on the drop
    -> the dawn choice -> a last look back at the still city, the play link in the corner.
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
    # ================= TEASER (0:00-0:59) =================
    # COLD OPEN: no logo. The verb in the first frame, something waiting in the dark.
    cue("cold")
    gp("hook", "A1_main", "wrongSeen@gate", 3, "Hook: he sweeps the flame down a frozen street; every shadow swings; far off, a figure that is not frozen", pre=4.8)
    cue("title")
    card("title", "title", 2.5, "Title: THE LAST EMBER, the logline, FIRE / SHADOW / TIME")
    card("act1", "act", 1.5, "ACT I: The Still City", act="ACT I", name="THE STILL CITY", subtitle="Everyone stopped one second before the flood.")
    # THE THREE THEMES: tell (card), show (a glimpse of exactly that, its word low on the frame)
    cue("puzzle")
    card("card_fire", "card", 2, "Theme explainer: FIRE", theme=FIRE)
    gp("t_fire", "A1_main", "district@gate", 2, "Glimpse: the flame swung, every shadow swinging with it", pre=-7.0)
    over("lowerThird", here() - 2 + 0.25, 1.5, theme=FIRE)
    card("card_time", "card", 2, "Theme explainer: TIME", theme=TIME)
    gp("t_time", "A1_main", "wake#2", 2, "Glimpse: a frozen figure wakes and replays its last seconds", pre=0.5)
    over("lowerThird", here() - 2 + 0.25, 1.5, theme=TIME)
    cue("stalk")
    card("card_shadow", "card", 2, "Theme explainer: SHADOW", theme=SHADOW)
    gp("t_shadow", "A1_main", "wrongShift@market", 2, "Glimpse: look away, and the Wrong Shadow is closer", pre=0.5)
    over("lowerThird", here() - 2 + 0.25, 1.5, theme=SHADOW)
    # WHO IT IS (stopdown into the reveal), then ACT II on a braam
    cue("reveal")
    scene("heart", "A1_main", "ending", 2.5, "The Heart: \"It has your hands.\" The shadow is him; he lit the flame", pre=-1.0)
    cue("act")
    card("act2", "act", 2, "ACT II: The Hearth", act="ACT II", name="THE HEARTH", subtitle="Carry it out. Hold it until dawn.")
    cue("drive")
    gp("t_sunset", "A2_7pm", "kill#5", 1, "Glimpse: sunset at the hearth, a sword cut", pre=0.5)
    gp("t_rise", "A2_9pm", "t=25.0", 1, "Glimpse: shades rising from the fire's shadows")
    gp("t_torch", "A2_1am", "t=21.0", 1, "Glimpse: the torch in the lower city")
    gp("t_marshal", "A2_3am", "t=12.5", 1, "Glimpse: the torch in the cathedral, a burst of fire")
    cue("midnight")
    scene("midnight", "A2_midnight", "mode:midnight", 2, "Midnight: the hearth dies; he lights the torch from its last flame", pre=-1.0)

    # ================= GAMEPLAY (0:59-2:59): raw play only =================
    cue("puzzle")
    gp("fire_take", "A1_main", "wake#1", 10, "One take: aim the flame, the coaching ring, the shadow lines up, the figure wakes, he steps in, the lever", pre=7)
    over("corner", here() - 10 + 0.5, 3, theme=FIRE, text="the flame casts every shadow")
    cue("still")
    gp("step_in", "A1_main", "stepIn#2", 4, "Spend Ash: step into the replay as a ghost and do what the figure did", pre=1.5)
    over("corner", here() - 4 + 0.25, 3, theme=TIME, text="Ash is time: step in, rewind")
    gp("bridge", "A1_main", "bridge", 4, "Draw the flame back: his own shadow runs out over the canal and holds him up", pre=3)
    over("corner", here() - 4 + 0.25, 3, theme=SHADOW, text="a lit shadow turns solid")
    cue("stalk")
    gp("stalk1", "A1_main", "wrongAppear@library", 3, "The Library: the shelves' shadows are walls; it comes for him", pre=0.5)
    gp("stalk2", "A1_main", "wrongSeen@library", 2, "The Wrong Shadow, wearing his face, caught in the light", pre=0.5)
    gp("stalk3", "A1_main", "plate@heart", 2, "The Heart: the first plate under the rumble", pre=1.0)
    cue("hearth")
    gp("sunset", "A2_7pm", "mode:play", 5, "7 PM: sunset on the hearth grounds, the first shades, the knight's sword cuts", pre=-1.0)
    cue("drive")
    gp("rise", "A2_9pm", "spawn#3", 3, "9 PM: shades rise out of the shadows the fire throws", pre=0.6)
    gp("crawl", "A2_11pm", "slam#2", 1.5, "11 PM: the falling hearth; a slam scatters them", pre=0.8)
    gp("ember", "A2_11pm", "feed#1", 1.5, "An ember carried home: the hearth flares", pre=1.8)
    cue("escalate")
    gp("e1", "A2_1am", "kill#2", 3, "1 AM: the lower city, the torch swings every shadow", pre=1.2)
    gp("e2", "A2_5am", "t=8.0", 2, "5 AM: lantern-eater bolts over the wall walk", pre=0.6)
    gp("e3", "A2_1am", "kill#5", 1, "A kill in torchlight", pre=0.4)
    gp("e4", "A2_9pm", "kill#6", 1, "A dash-strike through a shade", pre=0.4)
    gp("e5", "A2_5am", "kill#4", 1, "On the wall", pre=0.4)
    gp("e6", "A2_3am", "spawn#2", 1, "The cathedral: something vast stirs", pre=0.3)
    cue("climax")
    gp("climax", "A2_marshal", "bigSpawn", 10.5, "Climax, one take: the Hollow Marshal rises, his cry, the waves jumped, the kill", pre=2.45)
    cue("dawn")
    gp("dawn", "A2_dawn", "mode:choice", 3, "Dawn: the choice, played: into the light, or stay in the shadow", pre=0.5)
    cue("after")
    gp("button", "A1_library", "wrongSeen#1", 1.5, "Last look: in the still city, a shadow with his face turns toward the camera", pre=0.3)
    over("corner", here() - 1.5, 1.5, theme=FIRE, text="the-last-ember-xi.vercel.app")
