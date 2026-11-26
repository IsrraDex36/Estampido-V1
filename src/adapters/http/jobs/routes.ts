import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { CancelledError, UserInputError } from "../../../core/errors.js";
import { whatsappIssues } from "../../../core/whatsappCompat.js";
import type { ConvertOptions, ConvertResult } from "../../../pipeline/convert.js";
import { CommandError } from "../../../utils/ffmpeg.js";
import type { AppEnv } from "../accounts/session.js";
import { clientHash } from "../client.js";
import {
  API_LIMITS,
  type ApiErrorBody,
  CLIENT_HEADER,
  type ConvertErrorCode,
  type ConvertJobAccepted,
  type ConvertJobStatus,
  type ConvertResponse,
  type ConvertSlot,
  type QueueInfo,
  SLOT_HEADER,
} from "../contract.js";
import type { ResultStore } from "../resultStore.js";
import { convertFieldsSchema } from "../schema.js";
import { type Admission, type ConversionQueue, JobTimeoutError, type Ticket } from "./queue.js";
import type { JobRegistry } from "./registry.js";

const MB = 1024 * 1024;

/** A failure as the API answers it. */
export interface Failure {
  status: number;
  code: ConvertErrorCode;
  message: string;
  retryAfterSec?: number;
}

const body = (f: Failure): ApiErrorBody & { error: { retryAfterSec?: number } } => ({
  error: { code: f.code, message: f.message, ...(f.retryAfterSec ? { retryAfterSec: f.retryAfterSec } : {}) },
});

/** Answer a failure (with Retry-After when the client should come back later). */
function reply(c: Context, f: Failure) {
  if (f.retryAfterSec) c.header("Retry-After", String(f.retryAfterSec));
  return c.json(body(f), f.status as ContentfulStatusCode);
}

/** Any error thrown while converting → a user-facing failure. Pure. */
export function conversionFailure(err: unknown): Failure | "cancelled" {
  if (err instanceof JobTimeoutError) {
    return {
      status: 504,
      code: "timeout",
      message: "Tardó demasiado en convertirse. Prueba con un tramo más corto o un archivo más ligero.",
    };
  }
  if (err instanceof CancelledError) return "cancelled";
  if (err instanceof UserInputError) return { status: 422, code: "unprocessable", message: err.message };
  if (err instanceof CommandError) {
    console.error("[convert]", err.message);
    return {
      status: 422,
      code: "unprocessable",
      message: "No se pudo procesar el archivo. ¿Es un video, GIF o imagen válido?",
    };
  }
  console.error("[convert]", err);
  return { status: 500, code: "internal", message: "Algo falló de nuestro lado al convertir. Inténtalo de nuevo." };
}

export interface ConvertRoutesDeps {
  store: ResultStore;
  convert: (opts: ConvertOptions) => Promise<ConvertResult>;
  queue: ConversionQueue;
  registry: JobRegistry;
  /** How long a reserved slot waits for its upload (s). */
  slotTtlSec?: number;
  now?: () => number;
}

/** Answer for a refused admission. */
const refusal = (a: Exclude<Admission, { ok: true }>): Failure =>
  a.code === "one_at_a_time"
    ? {
        status: 429,
        code: "one_at_a_time",
        message: "Ya estás creando un sticker. Espera a que termine o cancélalo para empezar otro.",
        retryAfterSec: a.retryAfterSec,
      }
    : {
        status: 503,
        code: "busy",
        message: `Hay mucha gente creando stickers ahora mismo. Vuelve a intentarlo en ~${a.retryAfterSec} s.`,
        retryAfterSec: a.retryAfterSec,
      };

/**
 * POST /convert (sync, or ?async=1 → 202 + job id), GET/DELETE /jobs/:id,
 * GET /queue. Admission happens BEFORE the upload is read.
 */
export function convertRoutes({
  store,
  convert,
  queue,
  registry,
  slotTtlSec = 300,
  now = Date.now,
}: ConvertRoutesDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  /**
   * Slots: a place reserved BEFORE uploading. Refusing a tiny request is clean
   * (no half-sent upload cut off, no wasted mobile data); the upload then
   * comes with the slot. Unused slots expire and free their place.
   */
  const slots = new Map<string, { ticket: Ticket; client: string; expiresAt: number }>();
  const sweepSlots = () => {
    const t = now();
    for (const [k, s] of slots) {
      if (s.expiresAt <= t) {
        s.ticket.release();
        slots.delete(k);
      }
    }
  };
  const sweeper = setInterval(sweepSlots, 15_000);
  sweeper.unref?.();

  app.post("/convert/slot", (c) => {
    sweepSlots();
    const client = clientHash(c.req.header(CLIENT_HEADER));
    if (!client)
      return reply(c, { status: 400, code: "bad_options", message: "Falta el identificador del navegador." });
    // Asking again with a live slot just gets the same one back (double clicks, retries).
    for (const [k, s] of slots) {
      if (s.client === client) {
        return c.json({
          slot: k,
          etaSec: queue.snapshot().etaSec,
          expiresInSec: Math.round((s.expiresAt - now()) / 1000),
        } satisfies ConvertSlot);
      }
    }
    const admission = queue.admit(client);
    if (!admission.ok) return reply(c, refusal(admission));
    const slot = randomUUID();
    slots.set(slot, { ticket: admission.ticket, client, expiresAt: now() + slotTtlSec * 1000 });
    return c.json({ slot, etaSec: queue.snapshot().etaSec, expiresInSec: slotTtlSec } satisfies ConvertSlot);
  });

  /** The ticket for this request: its slot if it brings one, else admission right now. */
  const ticketFor = (c: Context, client: string): { ticket: Ticket } | Failure => {
    const slotId = c.req.header(SLOT_HEADER);
    if (slotId) {
      const s = slots.get(slotId);
      if (!s || s.client !== client || s.expiresAt <= now()) {
        return { status: 409, code: "expired", message: "Tu lugar en la fila venció. Vuelve a intentarlo." };
      }
      slots.delete(slotId);
      return { ticket: s.ticket };
    }
    const admission = queue.admit(client);
    return admission.ok ? { ticket: admission.ticket } : refusal(admission);
  };

  /** Who is converting: this browser; without an id, a one-off key (no fairness, still bounded). */
  const clientOf = (c: Context) => clientHash(c.req.header(CLIENT_HEADER)) ?? `anon:${randomUUID()}`;

  app.get("/queue", (c) => {
    const s = queue.snapshot();
    c.header("Cache-Control", "no-store");
    return c.json({
      active: s.active,
      waiting: s.waiting,
      concurrency: s.concurrency,
      etaSec: s.etaSec,
      avgJobSec: s.avgJobSec,
      full: s.full,
    } satisfies QueueInfo);
  });

  app.post(
    "/convert",
    bodyLimit({
      maxSize: API_LIMITS.maxUploadBytes + API_LIMITS.maxAudioBytes + 64 * 1024,
      onError: (c) =>
        reply(c, {
          status: 413,
          code: "too_large",
          message: `El archivo supera ${API_LIMITS.maxUploadBytes / MB} MB.`,
        }),
    }),
    async (c) => {
      const client = clientOf(c);
      // 1. Admission: a slot reserved before uploading, or decide now — before reading the upload.
      const admitted = ticketFor(c, client);
      if ("status" in admitted) return reply(c, admitted);
      const ticket = admitted.ticket;
      let job: Awaited<ReturnType<ResultStore["create"]>> | null = null;
      try {
        // 2. Read + validate the upload (the place is held meanwhile).
        const prepared = await prepare(c, store);
        if ("status" in prepared) {
          ticket.release();
          return reply(c, prepared);
        }
        job = prepared.job;
        const opts = prepared.options;

        // 3a. Background job: answer now with a job id, convert in the queue.
        if (c.req.query("async") !== undefined) {
          const { id, signal } = registry.create(client);
          const resultJob = job;
          void runJob(ticket, opts, resultJob, signal, () => registry.started(id)).then(
            (result) => registry.finish(id, { state: "done", result }),
            async (err) => {
              await store.remove(resultJob.id);
              const f = conversionFailure(err);
              registry.finish(id, f === "cancelled" ? { state: "cancelled" } : { state: "failed", error: { ...f } });
            },
          );
          return c.json(
            { jobId: id, position: queue.positionOf(client), etaSec: queue.etaOf(client) } satisfies ConvertJobAccepted,
            202,
          );
        }

        // 3b. Classic: wait here (the client disconnecting cancels).
        try {
          return c.json(await runJob(ticket, opts, job, c.req.raw.signal));
        } catch (err) {
          await store.remove(job.id);
          const f = conversionFailure(err);
          // Client is gone; nobody reads this. 499 = "client closed request".
          return f === "cancelled" ? c.body(null, 499 as never) : reply(c, f);
        }
      } catch (err) {
        ticket.release();
        if (job) await store.remove(job.id);
        throw err;
      }
    },
  );

  app.get("/jobs/:id", (c) => {
    const client = clientHash(c.req.header(CLIENT_HEADER));
    const st = client
      ? registry.status(c.req.param("id"), client, {
          position: queue.positionOf(client),
          etaSec: queue.etaOf(client),
          expectedSec: queue.snapshot().avgJobSec,
        })
      : null;
    c.header("Cache-Control", "no-store");
    if (!st) {
      return reply(c, {
        status: 404,
        code: "expired",
        message: "Ese proceso ya no existe. Vuelve a crear el sticker.",
      });
    }
    return c.json(st satisfies ConvertJobStatus);
  });

  app.delete("/jobs/:id", (c) => {
    const client = clientHash(c.req.header(CLIENT_HEADER));
    if (!client || !registry.cancel(c.req.param("id"), client)) {
      return reply(c, { status: 404, code: "expired", message: "Ese proceso ya no existe." });
    }
    return c.json({ cancelled: true });
  });

  /** Convert in the queue and build the API response. */
  async function runJob(
    ticket: Ticket,
    opts: Omit<ConvertOptions, "signal">,
    job: { id: string; expiresAt: Date },
    signal: AbortSignal,
    onStart?: () => void,
  ): Promise<ConvertResponse> {
    const result = await queue.run(ticket, (jobSignal) => convert({ ...opts, signal: jobSignal }), { signal, onStart });
    const s = result.stats;
    const issues = whatsappIssues({
      animated: s.sticker.animated,
      animationSec: s.sticker.animated ? s.sticker.durationMs / 1000 : 0,
      audioSec: s.audio ? s.audio.durationSec : null,
      bytes: s.sticker.bytes,
    });
    return {
      id: job.id,
      whatsapp: { ok: issues.length === 0, issues },
      kind: result.kind,
      sticker: { url: `/api/results/${job.id}/sticker.webp`, ...s.sticker },
      audio: s.audio ? { url: `/api/results/${job.id}/sticker.ogg`, ...s.audio } : null,
      source: s.source,
      segment: s.segment,
      warnings: result.warnings,
      elapsedMs: s.elapsedMs,
      expiresAt: job.expiresAt.toISOString(),
    };
  }

  return app;
}

/** Read the multipart upload, validate it, store the files. A Failure on bad input. */
async function prepare(
  c: Context,
  store: ResultStore,
): Promise<Failure | { job: Awaited<ReturnType<ResultStore["create"]>>; options: Omit<ConvertOptions, "signal"> }> {
  let form: Awaited<ReturnType<typeof c.req.parseBody>>;
  try {
    form = await c.req.parseBody();
  } catch {
    // Connection dropped mid-upload, or a malformed form: not a server error.
    return {
      status: 400,
      code: "upload_failed",
      message: "La subida se interrumpió. Revisa tu conexión e inténtalo de nuevo.",
    };
  }
  const file = form.media ?? form.video;
  if (!(file instanceof File))
    return { status: 400, code: "missing_file", message: "Falta el archivo (campo «media»)." };
  if (!/^(video|image)\//.test(file.type)) {
    return {
      status: 415,
      code: "bad_type",
      message: `Ese tipo de archivo (${file.type || "desconocido"}) no se puede usar. Sube un video, GIF o imagen.`,
    };
  }
  if (file.size > API_LIMITS.maxUploadBytes) {
    return { status: 413, code: "too_large", message: `El archivo supera ${API_LIMITS.maxUploadBytes / MB} MB.` };
  }
  // Optional replacement audio: any audio, or a video whose sound we reuse.
  const audioFile = form.audio instanceof File && form.audio.size > 0 ? form.audio : null;
  if (audioFile) {
    if (!/^(audio|video)\//.test(audioFile.type)) {
      return {
        status: 415,
        code: "bad_type",
        message: `Ese audio (${audioFile.type || "desconocido"}) no se puede usar.`,
      };
    }
    if (audioFile.size > API_LIMITS.maxAudioBytes) {
      return { status: 413, code: "too_large", message: `El audio supera ${API_LIMITS.maxAudioBytes / MB} MB.` };
    }
  }
  const parsed = convertFieldsSchema.safeParse(form);
  if (!parsed.success) {
    return { status: 400, code: "bad_options", message: parsed.error.issues.map((i) => i.message).join(" ") };
  }
  const o = parsed.data;
  const job = await store.create();
  try {
    // Stored under a fixed name: the client filename is never used in a path.
    const input = join(job.dir, "input");
    await writeFile(input, new Uint8Array(await file.arrayBuffer()));
    let audioPath: string | undefined;
    if (audioFile && o.includeAudio) {
      audioPath = join(job.dir, "audio-input");
      await writeFile(audioPath, new Uint8Array(await audioFile.arrayBuffer()));
    }
    return {
      job,
      options: {
        input,
        outDir: job.dir,
        name: "sticker",
        startSec: o.startSec,
        durationSec: o.durationSec,
        maxBytes: o.hq ? API_LIMITS.maxExperimentalKb * 1024 : undefined,
        fit: o.fit,
        background: o.background,
        crop:
          o.cropX !== undefined || o.cropY !== undefined || o.cropZoom !== undefined
            ? { x: o.cropX ?? 0.5, y: o.cropY ?? 0.5, zoom: o.cropZoom ?? 1 }
            : undefined,
        audio: !o.includeAudio
          ? "none"
          : audioPath
            ? { file: audioPath, startSec: o.audioStartSec, durationSec: o.audioDurationSec }
            : "source",
        metadata: o.includeMetadata
          ? { packName: o.packName, publisher: o.publisher, emojis: o.emojis ? o.emojis.split(",") : undefined }
          : false,
      },
    };
  } catch (err) {
    await store.remove(job.id);
    throw err;
  }
}
