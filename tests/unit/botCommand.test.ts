import { describe, expect, it } from "vitest";
import { isAllowedSender, isCancel, jidDigits, parseSaudio } from "../../src/adapters/bot/command.js";

describe("parseSaudio", () => {
  it("ignores other text", () => {
    expect(parseSaudio("hola")).toBeNull();
    expect(parseSaudio(undefined)).toBeNull();
    expect(parseSaudio("/saudiox")).toBeNull();
  });
  it("defaults", () => {
    expect(parseSaudio("/saudio")).toEqual({ startSec: 0, fit: "pad", customAudio: false, hq: false });
  });
  it("parses start, duration, fit in any order", () => {
    expect(parseSaudio("!saudio crop 2.5 3")).toEqual({
      startSec: 2.5,
      durationSec: 3,
      fit: "crop",
      customAudio: false,
      hq: false,
    });
    expect(parseSaudio(".SAUDIO 1")).toMatchObject({ startSec: 1 });
    expect(parseSaudio(".SAUDIO 1")?.durationSec).toBeUndefined(); // pipeline default per kind
    expect(parseSaudio("/saudio 0 9")?.durationSec).toBe(9); // up to 10 s (images)
  });
  it("default framing is configurable (bot uses crop); explicit pad/crop wins", () => {
    expect(parseSaudio("/saudio", undefined, "crop")?.fit).toBe("crop");
    expect(parseSaudio("/saudio pad", undefined, "crop")?.fit).toBe("pad");
  });
  it("voz/audio flag requests custom audio", () => {
    expect(parseSaudio("/saudio 1 voz")).toMatchObject({
      startSec: 1,
      customAudio: true,
    });
    expect(parseSaudio("/saudio AUDIO crop")).toMatchObject({
      customAudio: true,
      fit: "crop",
    });
  });
  it("isCancel", () => {
    expect(isCancel("/cancelar")).toBe(true);
    expect(isCancel(" !cancel ")).toBe(true);
    expect(isCancel("/cancelar ya")).toBe(false);
  });
  it("rejects bad args", () => {
    expect(() => parseSaudio("/saudio foo")).toThrow(/no válido/);
    expect(() => parseSaudio("/saudio 0 181")).toThrow(/duración/);
    expect(parseSaudio("/saudio 0 180 hq")).toMatchObject({ durationSec: 180, hq: true });
  });
});

describe("access control", () => {
  const allowed = new Set(["595981234567"]);
  it("jidDigits", () => {
    expect(jidDigits("595981234567:12@s.whatsapp.net")).toBe("595981234567");
    expect(jidDigits("abc@g.us")).toBeNull();
  });
  it("own messages allowed", () => {
    expect(isAllowedSender({ fromMe: true, remoteJid: "1@s.whatsapp.net" }, allowed)).toBe(true);
  });
  it("DM from allowed PN, or via PN alt of a LID", () => {
    expect(isAllowedSender({ remoteJid: "595981234567@s.whatsapp.net" }, allowed)).toBe(true);
    expect(
      isAllowedSender(
        {
          remoteJid: "123456789@lid",
          remoteJidAlt: "595981234567@s.whatsapp.net",
        },
        allowed,
      ),
    ).toBe(true);
  });
  it("rejects strangers and bare LIDs", () => {
    expect(isAllowedSender({ remoteJid: "111@s.whatsapp.net" }, allowed)).toBe(false);
    expect(isAllowedSender({ remoteJid: "595981234567@lid" }, allowed)).toBe(false);
  });
  it("groups check participant, not group id", () => {
    expect(isAllowedSender({ remoteJid: "595981234567@g.us", participant: "222@s.whatsapp.net" }, allowed)).toBe(false);
    expect(isAllowedSender({ remoteJid: "x@g.us", participant: "595981234567@s.whatsapp.net" }, allowed)).toBe(true);
  });
});
