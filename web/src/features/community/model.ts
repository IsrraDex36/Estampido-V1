import { COMMUNITY_CATEGORIES, type CommunityCategory } from "@contract";

/** Community filters, categories and «Tu espacio» shelves (shared by the tabs). */
export const FEED_SORTS = [
  { id: "hot", label: "Tendencias" },
  { id: "new", label: "Nuevos" },
  { id: "top", label: "Top" },
  // Personal view (signed in): newest from the creators you follow.
  { id: "siguiendo", label: "Siguiendo" },
] as const;
/** Orders the server ranks (all but the personal «Siguiendo»). */
export const RANKED_SORTS = FEED_SORTS.filter((s) => s.id !== "siguiendo");
export type FeedSort = (typeof FEED_SORTS)[number]["id"];

export const TOP_PERIODS = [
  { id: "day", label: "Hoy" },
  { id: "week", label: "Semana" },
  { id: "all", label: "Siempre" },
] as const;
export type TopPeriod = (typeof TOP_PERIODS)[number]["id"];

/** Categories come from the shared contract (server validates the same ids). */
export const CATEGORIES = COMMUNITY_CATEGORIES;
export type CategoryId = CommunityCategory;
export const categoryById = (id: string | null) => CATEGORIES.find((c) => c.id === id) ?? null;

export const MY_SPACE_TABS = [
  { id: "saved", label: "Guardados", empty: "Toca el marcador de un sticker para guardarlo aquí." },
  { id: "sounds", label: "Sonidos", empty: "Guarda sonidos para usarlos en tus propios clips." },
  { id: "published", label: "Publicados", empty: "Publica un sticker desde «Crear» y aparecerá aquí." },
  { id: "packs", label: "Packs", empty: "Arma packs de hasta 30 stickers: en un sticker, menú ⋯ → «Agregar a pack»." },
  { id: "following", label: "Siguiendo", empty: "Sigue a creadores desde su perfil para ver aquí lo nuevo que publiquen." },
] as const;
