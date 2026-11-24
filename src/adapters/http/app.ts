import { createReadStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  type ConvertOptions,
  type ConvertResult,
  convertVideoToSoundSticker,
} from "../../pipeline/convert.js";
import { CommandError } from "../../utils/ffmpeg.js";
import { Semaphore } from "../../utils/semaphore.js";
import {
  API_LIMITS,
  type ApiErrorBody,
  type ConvertResponse,
} from "./contract.js";
import {
  ResultStore,
  SERVABLE_FILES,
  type ServableFile,
} from "./resultStore.js";
import { convertFieldsSchema } from "./schema.js";

export interface AppDeps {
  store?: ResultStore;
  convert?: (opts: ConvertOptions) => Promise<ConvertResult>;
  maxConcurrent?: number;
  maxQueue?: number;
}

const fail = (code: string, message: string): ApiErrorBody => ({
  error: { code, message },
});

export function createApp(deps: AppDeps = {}): Hono {
  const store = deps.store ?? new ResultStore();
  const convert = deps.convert ?? convertVideoToSoundSticker;
  const jobs = new Semaphore(deps.maxConcurrent ?? 2);
  const maxQueue = deps.maxQueue ?? 10;

  const app = new Hono().basePath("/api");

  app.get("/health", (c) => c.json({ ok: true }));

  app.post(
    "/convert",
    bodyLimit({
      maxSize: API_LIMITS.maxUploadBytes + 64 * 1024,
      onError: (c) =>
        c.json(
          fail(
            "too_large",
            `El archivo supera ${API_LIMITS.maxUploadBytes / 1024 / 1024} MB.`,
          ),
          413,
        ),
    }),
    async (c) => {
      if (jobs.pending >= maxQueue)
        return c.json(
          fail("busy", "Servidor ocupado, intenta en un momento."),
          503,
        );

      const body = await c.req.parseBody();
      const file = body.video;
      if (!(file instanceof File))
        return c.json(fail("missing_file", "Falta el campo 'video'."), 400);
      if (!file.type.startsWith("video/")) {
        return c.json(
          fail(
            "bad_type",
            `Tipo no soportado: ${file.type || "desconocido"}. Sube un video.`,
          ),
          415,
        );
      }

      const parsed = convertFieldsSchema.safeParse(body);
      if (!parsed.success) {
        const msg = parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        return c.json(fail("bad_options", msg), 400);
      }
      const opts = parsed.data;

      const job = await store.create();
      try {
        // Stored under a fixed name: the client filename is never used in a path.
        const input = join(job.dir, "input");
        await writeFile(input, Buffer.from(await file.arrayBuffer()));

        const result = await jobs.run(() =>
          convert({
            input,
            outDir: job.dir,
            name: "sticker",
            startSec: opts.startSec,
            durationSec: opts.durationSec,
            fit: opts.fit,
            audio: opts.includeAudio ? "source" : "none",
          }),
        );

        const s = result.stats;
        const response: ConvertResponse = {
          id: job.id,
          sticker: { url: `/api/results/${job.id}/sticker.webp`, ...s.sticker },
          audio: s.audio
            ? { url: `/api/results/${job.id}/sticker.ogg`, ...s.audio }
            : null,
          source: s.source,
          segment: s.segment,
          warnings: result.warnings,
          elapsedMs: s.elapsedMs,
          expiresAt: job.expiresAt.toISOString(),
        };
        return c.json(response);
      } catch (err) {
        await store.remove(job.id);
        const isUserError =
          err instanceof CommandError ||
          (err instanceof Error && /beyond|no video/i.test(err.message));
        const status: ContentfulStatusCode = isUserError ? 422 : 500;
        const message = isUserError
          ? "No se pudo procesar el video. ¿Es un archivo válido y el inicio está dentro de su duración?"
          : "Error interno al convertir.";
        console.error("[convert]", err);
        return c.json(
          fail(isUserError ? "unprocessable" : "internal", message),
          status,
        );
      }
    },
  );

  app.get("/results/:id/:file", async (c) => {
    const { id, file } = c.req.param();
    const path = store.resolve(id, file);
    if (!path) return c.json(fail("not_found", "Archivo no encontrado."), 404);
    const info = await stat(path).catch(() => null);
    if (!info)
      return c.json(fail("expired", "El resultado expiró o no existe."), 404);

    const download = c.req.query("download") !== undefined;
    return new Response(
      Readable.toWeb(createReadStream(path)) as ReadableStream,
      {
        headers: {
          "Content-Type": SERVABLE_FILES[file as ServableFile],
          "Content-Length": String(info.size),
          "Cache-Control": "private, max-age=1800",
          ...(download
            ? { "Content-Disposition": `attachment; filename="${file}"` }
            : {}),
        },
      },
    );
  });

  return app;
}
