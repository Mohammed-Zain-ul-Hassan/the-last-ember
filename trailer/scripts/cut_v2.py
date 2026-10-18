"""The Last Ember, trailer v2 (the "level 3" cut): bar by bar (120 BPM: a bar is 2.0 s). Read by plan_v2.py.

Shape (Zain, 2026-10-18: "the first few scenes should be super dramatic, slashing enemies and moving fast, and then
the sound effects and the legendary trailer should start ... the end shouldn't be abrupt"; Moeez: two minutes of pure
gameplay; the why, with sources: docs/trailer-v2.md):
  COLD OPEN, 0:00-0:12   ten cuts of pure combat on the beat (2 s, eight of 1 s, then the biggest hit held 2 s),
                         an impact flash and a jolt on every cut, letterboxed. SMASH TO BLACK: one second of silence.
  THE LEGEND, 0:13-0:50  the braam and the title over the frozen city -> ACT I -> FIRE / TIME / SHADOW, each a card
                         and a glimpse -> the Heart ("It has your hands") -> ACT II -> midnight.
  PURE GAMEPLAY, 0:50-2:50  120 s of raw play in story order, the letterbox opening up as it begins; nothing over it
                         but small corner tags naming each theme where it is played.
  CREDITS, 2:50-2:58     "This masterpiece is developed by" and the four names, held, the music resolving into a bell.
"""

THEMES = [
    {"name": "FIRE", "how": "the flame you carry casts every shadow",
     "card": ["Aim the flame. Every shadow follows.", "At the hearth, the fire is your life."]},
    {"name": "TIME", "how": "frozen in the city, running out at the hearth",
     "card": ["Wake the frozen. Relive their last ten seconds.", "Ash is time. Spend it."]},
    {"name": "SHADOW", "how": "shadows hold you up, and one hunts you",
     "card": ["Walk on your own shadow.", "One shadow moves only when you look away."]},
]
FIRE, TIME, SHADOW = 0, 1, 2
CREDITS = {
    "kicker": "This masterpiece is developed by:",
    "names": ["Mohammed Zain ul Hassan", "Ahnaf Abdullah", "Moeez Abid", "Huzaifa Tahir"],
}


def build(gp, scene, card, over, cue, here):
    # ================= COLD OPEN (0:00-0:12): combat on the beat =================
    cue("blitz")
    hit = {"fx": "impact"}  # each cut lands on a hit: flash + jolt in the edit, a taiko + boom in the score
    gp("b1", "A2_3am", "fireburst#1", 1, "Cold open: a burst of fire in the cathedral, the torch blazing", pre=0.6, **hit)
    gp("b2", "A2_11pm", "slam#3", 0.5, "A slam under the falling hearth", pre=0.5, **hit)
    gp("b3", "A2_9pm", "kill#11", 0.5, "A cut through a shade", pre=0.5, **hit)
    gp("b4", "A2_1am", "kill#1", 0.5, "Torchlight: a kill in the lower city", pre=0.5, **hit)
    gp("b5", "A2_9pm", "slam#1", 0.5, "A slam in the moonlight", pre=0.5, **hit)
    gp("b6", "A2_7pm", "t=26.75", 0.5, "A slam at the hearth scatters the shades", **hit)
    gp("b7", "A2_7pm", "kill#10", 0.5, "Sunset: a sword cut", pre=0.5, **hit)
    gp("b8", "A2_11pm", "slam#5", 0.5, "Another slam", pre=0.5, **hit)
    gp("b9", "A2_3am", "kill#6", 0.5, "Three at once in the nave", pre=0.5, **hit)
    gp("b10", "A2_3am", "t=22.0", 1, "The nave: the last of them falls", **hit)
    # SMASH TO BLACK: one second of nothing
    cue("black")
    card("black", "black", 0.5, "Smash to black: silence, a sub drop")
    # ================= THE LEGEND (0:13-0:50) =================
    cue("title")
    card("title", "title", 2.5, "Title on black and embers, after the silence: THE LAST EMBER, the logline, FIRE / SHADOW / TIME")
    card("act1", "act", 1.5, "ACT I: The Still City", act="ACT I", name="THE STILL CITY", subtitle="Everyone stopped one second before the flood.")
    cue("puzzle")
    card("card_fire", "card", 1.75, "Theme explainer: FIRE", theme=FIRE)
    gp("t_fire", "A1_main", "district@gate", 1.5, "Glimpse: the flame swung, every shadow swinging with it", pre=-7.0)
    over("lowerThird", here() - 1.5 + 0.1, 1.3, theme=FIRE)
    card("card_time", "card", 1.75, "Theme explainer: TIME", theme=TIME)
    gp("t_time", "A1_main", "t=59.5", 1.5, "Glimpse: a frozen figure, woken, replays its last seconds in gold")
    over("lowerThird", here() - 1.5 + 0.1, 1.3, theme=TIME)
    cue("stalk")
    card("card_shadow", "card", 1.75, "Theme explainer: SHADOW", theme=SHADOW)
    gp("t_shadow", "A1_library", "wrongAppear@library", 1.5, "Glimpse: the Library, the Wrong Shadow comes for him", pre=0.5)
    over("lowerThird", here() - 1.5 + 0.1, 1.3, theme=SHADOW)
    cue("reveal")
    scene("heart", "A1_main", "ending", 2, "The Heart: \"It has your hands.\" The shadow is him; he lit the flame", pre=-1.0)
    cue("act")
    card("act2", "act", 1.5, "ACT II: The Hearth", act="ACT II", name="THE HEARTH", subtitle="Carry it out. Hold it until dawn.")
    cue("midnight")
    scene("midnight", "A2_midnight", "mode:midnight", 1.5, "Midnight: the hearth dies; he lights the torch from its last flame", pre=-1.0)

    # ================= PURE GAMEPLAY (0:50-2:50): raw play only =================
    # Every district of Act I, then the hours of Act II, cut fast (mostly 2-4 s), each beat a step up, paying off in
    # the Marshal (one 21 s take), the dawn choice and a last look back (the second phone's note: all sections, a
    # payoff worth it). No speed ramps: footage not at 1.0x would stop counting as raw gameplay.
    cue("puzzle")
    # THE GATE WARD: the whole verb in one take: aim, the ring, the angle, wake, step in, the lever
    gp("fire_take", "A1_main", "wake#1", 4, "Gate Ward: aim the flame, the ring, the angle, he wakes, step in", pre=3.23)
    over("corner", here() - 4 + 0.25, 3, theme=FIRE, text="the flame casts every shadow")
    cue("still")
    gp("step_in", "A1_main", "stepIn#2", 2, "Gate Ward: step into a guard's replay and lift the bar", pre=1.5)
    over("corner", here() - 2 + 0.1, 1.5, theme=TIME, text="Ash is time: step in, rewind")
    # THE MARKET: the scales, the shadow bridge, the street falling behind him
    gp("scales", "A1_main", "plate@market", 1.5, "Market: a pan balances under a merchant's shadow", pre=1.5)
    gp("bridge", "A1_main", "bridge", 3, "Market: draw the flame back, his own shadow bridges the canal", pre=3)
    over("corner", here() - 3 + 0.25, 2, theme=SHADOW, text="a lit shadow turns solid")
    gp("collapse", "A1_main", "t=150.5", 2.5, "Market: the street falls away behind him as he runs")
    # THE TEMPLE: the priests woken in order, the sun-dial, the hunt
    cue("stalk")
    gp("priests", "A1_main", "wake#7", 2, "Temple: the priests' last hours, woken in order", pre=2)
    gp("dial", "A1_main", "plate@temple", 1.5, "Temple: the gnomon's shadow along the shaft of light", pre=1.5)
    gp("hunt", "A1_main", "wrongShift@temple", 1.5, "Temple: the hunt begins", pre=0.5)
    # THE LIBRARY: pages read from above, then the stacks and the shadow with his face
    gp("pages", "A1_main", "pageRead#3", 1.5, "Library: a page read from directly above", pre=1.5)
    gp("stalk1", "A1_main", "wrongAppear@library", 2, "Library: the shelves' shadows are walls; it comes for him", pre=0.5)
    gp("stalk2", "A1_main", "t=325.3", 1.5, "Library: the flame swung onto it, it stops dead")
    # THE HEART: the plates, the ring opening
    gp("plate", "A1_main", "plate@heart", 1.5, "Heart: a plate under the rumble", pre=1.0)
    gp("heart_run", "A1_main", "wrongAppear@heart", 2.5, "Heart: the plates done, the ring opens, it is waiting at the centre", pre=2.0)
    # ACT II: the hours, faster and faster
    cue("hearth")
    gp("sunset", "A2_7pm", "t=9.0", 1.5, "7 PM: sunset on the hearth grounds, sword cuts")
    cue("drive")
    gp("rise", "A2_9pm", "spawn#3", 3, "9 PM: shades rise out of the shadows the fire throws", pre=0.6)
    gp("nine2", "A2_9pm", "t=22.2", 3, "9 PM: two shades cut down in the moonlight")
    gp("crawl", "A2_11pm", "slam#2", 1.5, "11 PM: the falling hearth; a slam scatters them", pre=0.8)
    gp("ember", "A2_11pm", "t=14.95", 0.5, "11 PM: an ember carried home")
    cue("escalate")
    gp("e1", "A2_1am", "t=11.9", 2, "1 AM: the torch in the lower city, every shadow swinging")
    gp("torch2", "A2_1am", "t=19.0", 2, "1 AM: crawlers in the torchlight")
    gp("e2", "A2_5am", "t=8.0", 1.5, "5 AM: the wall walk")
    gp("e3", "A2_1am", "kill#5", 1, "A kill in torchlight", pre=0.4)
    gp("e4", "A2_9pm", "t=16.5", 0.5, "A dash-strike through a shade")
    gp("e5", "A2_5am", "t=12.2", 0.5, "On the wall: two at once")
    gp("e6", "A2_3am", "spawn#2", 1, "3 AM: the cathedral, something vast stirs", pre=0.3)
    gp("nave", "A2_3am", "t=7.0", 2, "3 AM: the nave, fighting toward the apse")
    # THE PAYOFF
    cue("climax")
    gp("climax", "A2_marshal", "t=3.95", 10, "Climax, one take: the Hollow Marshal rises, his cry, the waves jumped, the kill")
    cue("dawn")
    gp("dawn", "A2_dawn", "t=30.6", 1.5, "Dawn: the light on the wall, the choice before him (a breath after the climax)")
    cue("after")
    gp("button", "A1_library", "wrongSeen@heart", 1.5, "Last look: at the Heart, the shadow with his face is waiting", pre=0.3)

    # ================= CREDITS (2:50-2:58): held, the music resolves =================
    cue("credits")
    card("credits", "credits", 4.5, "Credits: This masterpiece is developed by ... the four names; the title and the play link", **CREDITS)
