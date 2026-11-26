import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AccountRepo } from "../accounts/repo.js";
import { type AppEnv, viewerKey } from "../accounts/session.js";
import { toStickerDto } from "../community/routes.js";
import {
  type AdminReports,
  type ApiErrorBody,
  HANDLE_RE,
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  type ReportResponse,
} from "../contract.js";
import type { ModerationRepo } from "./repo.js";

const fail = (code: string, message: string): ApiErrorBody => ({ error: { code, message } });
const reasonIds = REPORT_REASONS.map((r) => r.id) as [string, ...string[]];

const reportSchema = z
  .object({
    reason: z.enum(reasonIds, { message: "Elige un motivo." }),
    note: z
      .string()
      .max(REPORT_NOTE_MAX)
      .optional()
      .transform((s) =>
        [...(s ?? "")]
          .filter((ch) => (ch.codePointAt(0) ?? 0) >= 32)
          .join("")
          .trim(),
      ),
  })
  .strict();

export interface ModerationRoutesDeps {
  moderation: ModerationRepo;
  accounts: AccountRepo;
  /** null = allowed; else the response (404 when /admin is off, 401 bad password). */
  adminDenied: (c: Context<AppEnv>) => Response | null;
}

/** Reports (public) and the review queue + creator blocking (admin). */
export function moderationRoutes({ moderation, accounts, adminDenied }: ModerationRoutesDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.post("/community/stickers/:id/report", async (c) => {
    const reporter = viewerKey(c);
    if (!reporter) return c.json(fail("bad_client", "Falta el identificador del navegador."), 400);
    const parsed = reportSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("bad_request", parsed.error.issues.map((i) => i.message).join(" ")), 400);
    const out = await moderation.report(
      c.req.param("id"),
      reporter,
      parsed.data.reason as (typeof REPORT_REASONS)[number]["id"],
      parsed.data.note,
    );
    if (out.status === "not_found") return c.json(fail("not_found", "Ese sticker ya no existe."), 404);
    if (out.status === "own") return c.json(fail("own_sticker", "No puedes reportar tu propio sticker."), 400);
    if (out.status === "reported" && out.hiddenNow)
      console.log(`[moderación] sticker ${c.req.param("id")} oculto por reportes`);
    return c.json({ reported: out.status === "reported" } satisfies ReportResponse);
  });

  // ── admin ───────────────────────────────────────────────────────────────
  app.get("/admin/reports", async (c) => {
    const denied = adminDenied(c);
    if (denied) return denied;
    const items = (await moderation.queue()).map((e) => {
      const reasons: AdminReports["items"][number]["reasons"] = {};
      for (const r of e.reports) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
      return {
        sticker: { ...toStickerDto(e.sticker), reports: e.reports.length },
        reasons,
        notes: e.reports
          .filter((r) => r.note)
          .map((r) => ({ reason: r.reason, note: r.note, createdAt: new Date(r.createdAt).toISOString() })),
        latestAt: new Date(Math.max(...e.reports.map((r) => r.createdAt))).toISOString(),
        creatorBanned: e.creatorBanned,
      };
    });
    return c.json({ items } satisfies AdminReports);
  });

  app.post("/admin/reports/:id/dismiss", async (c) => {
    const denied = adminDenied(c);
    if (denied) return denied;
    if (!(await moderation.dismiss(c.req.param("id"))))
      return c.json(fail("not_found", "Ese sticker ya no existe."), 404);
    console.log(`[moderación] reportes descartados: ${c.req.param("id")}`);
    return c.json({ ok: true });
  });

  const banTarget = async (c: Context<AppEnv>) => {
    const handle = c.req.param("handle")?.toLowerCase() ?? "";
    return HANDLE_RE.test(handle) ? accounts.byHandle(handle, { includeBanned: true }) : null;
  };

  app.post("/admin/users/:handle/ban", async (c) => {
    const denied = adminDenied(c);
    if (denied) return denied;
    const user = await banTarget(c);
    if (!user) return c.json(fail("not_found", "Ese creador no existe."), 404);
    const hidden = await moderation.ban(user.id);
    console.log(`[moderación] @${user.handle} bloqueado (${hidden} stickers ocultos)`);
    return c.json({ banned: true, hidden });
  });

  app.delete("/admin/users/:handle/ban", async (c) => {
    const denied = adminDenied(c);
    if (denied) return denied;
    const user = await banTarget(c);
    if (!user) return c.json(fail("not_found", "Ese creador no existe."), 404);
    const restored = await moderation.unban(user.id);
    console.log(`[moderación] @${user.handle} desbloqueado (${restored} stickers visibles)`);
    return c.json({ banned: false, restored });
  });

  return app;
}
