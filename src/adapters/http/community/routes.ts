import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { z } from "zod";
import { probe } from "../../../core/probe/probe.js";
import { inspectWebp } from "../../../core/webp/inspect.js";
import {
  type ApiErrorBody,
  COMMUNITY_CATEGORIES,
  COMMUNITY_LIMITS,
  type CommunityPage,
  type CommunitySound,
  type CommunityStats,
  type CommunitySticker,
} from "../contract.js";
import type { ResultStore } from "../resultStore.js";
import { pageOf } from "./feed.js";
import { COMMUNITY_FILES, type CommunityFile, type CommunityRepo, type StoredSticker } from "./repo.js";

const fail = (code: string, message: string): ApiErrorBody => ({ error: { code, message } });
const categoryIds = COMMUNITY_CATEGORIES.map((c) => c.id) as [string, ...string[]];

const listSchema = z.object({
  sort: z.enum(["hot", "new", "top"]).default("hot"),
  period: z.enum(["day", "week", "all"]).default("week"),
  category: z.enum(categoryIds).optional(),
  q: z.string().max(COMMUNITY_LIMITS.maxQuery).default(""),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(COMMUNITY_LIMITS.maxPageSize).default(COMMUNITY_LIMITS.pageSize),
});

const tag = z
  .string()
  .trim()
  .min(1)
  .max(COMMUNITY_LIMITS.maxTagLength)
  .regex(/^[\p{L}\p{N}_-]+$/u, "Etiquetas: solo letras, números, - y _.");

const publishSchema = z.object({
  resultId: z.string().regex(/^[0-9a-f-]{36}$/),
  category: z.enum(categoryIds, { message: "Elige una categoría." }),
  title: z.string().trim().max(COMMUNITY_LIMITS.maxTitle).optional(),
  tags: z.array(tag).max(COMMUNITY_LIMITS.maxTags).optional(),
  ownsAudio: z.boolean().optional(),
  soundOrigin: z.string().nullish(),
});

const fileUrl = (id: string, file: CommunityFile) => `/api/community/files/${id}/${file}`;

export const toStickerDto = (s: StoredSticker): CommunitySticker => ({
  id: s.id,
  title: s.title,
  category: s.category,
  tags: s.tags,
  createdAt: new Date(s.createdAt).toISOString(),
  animated: s.animated,
  stickerUrl: fileUrl(s.id, "sticker.webp"),
  sound: s.soundSec !== null ? { url: fileUrl(s.id, "sticker.ogg"), durationSec: s.soundSec } : null,
  uses: s.uses,
  soundOrigin: s.soundOrigin,
});

export const toSoundDto = (s: StoredSticker): CommunitySound => ({
  id: s.id,
  title: s.title,
  category: s.category,
  url: fileUrl(s.id, "sticker.ogg"),
  durationSec: s.soundSec ?? 0,
  uses: s.uses,
  stickerUrl: fileUrl(s.id, "sticker.webp"),
  createdAt: new Date(s.createdAt).toISOString(),
});

/** Title fallback: "Sticker de Memes". */
const defaultTitle = (category: string) =>
  `Sticker de ${COMMUNITY_CATEGORIES.find((c) => c.id === category)?.label ?? "la comunidad"}`;

export function communityRoutes(repo: CommunityRepo, results: ResultStore): Hono {
  const app = new Hono();

  const list = async (query: Record<string, string>, onlySounds: boolean) => {
    const parsed = listSchema.safeParse(query);
    if (!parsed.success) return { error: fail("bad_query", parsed.error.issues.map((i) => i.message).join(" ")) };
    const all = await repo.list();
    const pool = onlySounds ? all.filter((s) => s.soundSec !== null) : all;
    const page = pageOf(pool, { ...parsed.data, category: parsed.data.category as never });
    if ("error" in page) return { error: fail("bad_cursor", "Cursor inválido; vuelve a cargar la lista.") };
    return { page };
  };

  app.get("/stickers", async (c) => {
    const r = await list(c.req.query(), false);
    if ("error" in r) return c.json(r.error, 400);
    return c.json({
      items: r.page.items.map(toStickerDto),
      nextCursor: r.page.nextCursor,
    } satisfies CommunityPage<CommunitySticker>);
  });

  app.get("/sounds", async (c) => {
    const r = await list(c.req.query(), true);
    if ("error" in r) return c.json(r.error, 400);
    return c.json({
      items: r.page.items.map(toSoundDto),
      nextCursor: r.page.nextCursor,
    } satisfies CommunityPage<CommunitySound>);
  });

  app.post("/stickers", async (c) => {
    const parsed = publishSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("bad_request", parsed.error.issues.map((i) => i.message).join(" ")), 400);
    const req = parsed.data;

    const webpPath = results.resolve(req.resultId, "sticker.webp");
    const webp = webpPath ? await readFile(webpPath).catch(() => null) : null;
    if (!webpPath || !webp) return c.json(fail("expired", "El sticker expiró. Vuelve a crearlo para publicarlo."), 404);
    const oggPath = results.resolve(req.resultId, "sticker.ogg") as string;
    const hasAudio = await stat(oggPath).then(
      () => true,
      () => false,
    );

    const origin = req.soundOrigin ? await repo.get(req.soundOrigin) : null;
    if (req.soundOrigin && (!origin || origin.soundSec === null)) {
      return c.json(fail("bad_request", "El sonido de la comunidad ya no existe."), 400);
    }
    if (hasAudio && !origin && req.ownsAudio !== true) {
      return c.json(fail("audio_rights", "Confirma que el audio es tuyo o que tienes permiso."), 400);
    }

    const item = await repo.add({
      title: req.title || defaultTitle(req.category),
      category: req.category as never,
      tags: [...new Set((req.tags ?? []).map((t) => t.toLowerCase()))],
      animated: inspectWebp(webp).animated,
      soundSec: hasAudio ? Math.round((await probe(oggPath)).durationSec * 10) / 10 : null,
      soundOrigin: origin?.id ?? null,
      webpPath,
      oggPath: hasAudio ? oggPath : null,
    });
    return c.json(toStickerDto(item), 201);
  });

  app.get("/sounds/:id", async (c) => {
    const s = await repo.get(c.req.param("id"));
    if (!s || s.soundSec === null) return c.json(fail("not_found", "Sonido no encontrado."), 404);
    return c.json(toSoundDto(s));
  });

  app.get("/stats", async (c) => {
    const all = await repo.list();
    return c.json({
      stickers: all.length,
      sounds: all.filter((s) => s.soundSec !== null).length,
      uses: all.reduce((n, s) => n + s.uses, 0),
    } satisfies CommunityStats);
  });

  // Someone picked this sound for a new sticker.
  app.post("/sounds/:id/use", async (c) => {
    const uses = await repo.recordUse(c.req.param("id"));
    if (uses === null) return c.json(fail("not_found", "Sonido no encontrado."), 404);
    return c.json({ uses });
  });

  app.get("/files/:id/:file", async (c) => {
    const { id, file } = c.req.param();
    const found = await repo.resolveFile(id, file);
    if (!found) return c.json(fail("not_found", "Archivo no encontrado."), 404);
    const download = c.req.query("download") !== undefined;
    return new Response(Readable.toWeb(createReadStream(found.path)) as ReadableStream, {
      headers: {
        "Content-Type": COMMUNITY_FILES[file as CommunityFile],
        "Content-Length": String(found.size),
        // ids are random and files never change → cache forever
        "Cache-Control": "public, max-age=31536000, immutable",
        ...(download
          ? { "Content-Disposition": `attachment; filename="estampido-${id.slice(0, 8)}.${file.split(".")[1]}"` }
          : {}),
      },
    });
  });

  return app;
}
