/**
 * Community structure (phase 0): the sections and filters exist, the data
 * doesn't yet. See docs/COMUNIDAD.md for the phased plan.
 */
export const FEED_SORTS = [
  { id: "hot", label: "Tendencias" },
  { id: "new", label: "Nuevos" },
  { id: "top", label: "Top" },
] as const;
export type FeedSort = (typeof FEED_SORTS)[number]["id"];

export const TOP_PERIODS = [
  { id: "day", label: "Hoy" },
  { id: "week", label: "Semana" },
  { id: "all", label: "Siempre" },
] as const;
export type TopPeriod = (typeof TOP_PERIODS)[number]["id"];

export const CATEGORIES = [
  "Reacciones",
  "Memes",
  "Música",
  "Frases",
  "Gaming",
  "Anime",
  "Deportes",
  "Otros",
] as const;

export const MY_SPACE_TABS = [
  { id: "published", label: "Publicados", empty: "Lo que publiques aparecerá aquí." },
  { id: "saved", label: "Guardados", empty: "Guarda stickers para tenerlos a mano." },
  { id: "voted", label: "Votados", empty: "Los stickers que votes quedan aquí." },
] as const;

/** Phase in which each placeholder comes alive (shown as a hint). */
export const PHASE = { publish: 1, feed: 2, ranking: 3, social: 4 } as const;
