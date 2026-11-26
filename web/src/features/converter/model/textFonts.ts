import type { TextFont } from "./memeText";

/**
 * Font files for the Texto tab, fetched on demand (Latin subset covers
 * Spanish: á é í ó ú ñ ¿ ¡). Geist and Silkscreen are already in the app.
 */
const LOADERS: Partial<Record<TextFont, () => Promise<unknown>>> = {
  impact: () => import("@fontsource/anton/latin-400.css"),
  comic: () => import("@fontsource/bangers/latin-400.css"),
  bubbly: () => import("@fontsource/luckiest-guy/latin-400.css"),
  poster: () => import("@fontsource/bebas-neue/latin-400.css"),
  marker: () => import("@fontsource/permanent-marker/latin-400.css"),
  script: () => import("@fontsource/pacifico/latin-400.css"),
};

const loaded = new Map<TextFont, Promise<unknown>>();

/** Load a caption font's CSS once (no-op for built-in fonts; never throws). */
export function loadTextFont(font: TextFont): Promise<unknown> {
  const load = LOADERS[font];
  if (!load) return Promise.resolve();
  let p = loaded.get(font);
  if (!p) {
    p = load().catch(() => loaded.delete(font));
    loaded.set(font, p);
  }
  return p;
}

/** Every caption font (for the picker's own labels). */
export const loadAllTextFonts = (): Promise<unknown> =>
  Promise.all((Object.keys(LOADERS) as TextFont[]).map(loadTextFont));
