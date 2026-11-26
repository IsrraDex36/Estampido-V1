import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WASocket } from "baileys";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerHandlers } from "../../src/adapters/bot/handlers.js";
import { LinkStore } from "../../src/adapters/bot/links.js";

const A = "a".repeat(64);
let dir = "";
afterEach(() => rm(dir, { recursive: true, force: true }));

/** Minimal socket: captures the upsert listener and outgoing messages. */
function fakeSock() {
  let listener: ((u: { messages: unknown[]; type: string }) => Promise<void>) | null = null;
  const sent: { jid: string; text?: string }[] = [];
  const sock = {
    user: { id: "5215500000000:3@s.whatsapp.net" },
    ev: {
      on: (ev: string, fn: typeof listener) => {
        if (ev === "messages.upsert") listener = fn;
      },
    },
    sendMessage: vi.fn(async (jid: string, content: { text?: string }) => {
      sent.push({ jid, text: content.text });
      return { key: { id: `out-${sent.length}` } };
    }),
  } as unknown as WASocket;
  const emit = (remoteJid: string, text: string, fromMe = false) =>
    listener?.({
      type: "notify",
      messages: [{ key: { id: `in-${Math.random()}`, remoteJid, fromMe }, message: { conversation: text } }],
    });
  return { sock, sent, emit };
}

async function setup() {
  dir = await mkdtemp(join(tmpdir(), "sva-linkh-"));
  const links = new LinkStore(join(dir, "links.json"));
  const { sock, sent, emit } = fakeSock();
  vi.spyOn(console, "log").mockImplementation(() => {});
  registerHandlers(sock, { allowed: new Set(), captureDir: dir, capture: false, links });
  return { links, sent, emit };
}

describe("bot: link codes", () => {
  it("a stranger (not in SVA_ALLOWED) sends the code in a DM → linked + confirmation", async () => {
    const { links, sent, emit } = await setup();
    const { code } = links.createCode(A);
    await emit("5215599998888@s.whatsapp.net", `Hola Estampido 👋 mi código: ${code.toLowerCase()}`);
    expect(await links.target(A)).toBe("5215599998888@s.whatsapp.net");
    expect(sent.at(-1)?.text).toMatch(/Listo/);
  });

  it("works from LID chats and from your own chat with yourself", async () => {
    const { links, emit } = await setup();
    const { code } = links.createCode(A);
    await emit("233500963782695@lid", code);
    expect(await links.target(A)).toBe("233500963782695@lid");
  });

  it("ignored in groups; unknown/expired codes get a helpful reply", async () => {
    const { links, sent, emit } = await setup();
    const { code } = links.createCode(A);
    await emit("120363000000000000@g.us", code);
    expect(await links.target(A)).toBeNull();
    expect(sent).toHaveLength(0);
    await emit("5215599998888@s.whatsapp.net", "EST-ZZZZZ");
    expect(sent.at(-1)?.text).toMatch(/No reconozco/);
  });

  it("normal chatter from strangers is still ignored (no reply)", async () => {
    const { sent, emit } = await setup();
    await emit("5215599998888@s.whatsapp.net", "hola, ¿qué tal?");
    await emit("5215599998888@s.whatsapp.net", "/saudio");
    expect(sent).toHaveLength(0);
  });
});
