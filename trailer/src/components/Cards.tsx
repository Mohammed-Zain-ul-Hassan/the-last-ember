import React from "react";
import { AbsoluteFill, Easing, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, colorOf, DISPLAY, glow, ROMAN, SERIF } from "../theme";
import type { Theme } from "../types";
import { Embers, Flame } from "./Embers";

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const inOut = Easing.inOut(Easing.sin);

const useT = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return f / fps;
};
/** 0..1 entrance at `at` seconds over `d` seconds. */
const useIn = (at: number, d = 0.5) => {
  const t = useT();
  return interpolate(t, [at, at + d], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
};
/** 1..0 over the last `d` seconds of the sequence. */
const useOut = (d = 0.35) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  return interpolate(f, [durationInFrames - d * fps, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: inOut });
};

const Diamond: React.FC<{ color: string; size?: number; filled?: boolean; style?: React.CSSProperties }> = ({ color, size = 14, filled = true, style }) => (
  <div style={{ width: size, height: size, transform: "rotate(45deg)", background: filled ? color : "transparent", border: `2px solid ${color}`, boxShadow: `0 0 14px ${color}`, ...style }} />
);

/** A theme word between two diamonds, the game's motif. */
const Chip: React.FC<{ text: string; color: string; o: number; size?: number }> = ({ text, color, o, size = 46 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 18, opacity: o, transform: `translateY(${(1 - o) * 24}px)` }}>
    <Diamond color={color} size={12} />
    <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: size, letterSpacing: "0.3em", color: C.bone, ...glow(color, 16) }}>{text}</div>
    <Diamond color={color} size={12} />
  </div>
);

// ------------------------------------------------------------------ title
export const TitleCard: React.FC<{ title: string; logline: string; themes: Theme[]; src?: string; at?: number }> = ({ title, logline, themes, src, at = 0 }) => {
  const { fps } = useVideoConfig();
  const t = useT();
  const a = useIn(0.1, 0.9);
  const b = useIn(1.0, 0.7);
  const out = useOut(0.35);
  return (
    <AbsoluteFill style={{ opacity: out, background: C.ink }}>
      {src && (
        <OffthreadVideo src={staticFile(src)} trimBefore={Math.round(at * fps)} muted style={{ width: "100%", height: "100%", filter: "brightness(0.5) saturate(1.1)", transform: `scale(${1.04 + t * 0.006})` }} />
      )}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(7,5,11,0.15) 0%, rgba(7,5,11,0.75) 75%)" }} />
      {!src && <Embers seed="title" glowAt={[50, 102]} count={140} />}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 26 }}>
        <div
          style={{
            fontFamily: DISPLAY,
            fontWeight: 400,
            fontSize: 150,
            color: C.bone,
            letterSpacing: `${interpolate(a, [0, 1], [0.32, 0.16])}em`,
            opacity: a,
            transform: `scale(${interpolate(a, [0, 1], [1.06, 1])})`,
            ...glow(C.ember, 30),
          }}
        >
          {title}
        </div>
        <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 58, color: C.bone, opacity: b * 0.92, transform: `translateY(${(1 - b) * 16}px)`, ...glow("#000000", 12) }}>
          {logline}
        </div>
        <div style={{ display: "flex", gap: 70, marginTop: 30 }}>
          {themes.map((th, i) => (
            <Chip key={th.name} text={th.name} color={colorOf(th.name, i)} o={interpolate(t, [1.8 + i * 0.3, 2.4 + i * 0.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease })} />
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ theme diagrams
const FireDiagram: React.FC<{ t: number }> = ({ t }) => {
  // embers drift in from the dark and feed the hearth: the flame grows, the bar fills
  const cycle = 1.3;
  const fed = Math.min(1, 0.35 + Math.floor(t / cycle) * 0.16);
  return (
    <div style={{ position: "relative", width: 620, height: 640 }}>
      <div style={{ position: "absolute", left: 180, top: 120 }}>
        <Flame t={t} size={260} strength={0.65 + fed * 0.45} />
      </div>
      {/* the brazier */}
      <svg style={{ position: "absolute", left: 150, top: 430 }} width={320} height={120} viewBox="0 0 320 120">
        <path d="M 10 10 L 310 10 L 250 60 L 70 60 Z" fill="#000" stroke={`${C.ember}66`} strokeWidth={2} />
        <path d="M 130 60 L 190 60 L 215 112 L 105 112 Z" fill="#000" stroke={`${C.ember}44`} strokeWidth={2} />
      </svg>
      {[0, 1, 2].map((i) => {
        const p = ((t + i * 0.43) % cycle) / cycle;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: interpolate(p, [0, 1], [600 - i * 30, 300]),
              top: interpolate(p, [0, 1], [80 + i * 120, 330]) + Math.sin(p * 6 + i) * 20,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: C.dawn,
              boxShadow: `0 0 22px ${C.ember}, 0 0 44px ${C.ember}`,
              opacity: Math.sin(p * Math.PI),
            }}
          />
        );
      })}
      <div style={{ position: "absolute", left: 110, top: 580, width: 400 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 30, letterSpacing: "0.4em", color: C.gold, marginBottom: 10 }}>THE HEARTH</div>
        <div style={{ height: 10, background: "rgba(255,255,255,0.08)", border: `1px solid ${C.ember}55` }}>
          <div style={{ width: `${fed * 100}%`, height: "100%", background: `linear-gradient(90deg, ${C.ember}, ${C.dawn})`, boxShadow: `0 0 16px ${C.ember}` }} />
        </div>
      </div>
    </div>
  );
};

const Shade: React.FC<{ x: number; y: number; s: number; o: number }> = ({ x, y, s, o }) => (
  <svg style={{ position: "absolute", left: x, top: y, opacity: o }} width={90 * s} height={160 * s} viewBox="0 0 90 160">
    <path d="M 45 6 C 70 6 78 34 74 52 L 88 150 L 64 132 L 52 152 L 38 132 L 22 154 L 14 128 L 2 150 L 16 52 C 12 34 20 6 45 6 Z" fill="#000" stroke={`${C.violet}aa`} strokeWidth={2.5} />
    <circle cx="38" cy="40" r="3.5" fill={C.ember} />
    <circle cx="54" cy="40" r="3.5" fill={C.ember} />
  </svg>
);

const ShadowDiagram: React.FC<{ t: number }> = ({ t }) => {
  // a flame, a broken wall, and the long shadow it throws: shades rise out of the dark side
  return (
    <div style={{ position: "relative", width: 700, height: 640 }}>
      <div style={{ position: "absolute", left: 10, top: 230 }}>
        <Flame t={t} size={150} strength={0.8} />
      </div>
      <svg style={{ position: "absolute", left: 0, top: 0 }} width={700} height={640} viewBox="0 0 700 640">
        <defs>
          <linearGradient id="shadowFade" x1="0" x2="1">
            <stop offset="0%" stopColor="#000" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.35" />
          </linearGradient>
          <radialGradient id="lit" cx="12%" cy="70%" r="60%">
            <stop offset="0%" stopColor={C.ember} stopOpacity="0.35" />
            <stop offset="100%" stopColor={C.ember} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="700" height="640" fill="url(#lit)" />
        {/* the light rays grazing the wall top, and the shadow wedge behind it */}
        <polygon points="230,330 260,330 700,560 700,560" fill="none" />
        <polygon points="260,330 700,540 700,560 260,560" fill="url(#shadowFade)" />
        <line x1="90" y1="330" x2="700" y2="540" stroke={`${C.gold}55`} strokeWidth={2} strokeDasharray="8 10" />
        <rect x="230" y="330" width="40" height="230" fill="#000" stroke={`${C.gold}66`} strokeWidth={2} />
        <rect x="0" y="560" width="700" height="10" fill={`${C.ember}33`} />
      </svg>
      {[0, 1, 2].map((i) => {
        const p = ((t * 0.55 + i * 0.33) % 1);
        return <Shade key={i} x={330 + i * 120} y={560 - 150 * 0.9 * Math.min(1, p * 2.2)} s={0.9} o={Math.min(1, p * 3) * (1 - Math.max(0, p - 0.8) * 5)} />;
      })}
      <div style={{ position: "absolute", left: 300, top: 590, fontFamily: DISPLAY, fontSize: 30, letterSpacing: "0.4em", color: C.violet }}>WHERE THE FIRE CANNOT REACH</div>
    </div>
  );
};

const HOURS = [
  ["VII", "7 PM"],
  ["IX", "9 PM"],
  ["XI", "11 PM"],
  ["I", "1 AM"],
  ["III", "3 AM"],
  ["V", "5 AM"],
];
const TimeDiagram: React.FC<{ t: number }> = ({ t }) => {
  const k = interpolate(t, [0.4, 4.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: inOut });
  const idx = Math.min(5, Math.floor(k * 6));
  return (
    <div style={{ position: "relative", width: 720, height: 640 }}>
      {/* the sky over the night: violet to dawn */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 40,
          width: 720,
          height: 300,
          background: `linear-gradient(90deg, #2a1640 0%, #1a1030 45%, #6b3a4a 80%, ${C.dawn} 100%)`,
          opacity: 0.55,
          maskImage: `linear-gradient(90deg, black ${k * 100}%, transparent ${k * 100 + 8}%)`,
        }}
      />
      <div style={{ position: "absolute", left: 20 + k * 640, top: 300 - Math.sin(k * Math.PI) * 220, width: 40, height: 40, borderRadius: "50%", background: k > 0.9 ? C.dawn : "#e9e4ff", boxShadow: `0 0 40px ${k > 0.9 ? C.ember : C.violet}` }} />
      <div style={{ position: "absolute", left: 0, top: 400, width: 720, display: "flex", justifyContent: "space-between" }}>
        {HOURS.map(([r, c], i) => (
          <div key={r} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, opacity: i <= idx ? 1 : 0.3, width: 110 }}>
            <Diamond color={i <= idx ? C.gold : C.mist} size={i === idx ? 18 : 12} filled={i <= idx} />
            <div style={{ fontFamily: DISPLAY, fontSize: 48, color: C.bone }}>{r}</div>
            <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 30, color: C.mist }}>{c}</div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 0, top: 590, fontFamily: DISPLAY, fontSize: 30, letterSpacing: "0.4em", color: k > 0.95 ? C.dawn : C.mist }}>{k > 0.95 ? "DAWN" : "THE NIGHT, HOUR BY HOUR"}</div>
    </div>
  );
};

export const ThemeCard: React.FC<{ index: number; theme: Theme }> = ({ index, theme }) => {
  const t = useT();
  const a = useIn(0, 0.6);
  const l1 = useIn(0.55, 0.6);
  const l2 = useIn(1.15, 0.6);
  const out = useOut(0.35);
  const col = colorOf(theme.name, index);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Embers seed={`card${index}`} tint={col} glowAt={[78, 80]} />
      <AbsoluteFill style={{ padding: "0 120px", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 980 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, opacity: a }}>
            <Diamond color={col} size={12} />
            <div style={{ fontFamily: DISPLAY, fontSize: 36, letterSpacing: "0.45em", color: col }}>{`THEME ${ROMAN[index]}`}</div>
          </div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 400, fontSize: 170, letterSpacing: "0.12em", color: C.bone, lineHeight: 1, opacity: a, transform: `translateX(${(1 - a) * -40}px)`, ...glow(col, 34) }}>
            {theme.name}
          </div>
          <div style={{ width: interpolate(a, [0, 1], [0, 260]), height: 2, background: col, boxShadow: `0 0 18px ${col}` }} />
          <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 62, color: C.bone, lineHeight: 1.2, opacity: l1, transform: `translateY(${(1 - l1) * 16}px)` }}>{theme.card[0]}</div>
          <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 56, color: C.mist, lineHeight: 1.2, opacity: l2, transform: `translateY(${(1 - l2) * 16}px)` }}>{theme.card[1]}</div>
        </div>
        <div style={{ opacity: a, transform: `scale(${interpolate(a, [0, 1], [0.94, 1])})` }}>
          {theme.name === "FIRE" ? <FireDiagram t={t} /> : theme.name === "SHADOW" ? <ShadowDiagram t={t} /> : <TimeDiagram t={t} />}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ in-engine scenes (memories, midnight, dawn)
export const Scene: React.FC<{ src: string; at: number; subtitle?: string; kicker?: string; vol?: number }> = ({ src, at, subtitle, kicker, vol }) => {
  const { fps } = useVideoConfig();
  const fadeIn = useIn(0, 0.35);
  const out = useOut(0.35);
  const s = useIn(0.4, 0.7);
  const memory = kicker === "a memory";
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ opacity: Math.min(fadeIn, out) }}>
        <OffthreadVideo src={staticFile(src)} trimBefore={Math.round(at * fps)} muted={!vol} volume={vol ?? 0} style={{ width: "100%", height: "100%", filter: memory ? "sepia(0.08)" : "brightness(1.1) contrast(1.04)" }} />
      </AbsoluteFill>
      {memory && (
        <>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 118, background: "#000" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 118, background: "#000" }} />
        </>
      )}
      {(subtitle || kicker) && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: memory ? 18 : 80, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: s * out }}>
          {kicker && <div style={{ fontFamily: DISPLAY, fontSize: memory ? 26 : 48, letterSpacing: "0.55em", color: C.gold, textTransform: "uppercase", ...glow("#000000", 10) }}>{kicker}</div>}
          {subtitle && <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 54, color: C.bone, ...glow("#000000", 14) }}>{subtitle}</div>}
        </div>
      )}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ end card
export const EndCard: React.FC<{ title: string; url: string; themes: Theme[] }> = ({ title, url, themes }) => {
  const t = useT();
  const a = useIn(0, 0.8);
  const b = useIn(0.6, 0.7);
  const c = useIn(1.2, 0.7);
  return (
    <AbsoluteFill>
      <Embers seed="end" glowAt={[50, 98]} count={110} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 30 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 132, letterSpacing: "0.16em", color: C.bone, opacity: a, ...glow(C.ember, 30) }}>{title}</div>
        <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 56, color: C.mist, opacity: b }}>Play it free in your browser</div>
        <div
          style={{
            fontFamily: DISPLAY,
            fontSize: 58,
            letterSpacing: "0.06em",
            color: C.gold,
            padding: "16px 46px",
            border: `1px solid ${C.gold}88`,
            background: `${C.ink}cc`,
            boxShadow: `0 0 ${30 + Math.sin(t * 3) * 10}px ${C.ember}55`,
            opacity: b,
          }}
        >
          {url}
        </div>
        <div style={{ display: "flex", gap: 60, marginTop: 18 }}>
          {themes.map((th, i) => (
            <Chip key={th.name} text={th.name} color={colorOf(th.name, i)} o={c} size={40} />
          ))}
        </div>
        <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 48, color: C.bone, opacity: c * 0.85, marginTop: 10 }}>Built in 3 days with Claude Code</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ overlays on live gameplay (never opaque)
export const LowerThird: React.FC<{ index: number; theme: Theme }> = ({ index, theme }) => {
  const a = useIn(0, 0.5);
  const b = useIn(0.3, 0.5);
  const out = useOut(0.4);
  const col = colorOf(theme.name, index);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <div style={{ position: "absolute", left: 0, bottom: 0, width: 1250, height: 330, background: `linear-gradient(90deg, ${C.ink}cc 0%, ${C.ink}77 55%, transparent 100%)`, maskImage: "linear-gradient(0deg, black 55%, transparent 100%)", opacity: a }} />
      <div style={{ position: "absolute", left: 80, bottom: 76, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: a }}>
          <div style={{ width: interpolate(a, [0, 1], [0, 70]), height: 2, background: col, boxShadow: `0 0 12px ${col}` }} />
          <div style={{ fontFamily: DISPLAY, fontSize: 30, letterSpacing: "0.45em", color: col }}>{`THEME ${ROMAN[index]}`}</div>
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 88, letterSpacing: "0.14em", color: C.bone, lineHeight: 1, transform: `translateY(${(1 - a) * 18}px)`, opacity: a, ...glow(col, 22) }}>
          {theme.name}
        </div>
        <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 54, color: C.bone, transform: `translateY(${(1 - b) * 12}px)`, opacity: b, ...glow("#000000", 10) }}>{theme.how}</div>
      </div>
    </AbsoluteFill>
  );
};

export const Tag: React.FC<{ index: number; theme: Theme }> = ({ index, theme }) => {
  const a = useIn(0, 0.2);
  const out = useOut(0.12);
  const col = colorOf(theme.name, index);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <div style={{ position: "absolute", left: 0, bottom: 0, width: 1000, height: 260, background: `linear-gradient(90deg, ${C.ink}b0, transparent)`, maskImage: "linear-gradient(0deg, black 50%, transparent 100%)" }} />
      <div style={{ position: "absolute", left: 80, bottom: 80, opacity: a, transform: `translateX(${(1 - a) * -30}px)`, display: "flex", alignItems: "center", gap: 22 }}>
        <Diamond color={col} size={16} />
        <div style={{ fontFamily: DISPLAY, fontSize: 96, letterSpacing: "0.14em", color: C.bone, lineHeight: 1, ...glow(col, 24) }}>{theme.name}</div>
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ v2: acts, story lines, slates
/** ACT I / THE STILL CITY: the two acts named, over black and embers (produced footage). */
export const ActCard: React.FC<{ act: string; name: string; line?: string; color?: string }> = ({ act, name, line, color = C.ember }) => {
  const a = useIn(0.1, 0.7);
  const b = useIn(0.55, 0.8);
  const c = useIn(1.1, 0.8);
  const out = useOut(0.45);
  return (
    <AbsoluteFill style={{ background: C.ink, opacity: out }}>
      <Embers seed={act} glowAt={[50, 104]} count={60} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, opacity: a }}>
          <div style={{ width: interpolate(a, [0, 1], [0, 120]), height: 2, background: color, boxShadow: `0 0 12px ${color}` }} />
          <div style={{ fontFamily: DISPLAY, fontSize: 40, letterSpacing: "0.6em", color }}>{act}</div>
          <div style={{ width: interpolate(a, [0, 1], [0, 120]), height: 2, background: color, boxShadow: `0 0 12px ${color}` }} />
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 118, letterSpacing: "0.16em", color: C.bone, opacity: b, transform: `scale(${1.04 - 0.04 * b})`, ...glow(color, 28) }}>{name}</div>
        {line && <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 54, color: C.mist, opacity: c }}>{line}</div>}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** One story line over live gameplay, low and centred, on a soft gradient (the footage stays visible). */
export const StoryLine: React.FC<{ text: string }> = ({ text }) => {
  const a = useIn(0.05, 0.6);
  const out = useOut(0.5);
  return (
    <AbsoluteFill style={{ opacity: Math.min(a, out) }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 300, background: `linear-gradient(0deg, ${C.ink}c0, transparent)` }} />
      <div style={{ position: "absolute", left: 160, right: 160, bottom: 96, textAlign: "center", fontFamily: SERIF, fontStyle: "italic", fontSize: 60, lineHeight: 1.15, color: C.bone, transform: `translateY(${(1 - a) * 10}px)`, ...glow("#000000", 14) }}>
        {text}
      </div>
    </AbsoluteFill>
  );
};

/** Before the footage exists: what this shot will be (take, anchor, why), so the animatic plays with cards and score. */
export const Slate: React.FC<{ id: string; src?: string; anchor?: string; why: string; kind: string }> = ({ id, src, anchor, why, kind }) => {
  const t = useT();
  return (
    <AbsoluteFill style={{ background: kind === "gameplay" ? "#0d0b14" : "#140d10", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 18, border: `6px solid ${kind === "gameplay" ? "#3a3360" : "#5a3328"}` }}>
      <div style={{ fontFamily: DISPLAY, fontSize: 34, letterSpacing: "0.4em", color: C.mist }}>{kind === "gameplay" ? "RAW GAMEPLAY" : "IN-ENGINE SCENE"}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 64, color: C.bone }}>{id}</div>
      <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 40, color: C.gold }}>{src ?? "-"}{anchor ? `  @ ${anchor}` : ""}</div>
      <div style={{ fontFamily: SERIF, fontSize: 36, color: C.bone, maxWidth: 1400, textAlign: "center", opacity: 0.8 }}>{why}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 28, color: C.mist, opacity: 0.6 }}>{t.toFixed(2)} s</div>
    </AbsoluteFill>
  );
};

/** The pure-gameplay block's only lettering: a small tag in the top-right corner (a theme word and a few words on how,
 * or the play link). Inside the graphics-safe area, no backing panel, gone in 3 s. */
export const CornerTag: React.FC<{ word: string; text?: string; color: string }> = ({ word, text, color }) => {
  const a = useIn(0.05, 0.4);
  const out = useOut(0.4);
  const link = text?.includes(".");
  return (
    <AbsoluteFill style={{ opacity: Math.min(a, out) }}>
      <div style={{ position: "absolute", right: 96, top: 64, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, transform: `translateX(${(1 - a) * 16}px)` }}>
        {!link && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 10, height: 10, transform: "rotate(45deg)", background: color, boxShadow: `0 0 10px ${color}` }} />
            <div style={{ fontFamily: DISPLAY, fontSize: 40, letterSpacing: "0.3em", color: C.bone, ...glow(color, 12) }}>{word}</div>
          </div>
        )}
        {text && <div style={{ fontFamily: link ? DISPLAY : SERIF, fontStyle: link ? "normal" : "italic", fontSize: link ? 34 : 36, letterSpacing: link ? "0.06em" : 0, color: link ? C.gold : C.bone, ...glow("#000000", 10) }}>{text}</div>}
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ v2 level 3: impacts, letterbox, credits
/** A cut that lands on a hit: 3 frames of hot white going to ember, a jolt that settles in 8 frames, a 6% punch-in. */
export const Impact: React.FC<{ children: React.ReactNode; seed: number }> = ({ children, seed }) => {
  const f = useCurrentFrame();
  const k = Math.max(0, 1 - f / 9);
  const jx = Math.sin(seed * 12.9 + f * 2.7) * 14 * k;
  const jy = Math.cos(seed * 7.3 + f * 3.1) * 10 * k;
  const punch = 1 + 0.06 * Math.max(0, 1 - f / 12);
  const flash = f < 2 ? 0.85 : f < 5 ? 0.45 * (1 - (f - 2) / 3) : 0;
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#000" }}>
      <AbsoluteFill style={{ transform: `translate(${jx}px, ${jy}px) scale(${punch})` }}>{children}</AbsoluteFill>
      <AbsoluteFill style={{ background: f < 2 ? "#fff6ea" : C.ember, opacity: flash, mixBlendMode: f < 2 ? "normal" : "screen" }} />
    </AbsoluteFill>
  );
};

/** Cinema bars (2.39:1) over the cold open. */
export const Letterbox: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 138, background: "#000" }} />
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 138, background: "#000" }} />
  </AbsoluteFill>
);

/** The end: who made it, held over embers, then the title and the link, and a slow fade to black. */
export const Credits: React.FC<{ kicker: string; names: string[]; title: string; url: string }> = ({ kicker, names, title, url }) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = f / fps;
  const k = useIn(0.2, 0.9);
  // fully black 0.6 s before the end: the last frames are dark and silent, never a chop
  const end = interpolate(f, [durationInFrames - 2.4 * fps, durationInFrames - 0.6 * fps], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: inOut });
  const tail = useIn(0.6 + names.length * 0.45 + 0.4, 0.8);
  return (
    <AbsoluteFill style={{ background: C.ink, opacity: end }}>
      <Embers seed="credits" glowAt={[50, 104]} count={120} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 18, transform: `scale(${1.03 - 0.03 * Math.min(1, t / 8)})` }}>
        <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 56, color: C.mist, opacity: k, transform: `translateY(${(1 - k) * 14}px)`, marginBottom: 18 }}>{kicker}</div>
        {names.map((n, i) => {
          const a = interpolate(t, [0.6 + i * 0.45, 1.3 + i * 0.45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
          return (
            <div key={n} style={{ fontFamily: DISPLAY, fontSize: 76, letterSpacing: "0.1em", color: C.bone, opacity: a, transform: `translateY(${(1 - a) * 18}px)`, ...glow(C.ember, 22) }}>
              {n}
            </div>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 26, marginTop: 34, opacity: tail }}>
          <div style={{ width: 90, height: 1, background: `${C.gold}aa` }} />
          <div style={{ fontFamily: DISPLAY, fontSize: 40, letterSpacing: "0.3em", color: C.gold }}>{title}</div>
          <div style={{ width: 90, height: 1, background: `${C.gold}aa` }} />
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 34, letterSpacing: "0.06em", color: C.bone, opacity: tail * 0.85 }}>{url}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
