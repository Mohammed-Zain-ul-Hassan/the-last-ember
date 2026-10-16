import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useVideoConfig } from "remotion";
import { EndCard, LowerThird, Scene, Tag, ThemeCard, TitleCard } from "./components/Cards";
import { C } from "./theme";
import type { Shot, Shotlist } from "./types";

/** Raw gameplay at 1x. A light lift only: the captures are graded dark for the game, a trailer plays on bright screens. */
const Gameplay: React.FC<{ shot: Shot }> = ({ shot }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <OffthreadVideo src={staticFile(shot.src!)} trimBefore={Math.round((shot.in ?? 0) * fps)} muted style={{ width: "100%", height: "100%", filter: "brightness(1.14) contrast(1.05)" }} />
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
          {s.kind === "gameplay" && <Gameplay shot={s} />}
          {s.kind === "scene" && <Scene src={s.src!} at={s.in ?? 0} subtitle={s.subtitle} kicker={s.kicker} />}
          {s.kind === "title" && <TitleCard title={plan.title} logline={plan.logline} themes={plan.themes} src={s.src} at={s.in} />}
          {s.kind === "card" && <ThemeCard index={s.theme!} theme={plan.themes[s.theme!]} />}
          {s.kind === "end" && <EndCard title={plan.title} url={plan.url} themes={plan.themes} />}
        </Sequence>
      ))}
      {plan.overlays.map((o, i) => (
        <Sequence key={`ov${i}`} name={`${o.kind}-${o.theme}`} from={f(o.start)} durationInFrames={f(o.start + o.dur) - f(o.start)}>
          {o.kind === "lowerThird" ? <LowerThird index={o.theme} theme={plan.themes[o.theme]} /> : <Tag index={o.theme} theme={plan.themes[o.theme]} />}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
