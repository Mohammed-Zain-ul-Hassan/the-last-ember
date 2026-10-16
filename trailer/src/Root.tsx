import React from "react";
import { Composition } from "remotion";
import plan from "../shotlist.json";
import { Trailer } from "./Trailer";
import type { Shotlist } from "./types";

const p = plan as unknown as Shotlist;

export const Root: React.FC = () => (
  <Composition id="Trailer" component={Trailer} durationInFrames={Math.round(p.duration * p.fps)} fps={p.fps} width={p.width} height={p.height} defaultProps={{ plan: p }} />
);
