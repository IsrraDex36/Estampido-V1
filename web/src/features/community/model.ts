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
  { id: "reacciones", label: "Reacciones", emoji: "😮" },
  { id: "memes", label: "Memes", emoji: "😂" },
  { id: "musica", label: "Música", emoji: "🎵" },
  { id: "frases", label: "Frases", emoji: "💬" },
  { id: "doblajes", label: "Voces y doblajes", emoji: "🎙️" },
  { id: "efectos", label: "Efectos de sonido", emoji: "💥" },
  { id: "saludos", label: "Saludos", emoji: "👋" },
  { id: "amor", label: "Amor", emoji: "❤️" },
  { id: "cumple", label: "Cumpleaños", emoji: "🎂" },
  { id: "fiesta", label: "Fiesta", emoji: "🎉" },
  { id: "animales", label: "Animales", emoji: "🐶" },
  { id: "gaming", label: "Gaming", emoji: "🎮" },
  { id: "anime", label: "Anime", emoji: "🌸" },
  { id: "series", label: "Series y TV", emoji: "📺" },
  { id: "deportes", label: "Deportes", emoji: "⚽" },
  { id: "virales", label: "Virales", emoji: "🔥" },
  { id: "otros", label: "Otros", emoji: "✨" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const categoryById = (id: string | null) => CATEGORIES.find((c) => c.id === id) ?? null;

export const MY_SPACE_TABS = [
  { id: "published", label: "Publicados", empty: "Lo que publiques aparecerá aquí." },
  { id: "saved", label: "Guardados", empty: "Guarda stickers para tenerlos a mano." },
  { id: "voted", label: "Votados", empty: "Los stickers que votes quedan aquí." },
] as const;

/** Phase in which each placeholder comes alive (shown as a hint). */
export const PHASE = { publish: 1, feed: 2, ranking: 3, social: 4 } as const;
