import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ActCard, CornerTag, Credits, EndCard, Impact, Letterbox, LowerThird, Scene, Slate, StoryLine, Tag, ThemeCard, TitleCard } from "./components/Cards";
import { colorOf } from "./theme";
import { C } from "./theme";
import type { Shot, Shotlist } from "./types";

/** Raw gameplay at 1x. A light lift only: the captures are graded dark for the game, a trailer plays on bright screens. */
const Gameplay: React.FC<{ shot: Shot }> = ({ shot }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <OffthreadVideo src={staticFile(shot.src!)} trimBefore={Math.round((shot.in ?? 0) * fps)} playbackRate={shot.speed ?? 1} muted={!shot.vol} volume={shot.vol ?? 0} style={{ width: "100%", height: "100%", filter: shot.fx === "impact" ? "brightness(1.32) contrast(1.12) saturate(1.15)" : "brightness(1.14) contrast(1.05)" }} />
    </AbsoluteFill>
  );
};

/** The film finish over everything: grain (four plates, a new one every 2 frames) and a soft vignette. */
const Finish: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.38) 100%)" }} />
      <Img src={staticFile(`fx/grain${Math.floor(f / 2) % 4}.png`)} style={{ width: "100%", height: "100%", opacity: 0.075, mixBlendMode: "overlay" }} />
    </AbsoluteFill>
  );
};

/** A warm anamorphic light leak sweeping across the frame as a card arrives. */
const LightLeak: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const k = Math.max(0, Math.min(1, t / 0.18)) * Math.max(0, 1 - (t - 0.18) / 0.55);
  const x = -40 + t * 260;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen", opacity: k }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 18% at ${x}% 50%, rgba(255,170,90,0.85) 0%, rgba(255,110,40,0.35) 40%, rgba(0,0,0,0) 75%)` }} />
      <AbsoluteFill style={{ background: `linear-gradient(90deg, rgba(0,0,0,0) ${x - 30}%, rgba(255,200,140,0.35) ${x}%, rgba(0,0,0,0) ${x + 30}%)` }} />
    </AbsoluteFill>
  );
};

export const Trailer: React.FC<{ plan: Shotlist }> = ({ plan }) => {
  const { fps } = useVideoConfig();
  const f = (s: number) => Math.round(s * fps);
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      {plan.shots.map((s) => (
        <Sequence key={s.id} name={s.id} from={f(s.start)} durationInFrames={f(s.start + s.dur) - f(s.start)}>
          {s.missing && (s.kind === "gameplay" || s.kind === "scene") && <Slate id={s.id} src={s.src} anchor={s.anchor} why={s.why} kind={s.kind} />}
          {!s.missing && s.kind === "gameplay" && (s.fx === "impact" ? <Impact seed={s.start}><Gameplay shot={s} /></Impact> : <Gameplay shot={s} />)}
          {s.kind === "black" && <AbsoluteFill style={{ background: "#000" }} />}
          {s.kind === "credits" && <Credits kicker={s.kicker ?? ""} names={s.names ?? []} title={plan.title} url={plan.url} />}
          {!s.missing && s.kind === "scene" && <Scene src={s.src!} at={s.in ?? 0} subtitle={s.subtitle} kicker={s.kicker} vol={s.vol} />}
          {s.kind === "act" && <ActCard act={s.act!} name={s.name!} line={s.subtitle} />}
          {s.kind === "title" && <TitleCard title={plan.title} logline={plan.logline} themes={plan.themes} src={s.src} at={s.in} />}
          {s.kind === "card" && <ThemeCard index={s.theme!} theme={plan.themes[s.theme!]} />}
          {s.kind === "end" && <EndCard title={plan.title} url={plan.url} themes={plan.themes} />}
        </Sequence>
      ))}
      {plan.shots
        .filter((s) => ["title", "card", "act", "credits"].includes(s.kind))
        .map((s) => (
          <Sequence key={`leak-${s.id}`} name={`leak-${s.id}`} from={f(s.start) - 6} durationInFrames={Math.round(0.8 * fps)}>
            <LightLeak />
          </Sequence>
        ))}
      <Finish />
      {plan.letterbox_until ? (
        <Sequence name="letterbox" from={0} durationInFrames={f(plan.letterbox_until)}>
          <Letterbox />
        </Sequence>
      ) : null}
      {plan.overlays.map((o, i) => (
        <Sequence key={`ov${i}`} name={`${o.kind}-${o.theme}`} from={f(o.start)} durationInFrames={f(o.start + o.dur) - f(o.start)}>
          {o.kind === "lowerThird" && <LowerThird index={o.theme} theme={plan.themes[o.theme]} />}
          {o.kind === "tag" && <Tag index={o.theme} theme={plan.themes[o.theme]} />}
          {o.kind === "line" && <StoryLine text={o.text!} />}
          {o.kind === "corner" && <CornerTag word={plan.themes[o.theme].name} text={o.text} color={colorOf(plan.themes[o.theme].name, o.theme)} />}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
