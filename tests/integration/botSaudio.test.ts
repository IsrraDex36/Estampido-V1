import { readFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { WAMessage, WASocket } from "baileys";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Downloader } from "../../src/adapters/bot/media.js";
import { createSaudio } from "../../src/adapters/bot/saudio.js";
import { parseStickerExif } from "../../src/core/metadata/stickerExif.js";
import { readExif } from "../../src/core/webp/chunks.js";
import { ffmpegPath, run } from "../../src/utils/ffmpeg.js";
import { makeAnimatedWebp, makePng, makeTempDir, makeVideo } from "../helpers/fixtures.js";

let dir: string;
let videoBytes: Buffer;
let voiceBytes: Buffer;
let pngBytes: Buffer;
let stickerBytes: Buffer;

beforeAll(async () => {
  dir = await makeTempDir();
  videoBytes = await readFile(await makeVideo(dir, "v.mp4", { seconds: 4 }));
  const voice = join(dir, "voice.ogg");
  await run(ffmpegPath(), [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=700:duration=3",
    "-c:a",
    "libopus",
    voice,
  ]);
  voiceBytes = await readFile(voice);
  pngBytes = await readFile(await makePng(dir));
  stickerBytes = await readFile(await makeAnimatedWebp(dir));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Fake socket recording sendMessage calls. */
function fakeSock() {
  const sent: { jid: string; content: Record<string, unknown> }[] = [];
  const sock = {
    sendMessage: vi.fn(async (jid: string, content: Record<string, unknown>) => {
      // Snapshot media now: the bot deletes its temp dir right after sending.
      const media = (content.sticker ?? content.audio) as { url?: string } | undefined;
      if (media?.url) content = { ...content, bytes: readFileSync(media.url) };
      sent.push({ jid, content });
      return undefined;
    }),
  } as unknown as WASocket;
  return { sock, sent };
}

/** Serves fixture bytes per media type, like downloadContentFromMessage. */
const downloader: Downloader = async (_msg, type) => {
  const data = { audio: voiceBytes, image: pngBytes, sticker: stickerBytes }[type as string] ?? videoBytes;
  return (async function* () {
    yield data;
  })();
};

const JID = "595981234567@s.whatsapp.net";
const msg = (id: string, message: WAMessage["message"]): WAMessage => ({
  key: { id, remoteJid: JID },
  message,
});

/** The latest text = the final state of the edited status message. */
const lastText = (sent: { content: Record<string, unknown> }[]) =>
  String([...sent].reverse().find((s) => typeof s.content.text === "string")?.content.text ?? "");

const kinds = (sent: { content: Record<string, unknown> }[]) =>
  sent.map(({ content }) => Object.keys(content).find((k) => ["sticker", "audio", "text", "react"].includes(k)));

describe("/saudio via fake socket (real pipeline)", () => {
  it("plain: sends sticker + voice note + summary", async () => {
    const { sock, sent } = fakeSock();
    const saudio = createSaudio(sock, { download: downloader, sendMode: "fallback" });
    await saudio.onCommand(msg("1", { videoMessage: { caption: "/saudio 0 2" } }), "/saudio 0 2");

    expect(kinds(sent)).toEqual(expect.arrayContaining(["sticker", "audio", "react"]));
    expect(lastText(sent)).toMatch(/^✔ Listo · sticker \+ nota de voz/);
    const audio = sent.find((s) => "audio" in s.content)?.content;
    expect(audio).toMatchObject({
      ptt: true,
      mimetype: "audio/ogg; codecs=opus",
    });
    expect(lastText(sent)).toMatch(/^✔ Listo/);
  });

  it("sticker carries pack metadata; author defaults to sender name", async () => {
    const { sock, sent } = fakeSock();
    const saudio = createSaudio(sock, {
      download: downloader,
      metadata: { packName: "Pack Bot" },
      sendMode: "fallback",
    });
    const m = { ...msg("m", { videoMessage: { caption: "/saudio 0 1" } }), pushName: "Isra" };
    await saudio.onCommand(m, "/saudio 0 1");
    const bytes = sent.find((s) => "sticker" in s.content)?.content.bytes as Buffer;
    const meta = parseStickerExif(readExif(bytes) as Buffer);
    expect(meta).toMatchObject({ packName: "Pack Bot", publisher: "Isra" });
    expect(lastText(sent)).toMatch(/^✔ Listo/);
  });

  it("plain /saudio (no duration) takes the whole video", async () => {
    const { sock, sent } = fakeSock();
    const saudio = createSaudio(sock, { download: downloader, sendMode: "fallback" });
    await saudio.onCommand(msg("full", { videoMessage: { caption: "/saudio" } }), "/saudio");
    // fixture video is 4 s → sticker and sound are 4 s, not the old 5 s default
    expect(lastText(sent)).toMatch(/0:04 · calidad \d+ · 🔊 0:04/);
  });

  it("voz: waits for audio, then uses it", async () => {
    const { sock, sent } = fakeSock();
    const saudio = createSaudio(sock, { download: downloader, sendMode: "fallback" });
    await saudio.onCommand(msg("2", { videoMessage: { caption: "/saudio voz" } }), "/saudio voz");
    expect(saudio.pending.size).toBe(1);
    expect(String(sent.at(-1)?.content.text)).toMatch(/nota de voz/);

    // Unrelated text doesn't consume the pending job.
    expect(await saudio.onAudio(msg("3", { conversation: "hola" }))).toBe(false);

    sent.length = 0;
    expect(await saudio.onAudio(msg("4", { audioMessage: { ptt: true } }))).toBe(true);
    expect(saudio.pending.size).toBe(0);
    expect(kinds(sent)).toContain("sticker");
    expect(kinds(sent)).toContain("audio");
  });

  it("rejects oversized video from declared fileLength without downloading", async () => {
    const { sock, sent } = fakeSock();
    const dl = vi.fn(downloader);
    const saudio = createSaudio(sock, { download: dl, sendMode: "fallback" });
    await saudio.onCommand(
      msg("5", {
        videoMessage: { caption: "/saudio", fileLength: 999 * 1024 * 1024 },
      }),
      "/saudio",
    );
    expect(dl).not.toHaveBeenCalled();
    expect(lastText(sent)).toMatch(/El video supera el límite de 50 MB/);
  });

  it("cancel discards pending job", async () => {
    const { sock, sent } = fakeSock();
    const saudio = createSaudio(sock, { download: downloader, sendMode: "fallback" });
    await saudio.onCommand(msg("6", { videoMessage: { caption: "/saudio voz" } }), "/saudio voz");
    await saudio.onCancel(msg("7", { conversation: "/cancelar" }));
    expect(saudio.pending.size).toBe(0);
    expect(String(sent.at(-1)?.content.text)).toBe("Cancelado.");
  });

  it("no video → usage hint", async () => {
    const { sock, sent } = fakeSock();
    await createSaudio(sock, { download: downloader, sendMode: "fallback" }).onCommand(
      msg("8", { conversation: "/saudio" }),
      "/saudio",
    );
    expect(String(sent[0]?.content.text)).toMatch(/Uso: \/saudio/);
  });

  it("image with caption → asks for sound (implicit voz) → static sticker + sound", async () => {
    const { sock, sent } = fakeSock();
    const saudio = createSaudio(sock, { download: downloader, sendMode: "fallback" });
    await saudio.onCommand(msg("i1", { imageMessage: { caption: "/saudio" } }), "/saudio");
    expect(String(sent.at(-1)?.content.text)).toMatch(/La imagen no tiene sonido/);
    expect(saudio.pending.size).toBe(1);

    sent.length = 0;
    await saudio.onAudio(msg("i2", { audioMessage: { ptt: true } }));
    expect(kinds(sent)).toEqual(expect.arrayContaining(["sticker", "audio"]));
    expect(lastText(sent)).toMatch(/estático · calidad \d+ · 🔊 0:03/);
  });

  it("WhatsApp GIF (gifPlayback) → asks for sound; sound may outlast the loop", async () => {
    const { sock, sent } = fakeSock();
    const saudio = createSaudio(sock, { download: downloader, sendMode: "fallback" });
    await saudio.onCommand(msg("g1", { videoMessage: { caption: "/saudio 0 1", gifPlayback: true } }), "/saudio 0 1");
    expect(String(sent.at(-1)?.content.text)).toMatch(/El GIF no tiene sonido/);
    sent.length = 0;
    await saudio.onAudio(msg("g2", { audioMessage: {} }));
    // clip 1 s, but looping source → sound limited by requested 1 s too (explicit duration)
    expect(lastText(sent)).toMatch(/🔊 0:01/);
  });

  it("reply to a sticker → re-encodes it with sound", async () => {
    const { sock, sent } = fakeSock();
    const saudio = createSaudio(sock, { download: downloader, sendMode: "fallback" });
    const reply = msg("s1", {
      extendedTextMessage: {
        text: "/saudio",
        contextInfo: { quotedMessage: { stickerMessage: { isAnimated: true } } },
      },
    });
    await saudio.onCommand(reply, "/saudio");
    expect(String(sent.at(-1)?.content.text)).toMatch(/El sticker no tiene sonido/);
    sent.length = 0;
    await saudio.onAudio(msg("s2", { audioMessage: {} }));
    expect(kinds(sent)).toContain("sticker");
  });

  it("native mode: uploads both media and relays ONE field-134 sound sticker", async () => {
    const { sock, sent } = fakeSock();
    const relayed: { jid: string; message: Record<string, unknown> }[] = [];
    const uploads: string[] = [];
    Object.assign(sock, {
      user: { id: "525500000001:8@s.whatsapp.net" },
      waUploadToServer: async (_path: string, opts: { mediaType: string }) => {
        uploads.push(opts.mediaType);
        return { mediaUrl: `https://mmg.whatsapp.net/${opts.mediaType}`, directPath: `/v/t62/${opts.mediaType}` };
      },
      relayMessage: async (jid: string, message: Record<string, unknown>) => {
        relayed.push({ jid, message });
        return "id";
      },
    });
    const saudio = createSaudio(sock, { download: downloader, sendMode: "native" });
    await saudio.onCommand(msg("n1", { videoMessage: { caption: "/saudio 0 2" } }), "/saudio 0 2");

    expect(uploads.sort()).toEqual(["audio", "sticker"]);
    expect(relayed).toHaveLength(1);
    expect(kinds(sent)).not.toContain("sticker"); // no separate sticker
    expect(kinds(sent)).not.toContain("audio"); // no separate voice note
    expect(lastText(sent)).toMatch(/con sonido 🔊/);

    const { proto } = await import("baileys");
    const { decodeRaw } = await import("../../src/utils/protobufRaw.js");
    const bytes = Buffer.from(proto.Message.encode(relayed[0]?.message as never).finish());
    const f134 = decodeRaw(bytes).find((f) => f.field === 134);
    expect(f134).toBeDefined();
  });

  it("native failure falls back to separate sticker + voice note", async () => {
    const { sock, sent } = fakeSock(); // no relayMessage/waUploadToServer → native throws
    const saudio = createSaudio(sock, { download: downloader, sendMode: "native" });
    await saudio.onCommand(msg("f1", { videoMessage: { caption: "/saudio 0 1" } }), "/saudio 0 1");
    expect(kinds(sent)).toEqual(expect.arrayContaining(["sticker", "audio"]));
    expect(lastText(sent)).toMatch(/el envío nativo falló/);
  });

  it("queue position + /cancelar stops a queued job and a running one", async () => {
    const { sock, sent } = fakeSock();
    // Slow downloads keep job A converting while B queues.
    const saudio = createSaudio(sock, { download: downloader, sendMode: "fallback", concurrency: 1 });
    let releaseA: () => void = () => {};
    const blocker = saudio.jobs.run(() => new Promise<void>((r) => (releaseA = r))); // occupy the only slot
    const user = (id: string) => ({ ...msg(id, { videoMessage: { caption: "/saudio 0 1" } }) });

    const b = saudio.onCommand(user("qB"), "/saudio 0 1");
    await vi.waitFor(() => expect(lastText(sent)).toMatch(/En cola · eres el siguiente/));

    await saudio.onCancel(msg("cancelB", { conversation: "/cancelar" }));
    await b;
    expect(sent.some((s) => s.content.text === "🛑 Cancelado.")).toBe(true);
    expect(kinds(sent)).not.toContain("sticker"); // B never ran
    releaseA();
    await blocker;
  });

  it("rate limit per sender", async () => {
    const { sock, sent } = fakeSock();
    const saudio = createSaudio(sock, { download: downloader, sendMode: "fallback", ratePerMinute: 1 });
    await saudio.onCommand(msg("r1", { videoMessage: { caption: "/saudio 0 1" } }), "/saudio 0 1");
    await saudio.onCommand(msg("r2", { videoMessage: { caption: "/saudio 0 1" } }), "/saudio 0 1");
    expect(lastText(sent)).toMatch(/Vas muy rápido/);
  });
});
