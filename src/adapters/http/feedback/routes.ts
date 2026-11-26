import { type Context, Hono } from "hono";
import { z } from "zod";
import { type AppEnv, viewerKey } from "../accounts/session.js";
import {
  type AdminFeedback,
  type ApiErrorBody,
  FEEDBACK_KINDS,
  FEEDBACK_LIMITS,
  type FeedbackStatus,
} from "../contract.js";
import { FeedbackLimitError, type FeedbackRepo } from "./repo.js";

const fail = (code: string, message: string): ApiErrorBody => ({ error: { code, message } });
const kindIds = FEEDBACK_KINDS.map((k) => k.id) as [string, ...string[]];
const STATUSES = ["nuevo", "leido", "hecho"] as const;

/** Control characters out (newlines kept where asked), trimmed. */
const clean = (s: string, newlines = false) =>
  [...s]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return (code >= 32 && code !== 127) || (newlines && ch === "\n");
    })
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const feedbackSchema = z
  .object({
    kind: z.enum(kindIds, { message: "Elige el tipo de comentario." }),
    message: z
      .string()
      .max(FEEDBACK_LIMITS.maxMessage * 2)
      .transform((s) => clean(s, true))
      .pipe(
        z
          .string()
          .min(FEEDBACK_LIMITS.minMessage, "Cuéntanos un poco más.")
          .max(FEEDBACK_LIMITS.maxMessage, `Máximo ${FEEDBACK_LIMITS.maxMessage} caracteres.`),
      ),
    contact: z
      .string()
      .max(FEEDBACK_LIMITS.maxContact)
      .optional()
      .transform((s) => clean(s ?? "")),
    // Path only (no query: it could carry personal data), capped.
    page: z
      .string()
      .max(200)
      .optional()
      .transform((s) => (s ?? "").split(/[?#]/)[0]?.slice(0, 120) ?? ""),
    app: z
      .string()
      .max(200)
      .optional()
      .transform((s) => clean(s ?? "").slice(0, 160)),
    website: z.string().max(200).optional(),
  })
  .strict();

export interface FeedbackRoutesDeps {
  feedback: FeedbackRepo;
  adminDenied: (c: Context<AppEnv>) => Response | null;
}

/** POST /feedback (anyone) and the admin inbox. */
export function feedbackRoutes({ feedback, adminDenied }: FeedbackRoutesDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.post("/feedback", async (c) => {
    const sender = viewerKey(c);
    if (!sender) return c.json(fail("bad_client", "Falta el identificador del navegador."), 400);
    const parsed = feedbackSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("bad_request", parsed.error.issues.map((i) => i.message).join(" ")), 400);
    const req = parsed.data;
    // Honeypot filled → a bot. Answer like success so it doesn't learn; store nothing.
    if (req.website) return c.json({ ok: true }, 201);
    try {
      await feedback.add({
        kind: req.kind as (typeof FEEDBACK_KINDS)[number]["id"],
        message: req.message,
        contact: req.contact,
        page: req.page,
        app: req.app,
        userId: c.get("user")?.id ?? null,
        sender,
      });
    } catch (err) {
      if (err instanceof FeedbackLimitError) return c.json(fail("too_many", err.message), 429);
      throw err;
    }
    return c.json({ ok: true }, 201);
  });

  // ── admin inbox ─────────────────────────────────────────────────────────
  app.get("/admin/feedback", async (c) => {
    const denied = adminDenied(c);
    if (denied) return denied;
    const status = c.req.query("status");
    const filter = (STATUSES as readonly string[]).includes(status ?? "") ? (status as FeedbackStatus) : undefined;
    return c.json((await feedback.list(filter)) satisfies AdminFeedback);
  });

  app.patch("/admin/feedback/:id", async (c) => {
    const denied = adminDenied(c);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => null)) as { status?: string } | null;
    if (!body?.status || !(STATUSES as readonly string[]).includes(body.status)) {
      return c.json(fail("bad_request", "Estado inválido."), 400);
    }
    if (!(await feedback.setStatus(c.req.param("id"), body.status as FeedbackStatus))) {
      return c.json(fail("not_found", "Ese comentario no existe."), 404);
    }
    return c.json({ ok: true });
  });

  app.delete("/admin/feedback/:id", async (c) => {
    const denied = adminDenied(c);
    if (denied) return denied;
    if (!(await feedback.remove(c.req.param("id")))) return c.json(fail("not_found", "Ese comentario no existe."), 404);
    return c.json({ ok: true });
  });

  return app;
}
