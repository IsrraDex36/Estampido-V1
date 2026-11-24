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

const kinds = (sent: { content: Record<string, unknown> }[]) =>
  sent.map(({ content }) => Object.keys(content).find((k) => ["sticker", "audio", "text", "react"].includes(k)));

describe("/saudio via fake socket (real pipeline)", () => {
  it("plain: sends sticker + voice note + summary", async () => {
    const { sock, sent } = fakeSock();
    const saudio = createSaudio(sock, downloader);
    await saudio.onCommand(msg("1", { videoMessage: { caption: "/saudio 0 2" } }), "/saudio 0 2");

    expect(kinds(sent)).toEqual(["react", "sticker", "audio", "text", "react"]);
    const audio = sent.find((s) => "audio" in s.content)?.content;
    expect(audio).toMatchObject({
      ptt: true,
      mimetype: "audio/ogg; codecs=opus",
    });
    expect(String(sent.find((s) => "text" in s.content)?.content.text)).toMatch(/^✔ \d+ KB/);
  });

  it("sticker carries pack metadata; author defaults to sender name", async () => {
    const { sock, sent } = fakeSock();
    const saudio = createSaudio(sock, downloader, { packName: "Pack Bot" });
    const m = { ...msg("m", { videoMessage: { caption: "/saudio 0 1" } }), pushName: "Isra" };
    await saudio.onCommand(m, "/saudio 0 1");
    const bytes = sent.find((s) => "sticker" in s.content)?.content.bytes as Buffer;
    const meta = parseStickerExif(readExif(bytes) as Buffer);
    expect(meta).toMatchObject({ packName: "Pack Bot", publisher: "Isra" });
    const summary = String(sent.find((s) => "text" in s.content)?.content.text);
    expect(summary).toMatch(/^✔/);
  });

  it("voz: waits for audio, then uses it", async () => {
    const { sock, sent } = fakeSock();
    const saudio = createSaudio(sock, downloader);
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
    const saudio = createSaudio(sock, dl);
    await saudio.onCommand(
      msg("5", {
        videoMessage: { caption: "/saudio", fileLength: 999 * 1024 * 1024 },
      }),
      "/saudio",
    );
    expect(dl).not.toHaveBeenCalled();
    expect(String(sent.find((s) => "text" in s.content)?.content.text)).toMatch(/El video supera el límite de 50 MB/);
  });

  it("cancel discards pending job", async () => {
    const { sock, sent } = fakeSock();
    const saudio = createSaudio(sock, downloader);
    await saudio.onCommand(msg("6", { videoMessage: { caption: "/saudio voz" } }), "/saudio voz");
    await saudio.onCancel(msg("7", { conversation: "/cancelar" }));
    expect(saudio.pending.size).toBe(0);
    expect(String(sent.at(-1)?.content.text)).toBe("Cancelado.");
  });

  it("no video → usage hint", async () => {
    const { sock, sent } = fakeSock();
    await createSaudio(sock, downloader).onCommand(msg("8", { conversation: "/saudio" }), "/saudio");
    expect(String(sent[0]?.content.text)).toMatch(/Uso: \/saudio/);
  });

  it("image with caption → asks for sound (implicit voz) → static sticker + sound", async () => {
    const { sock, sent } = fakeSock();
    const saudio = createSaudio(sock, downloader);
    await saudio.onCommand(msg("i1", { imageMessage: { caption: "/saudio" } }), "/saudio");
    expect(String(sent.at(-1)?.content.text)).toMatch(/La imagen no tiene sonido/);
    expect(saudio.pending.size).toBe(1);

    sent.length = 0;
    await saudio.onAudio(msg("i2", { audioMessage: { ptt: true } }));
    expect(kinds(sent)).toEqual(expect.arrayContaining(["sticker", "audio"]));
    expect(String(sent.find((s) => "text" in s.content)?.content.text)).toMatch(/estático · q\d+ · 🔊 3\.0 s/);
  });

  it("WhatsApp GIF (gifPlayback) → asks for sound; sound may outlast the loop", async () => {
    const { sock, sent } = fakeSock();
    const saudio = createSaudio(sock, downloader);
    await saudio.onCommand(msg("g1", { videoMessage: { caption: "/saudio 0 1", gifPlayback: true } }), "/saudio 0 1");
    expect(String(sent.at(-1)?.content.text)).toMatch(/El GIF no tiene sonido/);
    sent.length = 0;
    await saudio.onAudio(msg("g2", { audioMessage: {} }));
    // clip 1 s, but looping source → sound limited by requested 1 s too (explicit duration)
    expect(String(sent.find((s) => "text" in s.content)?.content.text)).toMatch(/1\.0 s/);
  });

  it("reply to a sticker → re-encodes it with sound", async () => {
    const { sock, sent } = fakeSock();
    const saudio = createSaudio(sock, downloader);
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
});
