import React from "react";
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";

/** Night, a low warm glow, and embers lifting through it: the backdrop for every card. */
export const Embers: React.FC<{ seed: string; tint?: string; glowAt?: [number, number]; count?: number }> = ({ seed, tint = C.ember, glowAt = [50, 92], count = 80 }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const motes = new Array(count).fill(0).map((_, i) => {
    const sp = 30 + random(`${seed}s${i}`) * 90;
    const life = (height + 200) / sp;
    const ph = (t + random(`${seed}p${i}`) * life) % life;
    const y = height + 60 - ph * sp;
    const x = random(`${seed}x${i}`) * width + Math.sin(t * (0.6 + random(`${seed}w${i}`)) + i) * 26;
    const sz = 2 + random(`${seed}z${i}`) * 5;
    const a = Math.min(1, ph / 1.2) * Math.max(0, 1 - ph / life) * (0.35 + random(`${seed}a${i}`) * 0.65);
    return { x, y, sz, a };
  });
  const flick = 0.85 + 0.1 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 17.1);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 60% at ${glowAt[0]}% ${glowAt[1]}%, ${tint}2e 0%, ${C.night} 55%, ${C.ink} 100%)` }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 40% 25% at ${glowAt[0]}% ${glowAt[1] + 6}%, ${tint}${Math.round(40 * flick).toString(16).padStart(2, "0")} 0%, transparent 70%)` }} />
      {motes.map((m, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: m.x,
            top: m.y,
            width: m.sz,
            height: m.sz,
            borderRadius: "50%",
            background: i % 5 === 0 ? C.dawn : tint,
            opacity: m.a,
            boxShadow: `0 0 ${m.sz * 3}px ${tint}`,
          }}
        />
      ))}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.65) 100%)" }} />
    </AbsoluteFill>
  );
};

/** A hearth flame drawn in SVG: three flickering tongues and a hot core. */
export const Flame: React.FC<{ t: number; size?: number; strength?: number; color?: string }> = ({ t, size = 260, strength = 1, color = C.ember }) => {
  const tongue = (k: number, w: number, h: number, sway: number) => {
    const s = Math.sin(t * (6 + k) + k * 2) * sway;
    const hh = h * (0.9 + 0.1 * Math.sin(t * (9 + k * 2))) * strength;
    return `M ${-w} 0 C ${-w} ${-hh * 0.45}, ${s - w * 0.2} ${-hh * 0.7}, ${s} ${-hh} C ${s + w * 0.2} ${-hh * 0.7}, ${w} ${-hh * 0.45}, ${w} 0 Z`;
  };
  return (
    <svg width={size} height={size * 1.3} viewBox="-100 -230 200 260" style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id="fl" cx="50%" cy="85%" r="70%">
          <stop offset="0%" stopColor="#fff7e0" />
          <stop offset="35%" stopColor={C.fire} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <filter id="blur">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <ellipse cx="0" cy="-40" rx={110 * strength} ry={120 * strength} fill={color} opacity={0.25 * strength} filter="url(#blur)" />
      <path d={tongue(0, 70, 210, 14)} fill="url(#fl)" opacity={0.85} />
      <path d={tongue(1, 46, 160, 18)} fill="url(#fl)" />
      <path d={tongue(2, 26, 110, 10)} fill="#fff3d6" opacity={0.9} />
    </svg>
  );
};
