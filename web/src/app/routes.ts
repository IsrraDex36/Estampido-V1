/** App paths (single source for links and the router). */
export const ROUTES = {
  create: "/",
  community: "/comunidad",
  privacy: "/privacidad",
  /** Signed-in user's account (profile, my stickers, sign out, delete). */
  account: "/cuenta",
  /** Public creator page: /u/:handle. */
  creator: "/u/:handle",
  /** Public pack page: /p/:id. */
  pack: "/p/:id",
  /** Owner-only (password); not linked from the UI. */
  admin: "/admin",
} as const;

export const packHref = (id: string): string => `/p/${encodeURIComponent(id)}`;
export const creatorHref = (handle: string): string => `/u/${encodeURIComponent(handle)}`;

/** Query param that opens «Crear» with a community sound loaded (remix). */
export const SOUND_PARAM = "sonido";
export const remixHref = (soundId: string): string => `${ROUTES.create}?${SOUND_PARAM}=${encodeURIComponent(soundId)}`;
