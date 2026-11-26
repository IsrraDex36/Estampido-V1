import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AccountRepo, User } from "../accounts/repo.js";
import type { AppEnv } from "../accounts/session.js";
import type { CommunityRepo } from "../community/repo.js";
import { toStickerDto } from "../community/routes.js";
import {
  type ApiErrorBody,
  COMMUNITY_LIMITS,
  type CommunityPage,
  type CommunitySticker,
  type CreatorProfile,
  HANDLE_RE,
  PACK_LIMITS,
  type PackDetail,
  type PackSummary,
} from "../contract.js";
import { PackError, type PackRow, type SocialRepo } from "./repo.js";

const fail = (code: string, message: string): ApiErrorBody => ({ error: { code, message } });
const fileUrl = (id: string) => `/api/community/files/${id}/sticker.webp`;

const packName = z
  .string()
  .transform((s) =>
    [...s]
      .filter((ch) => (ch.codePointAt(0) ?? 0) >= 32)
      .join("")
      .replace(/\s+/g, " ")
      .trim(),
  )
  .pipe(
    z.string().min(1, "Ponle nombre al pack.").max(PACK_LIMITS.maxName, `Máximo ${PACK_LIMITS.maxName} caracteres.`),
  );
const pageSchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(COMMUNITY_LIMITS.maxPageSize).default(COMMUNITY_LIMITS.pageSize),
});

export const toPackSummary = (p: PackRow): PackSummary => ({
  id: p.id,
  name: p.name,
  count: p.count,
  covers: p.coverIds.map(fileUrl),
  owner: p.owner,
  updatedAt: new Date(p.updatedAt).toISOString(),
});

export interface SocialRoutesDeps {
  social: SocialRepo;
  accounts: AccountRepo;
  community: CommunityRepo;
}

/** Follow creators («Siguiendo» feed) and packs (curated sticker lists). */
export function socialRoutes({ social, accounts, community }: SocialRoutesDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const needUser = (c: Context<AppEnv>): User | Response =>
    c.get("user") ?? c.json(fail("auth_required", "Entra con tu WhatsApp para continuar."), 401);
  const creator = async (c: Context<AppEnv>) => {
    const handle = c.req.param("handle")?.toLowerCase() ?? "";
    return HANDLE_RE.test(handle) ? accounts.byHandle(handle) : null;
  };

  // ── follow ──────────────────────────────────────────────────────────────
  for (const method of ["put", "delete"] as const) {
    app[method]("/creators/:handle/follow", async (c) => {
      const me = needUser(c);
      if (me instanceof Response) return me;
      const target = await creator(c);
      if (!target) return c.json(fail("not_found", "Ese creador no existe."), 404);
      if (target.id === me.id) return c.json(fail("self", "No puedes seguirte a ti."), 400);
      const followers = await social.setFollow(me.id, target.id, method === "put");
      return c.json({ following: method === "put", followers });
    });
  }

  app.get("/me/following", async (c) => {
    const me = needUser(c);
    if (me instanceof Response) return me;
    const ids = await social.followingIds(me.id);
    const users = (await Promise.all(ids.map((id) => accounts.getUser(id)))).filter((u) => u && !u.banned);
    const items = await Promise.all(
      users.map(async (u) => ({ ...(await accounts.profile(u as User)), followedByMe: true })),
    );
    c.header("Cache-Control", "no-store");
    return c.json({ items: items satisfies CreatorProfile[] });
  });

  /** «Siguiendo»: newest stickers from the creators I follow. */
  app.get("/me/feed", async (c) => {
    const me = needUser(c);
    if (me instanceof Response) return me;
    const q = pageSchema.safeParse(c.req.query());
    if (!q.success) return c.json(fail("bad_query", "Consulta inválida."), 400);
    const page = await community.page({ sort: "new", period: "all", ...q.data }, "stickers", { followedBy: me.id });
    if ("error" in page) return c.json(fail("bad_cursor", "Cursor inválido; vuelve a cargar la lista."), 400);
    c.header("Cache-Control", "no-store");
    return c.json({
      items: page.items.map(toStickerDto),
      nextCursor: page.nextCursor,
    } satisfies CommunityPage<CommunitySticker>);
  });

  // ── packs ───────────────────────────────────────────────────────────────
  const packFailure = (c: Context, err: unknown) => {
    if (!(err instanceof PackError)) throw err;
    const status = err.code === "not_found" || err.code === "hidden" ? 404 : 409;
    return c.json(fail(err.code, err.message), status);
  };

  app.get("/me/packs", async (c) => {
    const me = needUser(c);
    if (me instanceof Response) return me;
    const sticker = c.req.query("sticker");
    const [packs, containing] = await Promise.all([
      social.packsOf(me.id),
      sticker ? social.packsContaining(me.id, sticker) : Promise.resolve([]),
    ]);
    c.header("Cache-Control", "no-store");
    return c.json({ items: packs.map(toPackSummary) satisfies PackSummary[], containing });
  });

  app.post("/me/packs", async (c) => {
    const me = needUser(c);
    if (me instanceof Response) return me;
    const body = z
      .object({ name: packName, stickerId: z.string().max(64).optional() })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(fail("bad_request", body.error.issues.map((i) => i.message).join(" ")), 400);
    try {
      const id = await social.createPack(me.id, body.data.name);
      if (body.data.stickerId) await social.addToPack(id, me.id, body.data.stickerId);
      return c.json(toPackSummary((await social.pack(id)) as PackRow), 201);
    } catch (err) {
      return packFailure(c, err);
    }
  });

  app.patch("/me/packs/:id", async (c) => {
    const me = needUser(c);
    if (me instanceof Response) return me;
    const body = z
      .object({ name: packName })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(fail("bad_request", body.error.issues.map((i) => i.message).join(" ")), 400);
    if (!(await social.renamePack(c.req.param("id"), me.id, body.data.name))) {
      return c.json(fail("not_found", "Ese pack no existe."), 404);
    }
    return c.json(toPackSummary((await social.pack(c.req.param("id"))) as PackRow));
  });

  app.delete("/me/packs/:id", async (c) => {
    const me = needUser(c);
    if (me instanceof Response) return me;
    if (!(await social.deletePack(c.req.param("id"), me.id)))
      return c.json(fail("not_found", "Ese pack no existe."), 404);
    return c.json({ deleted: true });
  });

  app.put("/me/packs/:id/stickers/:stickerId", async (c) => {
    const me = needUser(c);
    if (me instanceof Response) return me;
    try {
      await social.addToPack(c.req.param("id"), me.id, c.req.param("stickerId"));
      return c.json(toPackSummary((await social.pack(c.req.param("id"))) as PackRow));
    } catch (err) {
      return packFailure(c, err);
    }
  });

  app.delete("/me/packs/:id/stickers/:stickerId", async (c) => {
    const me = needUser(c);
    if (me instanceof Response) return me;
    if (!(await social.removeFromPack(c.req.param("id"), me.id, c.req.param("stickerId")))) {
      return c.json(fail("not_found", "Ese sticker no está en el pack."), 404);
    }
    return c.json(toPackSummary((await social.pack(c.req.param("id"))) as PackRow));
  });

  /** Public pack page (anyone with the link). */
  app.get("/packs/:id", async (c) => {
    const p = await social.pack(c.req.param("id"));
    if (!p) return c.json(fail("not_found", "Ese pack no existe."), 404);
    const items = (await social.packStickers(p.id)).map(toStickerDto);
    return c.json({ ...toPackSummary(p), items, mine: c.get("user")?.id === p.ownerId } satisfies PackDetail);
  });

  app.get("/creators/:handle/packs", async (c) => {
    const target = await creator(c);
    if (!target) return c.json(fail("not_found", "Ese creador no existe."), 404);
    return c.json({ items: (await social.packsOf(target.id, { onlyNonEmpty: true })).map(toPackSummary) });
  });

  return app;
}
