import type {
  CommunityPage,
  CommunitySound,
  CommunitySticker,
  CreatorProfile,
  FavoriteIds,
  FavoriteKind,
  Me,
  MeUpdate,
} from "@contract";
import { DELETE_ACCOUNT_CONFIRM } from "@contract";
import { clientHeaders, readJson } from "@/lib/api";

/** Cookie session + this browser's id (sign-out also unlinks it). */
const headers = () => ({ ...clientHeaders(), "content-type": "application/json" });

/** The signed-in user, or null. */
export async function getMe(signal?: AbortSignal): Promise<Me | null> {
  return (await readJson<{ me: Me | null }>(await fetch("/api/auth/session", { signal, headers: clientHeaders() }))).me;
}

/** This browser is linked to a WhatsApp → open a session for its account. */
export async function createSession(): Promise<{ me: Me; created: boolean }> {
  return readJson(await fetch("/api/auth/session", { method: "POST", headers: headers() }));
}

export async function logout(): Promise<void> {
  await readJson(await fetch("/api/auth/logout", { method: "POST", headers: headers() }));
}

export async function updateMe(patch: MeUpdate): Promise<Me> {
  return readJson(await fetch("/api/me", { method: "PATCH", headers: headers(), body: JSON.stringify(patch) }));
}

export async function deleteAccount(): Promise<{ removed: number }> {
  return readJson(
    await fetch("/api/me", {
      method: "DELETE",
      headers: headers(),
      body: JSON.stringify({ confirm: DELETE_ACCOUNT_CONFIRM }),
    }),
  );
}

const qs = (cursor: string | null, limit?: number) => {
  const p = new URLSearchParams();
  if (cursor) p.set("cursor", cursor);
  if (limit) p.set("limit", String(limit));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export async function getMyStickers(cursor: string | null, signal?: AbortSignal): Promise<CommunityPage<CommunitySticker>> {
  return readJson(await fetch(`/api/me/stickers${qs(cursor)}`, { signal, headers: clientHeaders() }));
}

export async function deleteMySticker(id: string): Promise<void> {
  await readJson(await fetch(`/api/me/stickers/${encodeURIComponent(id)}`, { method: "DELETE", headers: headers() }));
}

export async function setFavorite(kind: FavoriteKind, id: string, on: boolean): Promise<{ saved: boolean; saves: number }> {
  return readJson(
    await fetch(`/api/me/favorites/${kind}/${encodeURIComponent(id)}`, { method: on ? "PUT" : "DELETE", headers: headers() }),
  );
}

export async function importFavorites(items: { id: string; kind: FavoriteKind }[]): Promise<FavoriteIds & { added: number }> {
  return readJson(
    await fetch("/api/me/favorites/import", { method: "POST", headers: headers(), body: JSON.stringify({ items }) }),
  );
}

export async function getFavoriteStickers(signal?: AbortSignal): Promise<CommunitySticker[]> {
  return (await readJson<{ items: CommunitySticker[] }>(await fetch("/api/me/favorites?kind=sticker", { signal }))).items;
}

export async function getFavoriteSounds(signal?: AbortSignal): Promise<CommunitySound[]> {
  return (await readJson<{ items: CommunitySound[] }>(await fetch("/api/me/favorites?kind=sound", { signal }))).items;
}

export async function getTopCreators(signal?: AbortSignal, limit = 6): Promise<CreatorProfile[]> {
  return (await readJson<{ items: CreatorProfile[] }>(await fetch(`/api/creators?limit=${limit}`, { signal }))).items;
}

export async function getCreator(handle: string, signal?: AbortSignal): Promise<CreatorProfile> {
  return readJson(await fetch(`/api/creators/${encodeURIComponent(handle)}`, { signal }));
}

export async function getCreatorStickers(
  handle: string,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<CommunityPage<CommunitySticker>> {
  return readJson(await fetch(`/api/creators/${encodeURIComponent(handle)}/stickers${qs(cursor)}`, { signal }));
}
