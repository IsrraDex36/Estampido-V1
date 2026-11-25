import { compose } from "./sprite";

/*
 * "Pum" — Estampido's mascot: a living sticker (peeled top-right corner) that
 * sings sound waves. Original pixel art, built from parts on a 27×18 canvas
 * so each part can animate as its own layer (8-bit "frames").
 *  k outline · w body · g peeled fold · e eyes · p cheeks
 *  o/m open mouth · c smile · 1/2/3 sound-wave arcs
 */
export const PUM_W = 27;
export const PUM_H = 18;

const BODY = [
  "..kkkkkkkkk....",
  ".kwwwwwwwwwk...",
  "kwwwwwwwwwwgk..",
  "kwwwwwwwwwwggk.",
  "kwwwwwwwwwwkkkk",
  "kwwewwwwwewwwwk",
  "kwwewwwwwewwwwk",
  "kwwwwwwwwwwwwwk",
  "kwpwwwwwwwwwpwk",
  "kwwwwwwwwwwwwwk",
  "kwwwwwwwwwwwwwk",
  "kwwwwwwwwwwwwwk",
  "kwwwwwwwwwwwwwk",
  ".kwwwwwwwwwwwk.",
  "..kkkkkkkkkkk..",
];
const FOOT = ["kwk", "kkk"];
const HAND = ["kkk", "kwk", "kkk"];
const MOUTH_OPEN = [".oo.", "ommo", "ommo", ".oo."];
const MOUTH_SMILE = ["....", "c..c", ".cc.", "...."];
const WAVES = ["...3.", ".2..3", "..2.3", "1.2.3", "1.2.3", "..2.3", ".2..3", "...3."];
export const PUM_NOTE = ["..kk", "..kw", "..k.", "kkk.", "kkk."];

const BX = 3; // body x on the canvas
const layer = (...parts: Parameters<typeof compose>[2]) => compose(PUM_W, PUM_H, parts);

export const PUM_LAYERS = {
  base: layer({ rows: BODY, x: BX, y: 0 }, { rows: FOOT, x: BX + 3, y: 15 }, { rows: FOOT, x: BX + 9, y: 15 }),
  handsIdle: layer({ rows: HAND, x: 0, y: 9 }, { rows: HAND, x: BX + 15, y: 9 }),
  handsA: layer({ rows: HAND, x: 0, y: 4 }, { rows: HAND, x: BX + 15, y: 10 }),
  handsB: layer({ rows: HAND, x: 0, y: 10 }, { rows: HAND, x: BX + 15, y: 4 }),
  mouthOpen: layer({ rows: MOUTH_OPEN, x: BX + 5, y: 8 }),
  mouthSmile: layer({ rows: MOUTH_SMILE, x: BX + 5, y: 8 }),
  waves: layer({ rows: WAVES, x: 22, y: 4 }),
} as const;

export const PUM_PALETTE = {
  // outline: a theme token so it stays visible on dark backgrounds
  k: "var(--pum-ink)",
  w: "#ffffff",
  g: "#c9c9cf",
  e: "#1d1d1f",
  p: "#ff8fb1",
  o: "#1d1d1f",
  m: "#e5484d",
  c: "#1d1d1f",
  "1": "var(--sound)",
  "2": "var(--sound)",
  "3": "var(--sound)",
};
export const PUM_NOTE_PALETTE = { k: "var(--retro-a)", w: "var(--retro-a)" };

