import type { CommunityPage, CommunitySticker, CreatorProfile, PackDetail, PackSummary } from "@contract";
import { clientHeaders, readJson } from "@/lib/api";

const json = () => ({ ...clientHeaders(), "content-type": "application/json" });
const enc = encodeURIComponent;

export async function setFollow(handle: string, on: boolean): Promise<{ following: boolean; followers: number }> {
  return readJson(await fetch(`/api/creators/${enc(handle)}/follow`, { method: on ? "PUT" : "DELETE", headers: json() }));
}
export async function getFollowing(signal?: AbortSignal): Promise<CreatorProfile[]> {
  return (await readJson<{ items: CreatorProfile[] }>(await fetch("/api/me/following", { signal }))).items;
}
export async function getFollowingFeed(cursor: string | null, signal?: AbortSignal): Promise<CommunityPage<CommunitySticker>> {
  return readJson(await fetch(`/api/me/feed${cursor ? `?cursor=${enc(cursor)}` : ""}`, { signal }));
}

export async function getMyPacks(sticker?: string, signal?: AbortSignal): Promise<{ items: PackSummary[]; containing: string[] }> {
  return readJson(await fetch(`/api/me/packs${sticker ? `?sticker=${enc(sticker)}` : ""}`, { signal }));
}
export async function createPack(name: string, stickerId?: string): Promise<PackSummary> {
  return readJson(await fetch("/api/me/packs", { method: "POST", headers: json(), body: JSON.stringify({ name, stickerId }) }));
}
export async function renamePack(id: string, name: string): Promise<PackSummary> {
  return readJson(await fetch(`/api/me/packs/${enc(id)}`, { method: "PATCH", headers: json(), body: JSON.stringify({ name }) }));
}
export async function deletePack(id: string): Promise<void> {
  await readJson(await fetch(`/api/me/packs/${enc(id)}`, { method: "DELETE", headers: json() }));
}
export async function setPackItem(packId: string, stickerId: string, on: boolean): Promise<PackSummary> {
  return readJson(
    await fetch(`/api/me/packs/${enc(packId)}/stickers/${enc(stickerId)}`, { method: on ? "PUT" : "DELETE", headers: json() }),
  );
}
export async function getPack(id: string, signal?: AbortSignal): Promise<PackDetail> {
  return readJson(await fetch(`/api/packs/${enc(id)}`, { signal }));
}
export async function getCreatorPacks(handle: string, signal?: AbortSignal): Promise<PackSummary[]> {
  return (await readJson<{ items: PackSummary[] }>(await fetch(`/api/creators/${enc(handle)}/packs`, { signal }))).items;
}
export async function getPopularTags(category?: string | null, signal?: AbortSignal): Promise<{ tag: string; count: number }[]> {
  const q = new URLSearchParams({ limit: "12" });
  if (category) q.set("category", category);
  return (await readJson<{ items: { tag: string; count: number }[] }>(await fetch(`/api/community/tags?${q}`, { signal }))).items;
}
export async function suggestTags(title: string, category: string | null, signal?: AbortSignal): Promise<string[]> {
  const q = new URLSearchParams({ title });
  if (category) q.set("category", category);
  return (await readJson<{ items: string[] }>(await fetch(`/api/community/tags/suggest?${q}`, { signal }))).items;
}
