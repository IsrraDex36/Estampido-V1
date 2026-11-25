import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { UserInputError } from "../../core/errors.js";
import { probe } from "../../core/probe/probe.js";
import { inspectWebp } from "../../core/webp/inspect.js";
import { type ConvertOptions, type ConvertResult, convertToSoundSticker } from "../../pipeline/convert.js";
import { CommandError } from "../../utils/ffmpeg.js";
import { Semaphore } from "../../utils/semaphore.js";
import { type BotClient, BotUnavailableError, createBotClient } from "./botClient.js";
import {
  API_LIMITS,
  type ApiErrorBody,
  type ConvertResponse,
  type SendToWhatsAppResponse,
  type WhatsAppStatus,
} from "./contract.js";
import { ResultStore, SERVABLE_FILES, type ServableFile } from "./resultStore.js";
import { convertFieldsSchema } from "./schema.js";

export interface AppDeps {
  bot?: BotClient;
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
  const bot = deps.bot ?? createBotClient();
  const convert = deps.convert ?? convertToSoundSticker;
  const jobs = new Semaphore(deps.maxConcurrent ?? 2);
  const maxQueue = deps.maxQueue ?? 10;

  const app = new Hono().basePath("/api");

  app.get("/health", (c) => c.json({ ok: true }));

  app.post(
    "/convert",
    bodyLimit({
      maxSize: API_LIMITS.maxUploadBytes + API_LIMITS.maxAudioBytes + 64 * 1024,
      onError: (c) =>
        c.json(fail("too_large", `El archivo supera ${API_LIMITS.maxUploadBytes / 1024 / 1024} MB.`), 413),
    }),
    async (c) => {
      if (jobs.pending >= maxQueue) return c.json(fail("busy", "Servidor ocupado, intenta en un momento."), 503);

      const body = await c.req.parseBody();
      const file = body.media ?? body.video;
      if (!(file instanceof File)) return c.json(fail("missing_file", "Falta el archivo (campo 'media')."), 400);
      if (!/^(video|image)\//.test(file.type)) {
        return c.json(
          fail("bad_type", `Tipo no soportado: ${file.type || "desconocido"}. Sube un video, GIF o imagen.`),
          415,
        );
      }

      if (file.size > API_LIMITS.maxUploadBytes) {
        return c.json(fail("too_large", `El archivo supera ${API_LIMITS.maxUploadBytes / 1024 / 1024} MB.`), 413);
      }

      // Optional replacement audio: any audio, or a video whose sound we reuse.
      const audioFile = body.audio instanceof File && body.audio.size > 0 ? body.audio : null;
      if (audioFile) {
        if (!/^(audio|video)\//.test(audioFile.type)) {
          return c.json(fail("bad_type", `Audio no soportado: ${audioFile.type || "desconocido"}.`), 415);
        }
        if (audioFile.size > API_LIMITS.maxAudioBytes) {
          return c.json(fail("too_large", `El audio supera ${API_LIMITS.maxAudioBytes / 1024 / 1024} MB.`), 413);
        }
      }

      const parsed = convertFieldsSchema.safeParse(body);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join(" ");
        return c.json(fail("bad_options", msg), 400);
      }
      const opts = parsed.data;

      const job = await store.create();
      try {
        // Stored under a fixed name: the client filename is never used in a path.
        const input = join(job.dir, "input");
        await writeFile(input, Buffer.from(await file.arrayBuffer()));
        let audioPath: string | undefined;
        if (audioFile && opts.includeAudio) {
          audioPath = join(job.dir, "audio-input");
          await writeFile(audioPath, Buffer.from(await audioFile.arrayBuffer()));
        }

        const result = await jobs.run(() =>
          convert({
            input,
            outDir: job.dir,
            name: "sticker",
            startSec: opts.startSec,
            durationSec: opts.durationSec,
            fit: opts.fit,
            audio: !opts.includeAudio
              ? "none"
              : audioPath
                ? { file: audioPath, startSec: opts.audioStartSec }
                : "source",
            metadata: opts.includeMetadata
              ? {
                  packName: opts.packName,
                  publisher: opts.publisher,
                  emojis: opts.emojis ? opts.emojis.split(",") : undefined,
                }
              : false,
          }),
        );

        const s = result.stats;
        const response: ConvertResponse = {
          id: job.id,
          kind: result.kind,
          sticker: { url: `/api/results/${job.id}/sticker.webp`, ...s.sticker },
          audio: s.audio ? { url: `/api/results/${job.id}/sticker.ogg`, ...s.audio } : null,
          source: s.source,
          segment: s.segment,
          warnings: result.warnings,
          elapsedMs: s.elapsedMs,
          expiresAt: job.expiresAt.toISOString(),
        };
        return c.json(response);
      } catch (err) {
        await store.remove(job.id);
        if (err instanceof UserInputError) {
          return c.json(fail("unprocessable", err.message), 422);
        }
        if (err instanceof CommandError) {
          console.error("[convert]", err.message);
          return c.json(fail("unprocessable", "No se pudo procesar el archivo. ¿Es un video válido?"), 422);
        }
        console.error("[convert]", err);
        return c.json(fail("internal", "Error interno al convertir."), 500);
      }
    },
  );

  app.get("/whatsapp/status", async (c) => c.json((await bot.status()) satisfies WhatsAppStatus));

  // Send a finished result to the bot owner's own chat as a native sound sticker.
  app.post("/results/:id/whatsapp", async (c) => {
    const webpPath = store.resolve(c.req.param("id"), "sticker.webp");
    if (!webpPath) return c.json(fail("not_found", "Resultado no encontrado."), 404);
    const webp = await readFile(webpPath).catch(() => null);
    if (!webp) return c.json(fail("expired", "El resultado expiró o no existe."), 404);

    const oggPath = store.resolve(c.req.param("id"), "sticker.ogg") as string;
    const hasAudio = await stat(oggPath).then(
      () => true,
      () => false,
    );
    try {
      const sent = await bot.sendToSelf({
        webpPath,
        animated: inspectWebp(webp).animated,
        ...(hasAudio ? { audioPath: oggPath, audioDurationSec: (await probe(oggPath)).durationSec } : {}),
      });
      return c.json(sent satisfies SendToWhatsAppResponse);
    } catch (err) {
      if (err instanceof BotUnavailableError) return c.json(fail("bot_unavailable", err.message), 503);
      console.error("[whatsapp]", err);
      return c.json(fail("send_failed", "No se pudo enviar a WhatsApp."), 502);
    }
  });

  app.get("/results/:id/:file", async (c) => {
    const { id, file } = c.req.param();
    const path = store.resolve(id, file);
    if (!path) return c.json(fail("not_found", "Archivo no encontrado."), 404);
    const info = await stat(path).catch(() => null);
    if (!info) return c.json(fail("expired", "El resultado expiró o no existe."), 404);

    const download = c.req.query("download") !== undefined;
    return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
      headers: {
        "Content-Type": SERVABLE_FILES[file as ServableFile],
        "Content-Length": String(info.size),
        "Cache-Control": "private, max-age=1800",
        ...(download ? { "Content-Disposition": `attachment; filename="${file}"` } : {}),
      },
    });
  });

  return app;
}
