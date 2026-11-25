/** App paths (single source for links and the router). */
export const ROUTES = {
  create: "/",
  community: "/comunidad",
  privacy: "/privacidad",
  /** Owner-only (password); not linked from the UI. */
  admin: "/admin",
} as const;

/** Query param that opens «Crear» with a community sound loaded (remix). */
export const SOUND_PARAM = "sonido";
export const remixHref = (soundId: string): string => `${ROUTES.create}?${SOUND_PARAM}=${encodeURIComponent(soundId)}`;
