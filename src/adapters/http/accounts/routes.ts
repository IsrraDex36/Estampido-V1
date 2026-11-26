import { type Context, Hono } from "hono";
import { z } from "zod";
import type { BotClient } from "../botClient.js";
import { clientHash } from "../client.js";
import type { CommunityRepo } from "../community/repo.js";
import { toSoundDto, toStickerDto } from "../community/routes.js";
import {
  type ApiErrorBody,
  AVATAR_COLORS,
  AVATAR_EMOJIS,
  CLIENT_HEADER,
  COMMUNITY_LIMITS,
  type CommunityPage,
  type CommunitySound,
  type CommunitySticker,
  type CreatorProfile,
  DELETE_ACCOUNT_CONFIRM,
  type FavoriteIds,
  HANDLE_RE,
  type Me,
  PROFILE_LIMITS,
} from "../contract.js";
import { type AccountRepo, HandleTakenError, MAX_FAVORITES, type User } from "./repo.js";
import type { AppEnv, SessionCookie } from "./session.js";

const fail = (code: string, message: string): ApiErrorBody => ({ error: { code, message } });

/** Control characters out (newlines kept only where allowed), spaces trimmed. */
const clean = (s: string, newlines = false) =>
  [...s]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return (code >= 32 && code !== 127) || (newlines && ch === "\n");
    })
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const validAvatar = (v: string) => {
  const [emoji, color, ...rest] = v.split(" ");
  return (
    rest.length === 0 &&
    (AVATAR_EMOJIS as readonly string[]).includes(emoji ?? "") &&
    (AVATAR_COLORS as readonly string[]).includes(color ?? "")
  );
};

const meUpdateSchema = z
  .object({
    handle: z.string().trim().toLowerCase().regex(HANDLE_RE, "Usuario: 3 a 20 letras minúsculas, números o _."),
    displayName: z
      .string()
      .transform((s) => clean(s))
      .pipe(z.string().min(1, "Escribe tu nombre.").max(PROFILE_LIMITS.displayName)),
    bio: z
      .string()
      .transform((s) => clean(s, true))
      .pipe(z.string().max(PROFILE_LIMITS.bio)),
    avatar: z.string().refine(validAvatar, "Avatar no válido."),
  })
  .partial()
  .strict();

const pageSchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(COMMUNITY_LIMITS.maxPageSize).default(COMMUNITY_LIMITS.pageSize),
});

const kindSchema = z.enum(["sticker", "sound"]);
const importSchema = z.object({
  items: z.array(z.object({ id: z.string().max(64), kind: kindSchema })).max(MAX_FAVORITES * 2),
});

export interface AccountRoutesDeps {
  accounts: AccountRepo;
  community: CommunityRepo;
  bot: BotClient;
  cookie: SessionCookie;
}

/**
 * Accounts (login with WhatsApp), the signed-in user's space and public
 * creator pages. Signing in = this browser is linked to a WhatsApp (the user
 * sent the EST- code) → a session cookie for that WhatsApp's account.
 */
export function accountRoutes({ accounts, community, bot, cookie }: AccountRoutesDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  const needUser = (c: Context<AppEnv>): User | Response =>
    c.get("user") ?? c.json(fail("auth_required", "Entra con tu WhatsApp para continuar."), 401);

  // ── sign in / out ───────────────────────────────────────────────────────
  /** Who am I? Always 200 ({ me: null } when signed out): no console noise for visitors. */
  app.get("/auth/session", async (c) => {
    const user = c.get("user");
    c.header("Cache-Control", "no-store");
    return c.json({ me: user ? await accounts.me(user) : null } satisfies { me: Me | null });
  });

  app.post("/auth/session", async (c) => {
    const client = clientHash(c.req.header(CLIENT_HEADER));
    if (!client) return c.json(fail("bad_client", "Falta el identificador del navegador."), 400);
    let st: Awaited<ReturnType<BotClient["linkStatus"]>>;
    try {
      st = await bot.linkStatus(client);
    } catch {
      return c.json(fail("bot_unavailable", "No se puede verificar tu WhatsApp ahora; inténtalo luego."), 503);
    }
    if (st.state !== "linked") return c.json(fail("not_linked", "Primero vincula tu WhatsApp."), 401);
    if (!st.account) {
      return c.json(fail("bot_outdated", "El bot necesita reiniciarse para activar las cuentas."), 503);
    }
    const { user, created } = await accounts.upsertFromLink(st.account, st.phone);
    if (c.get("user")?.id !== user.id) cookie.write(c, await accounts.createSession(user.id, client));
    c.header("Cache-Control", "no-store");
    return c.json({ me: await accounts.me(user), created });
  });

  /** Sign out = end the session AND unlink this browser (otherwise it would sign right back in). */
  app.post("/auth/logout", async (c) => {
    const token = cookie.read(c);
    if (token) await accounts.deleteSession(token);
    const client = clientHash(c.req.header(CLIENT_HEADER));
    if (client) {
      await accounts.deleteSessionsForClient(client);
      await bot.unlink(client).catch(() => {}); // bot offline: the session is gone anyway
    }
    cookie.clear(c);
    return c.json({ ok: true });
  });

  // ── me ──────────────────────────────────────────────────────────────────
  app.get("/me", async (c) => {
    const user = needUser(c);
    if (user instanceof Response) return user;
    c.header("Cache-Control", "no-store");
    return c.json((await accounts.me(user)) satisfies Me);
  });

  app.patch("/me", async (c) => {
    const user = needUser(c);
    if (user instanceof Response) return user;
    const parsed = meUpdateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("bad_request", parsed.error.issues.map((i) => i.message).join(" ")), 400);
    try {
      return c.json((await accounts.me(await accounts.updateProfile(user.id, parsed.data))) satisfies Me);
    } catch (err) {
      if (err instanceof HandleTakenError) return c.json(fail("handle_taken", err.message), 409);
      throw err;
    }
  });

  app.delete("/me", async (c) => {
    const user = needUser(c);
    if (user instanceof Response) return user;
    const body = (await c.req.json().catch(() => null)) as { confirm?: string } | null;
    if (body?.confirm !== DELETE_ACCOUNT_CONFIRM) {
      return c.json(fail("confirm_required", `Escribe «${DELETE_ACCOUNT_CONFIRM}» para confirmar.`), 400);
    }
    const removed = await accounts.deleteUser(user.id);
    const client = clientHash(c.req.header(CLIENT_HEADER));
    if (client) await bot.unlink(client).catch(() => {});
    cookie.clear(c);
    console.log(`[cuentas] cuenta borrada (${removed} stickers)`);
    return c.json({ removed });
  });

  /** Everything I published (incl. «solo sonido»), newest first. */
  app.get("/me/stickers", async (c) => {
    const user = needUser(c);
    if (user instanceof Response) return user;
    const q = pageSchema.safeParse(c.req.query());
    if (!q.success) return c.json(fail("bad_query", "Consulta inválida."), 400);
    const page = await community.page({ sort: "new", period: "all", ...q.data }, "all", { ownerId: user.id });
    if ("error" in page) return c.json(fail("bad_cursor", "Cursor inválido; vuelve a cargar la lista."), 400);
    c.header("Cache-Control", "no-store");
    return c.json({
      items: page.items.map(toStickerDto),
      nextCursor: page.nextCursor,
    } satisfies CommunityPage<CommunitySticker>);
  });

  app.delete("/me/stickers/:id", async (c) => {
    const user = needUser(c);
    if (user instanceof Response) return user;
    const id = c.req.param("id");
    const s = await community.get(id);
    // Someone else's sticker looks the same as a missing one.
    if (!s || s.ownerId !== user.id) return c.json(fail("not_found", "Ese sticker no existe."), 404);
    await community.remove(id);
    return c.json({ removed: 1 });
  });

  // ── favorites (synced) ──────────────────────────────────────────────────
  app.get("/me/favorites/ids", async (c) => {
    const user = needUser(c);
    if (user instanceof Response) return user;
    c.header("Cache-Control", "no-store");
    return c.json((await accounts.favoriteIds(user.id)) satisfies FavoriteIds);
  });

  app.get("/me/favorites", async (c) => {
    const user = needUser(c);
    if (user instanceof Response) return user;
    const kind = kindSchema.safeParse(c.req.query("kind") ?? "sticker");
    if (!kind.success) return c.json(fail("bad_query", "Tipo inválido."), 400);
    const ids = await accounts.favoriteIds(user.id);
    const items = await community.getMany(kind.data === "sticker" ? ids.stickers : ids.sounds);
    c.header("Cache-Control", "no-store");
    return kind.data === "sticker"
      ? c.json({ items: items.map(toStickerDto) } satisfies { items: CommunitySticker[] })
      : c.json({ items: items.filter((s) => s.soundSec !== null).map(toSoundDto) } satisfies {
          items: CommunitySound[];
        });
  });

  for (const method of ["put", "delete"] as const) {
    app[method]("/me/favorites/:kind/:id", async (c) => {
      const user = needUser(c);
      if (user instanceof Response) return user;
      const kind = kindSchema.safeParse(c.req.param("kind"));
      if (!kind.success) return c.json(fail("bad_request", "Tipo inválido."), 400);
      const r = await accounts.setFavorite(user.id, c.req.param("id"), kind.data, method === "put");
      if (!r) return c.json(fail("not_found", "Ese sticker ya no existe."), 404);
      return c.json(r);
    });
  }

  app.post("/me/favorites/import", async (c) => {
    const user = needUser(c);
    if (user instanceof Response) return user;
    const parsed = importSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("bad_request", "Lista inválida."), 400);
    const added = await accounts.importFavorites(user.id, parsed.data.items);
    return c.json({ added, ...(await accounts.favoriteIds(user.id)) });
  });

  // ── public creators ─────────────────────────────────────────────────────
  app.get("/creators", async (c) => {
    const limit = Math.min(24, Math.max(1, Number(c.req.query("limit")) || 8));
    return c.json({ items: (await accounts.topCreators(limit)) satisfies CreatorProfile[] });
  });

  app.get("/creators/:handle", async (c) => {
    const handle = c.req.param("handle").toLowerCase();
    const user = HANDLE_RE.test(handle) ? await accounts.byHandle(handle) : null;
    if (!user) return c.json(fail("not_found", "Ese creador no existe."), 404);
    return c.json((await accounts.profile(user)) satisfies CreatorProfile);
  });

  app.get("/creators/:handle/stickers", async (c) => {
    const handle = c.req.param("handle").toLowerCase();
    const user = HANDLE_RE.test(handle) ? await accounts.byHandle(handle) : null;
    if (!user) return c.json(fail("not_found", "Ese creador no existe."), 404);
    const q = pageSchema.safeParse(c.req.query());
    if (!q.success) return c.json(fail("bad_query", "Consulta inválida."), 400);
    const page = await community.page({ sort: "new", period: "all", ...q.data }, "stickers", { ownerId: user.id });
    if ("error" in page) return c.json(fail("bad_cursor", "Cursor inválido; vuelve a cargar la lista."), 400);
    return c.json({
      items: page.items.map(toStickerDto),
      nextCursor: page.nextCursor,
    } satisfies CommunityPage<CommunitySticker>);
  });

  return app;
}
