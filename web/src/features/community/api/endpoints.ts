import type {
  CommunityPage,
  CommunitySound,
  CommunityStats,
  CommunitySticker,
  PublishRequest,
} from "@contract";
import { readJson } from "@/lib/api";
import type { CommunityFilters } from "../store/filters";

const BASE = "/api/community";

function qs(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function fetchStickers(
  f: CommunityFilters,
  cursor: string | null,
  signal?: AbortSignal,
  limit?: number,
): Promise<CommunityPage<CommunitySticker>> {
  const query = qs({ sort: f.sort, period: f.period, category: f.category, q: f.query.trim(), cursor, limit });
  return readJson(await fetch(`${BASE}/stickers${query}`, { signal }));
}

export interface SoundQuery {
  sort: "hot" | "new" | "top";
  q: string;
  limit?: number;
}

export async function fetchSounds(
  p: SoundQuery,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<CommunityPage<CommunitySound>> {
  return readJson(
    await fetch(`${BASE}/sounds${qs({ sort: p.sort, period: "all", q: p.q.trim(), cursor, limit: p.limit })}`, { signal }),
  );
}

export async function fetchSound(id: string, signal?: AbortSignal): Promise<CommunitySound> {
  return readJson(await fetch(`${BASE}/sounds/${encodeURIComponent(id)}`, { signal }));
}

export async function fetchStats(signal?: AbortSignal): Promise<CommunityStats> {
  return readJson(await fetch(`${BASE}/stats`, { signal }));
}

export async function publishSticker(req: PublishRequest): Promise<CommunitySticker> {
  return readJson(
    await fetch(`${BASE}/stickers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    }),
  );
}

export async function recordSoundUse(id: string): Promise<void> {
  await readJson(await fetch(`${BASE}/sounds/${encodeURIComponent(id)}/use`, { method: "POST" }));
}

/** Download a community sound as a File the converter can use like any own audio. */
export async function soundAsFile(sound: Pick<CommunitySound, "url" | "title">, signal?: AbortSignal): Promise<File> {
  const res = await fetch(sound.url, { signal });
  if (!res.ok) throw new Error("No se pudo descargar el sonido.");
  const blob = await res.blob();
  const safe = sound.title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 50) || "sonido";
  return new File([blob], `${safe}.ogg`, { type: "audio/ogg" });
}
