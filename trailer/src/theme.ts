import { loadFont as loadCinzel } from "@remotion/google-fonts/Cinzel";
import { loadFont as loadCormorant } from "@remotion/google-fonts/CormorantGaramond";

// The game's own look (src/style.css): Cinzel for display, Cormorant Garamond for prose, ember and violet on night.
const cinzel = loadCinzel("normal", { weights: ["400", "600"], subsets: ["latin"] });
const cormorant = loadCormorant("italic", { weights: ["400"], subsets: ["latin"] });
export const DISPLAY = `${cinzel.fontFamily}, "Trajan Pro", Georgia, serif`;
export const SERIF = `${cormorant.fontFamily}, Georgia, serif`;

export const C = {
  ink: "#07050b",
  night: "#120c1c",
  bone: "#efe6d6",
  mist: "#b3a6c4",
  gold: "#ffcf8a",
  ember: "#ff8a3d",
  fire: "#ffb35e",
  violet: "#9a7bff",
  dawn: "#ffe2b8",
};
/** FIRE, SHADOW, TIME */
export const THEME_COLORS = [C.ember, C.violet, C.dawn];
export const ROMAN = ["I", "II", "III"];
/** A theme's colour by its word (v2 shows them in a different order than v1: the look follows the word, not the slot). */
export const colorOf = (name: string, i: number): string => ({ FIRE: C.ember, SHADOW: C.violet, TIME: C.dawn } as Record<string, string>)[name] ?? THEME_COLORS[i];

export const glow = (col: string, r = 26) => ({ textShadow: `0 0 ${r}px ${col}aa, 0 0 ${r * 2.4}px ${col}44, 0 2px 4px #000` });
