import { COMMUNITY_CATEGORIES, type CommunityCategory } from "@contract";

/** Community filters, categories and «Tu espacio» shelves (shared by the tabs). */
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

/** Categories come from the shared contract (server validates the same ids). */
export const CATEGORIES = COMMUNITY_CATEGORIES;
export type CategoryId = CommunityCategory;
export const categoryById = (id: string | null) => CATEGORIES.find((c) => c.id === id) ?? null;

export const MY_SPACE_TABS = [
  { id: "saved", label: "Guardados", empty: "Toca el marcador de un sticker para guardarlo aquí." },
  { id: "sounds", label: "Sonidos", empty: "Guarda sonidos para usarlos en tus propios clips." },
  { id: "published", label: "Publicados", empty: "Publica un sticker desde «Crear» y aparecerá aquí." },
] as const;
