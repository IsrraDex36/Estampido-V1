import { describe, expect, it } from "vitest";
import { isRotateRequest, newAdvSecret, withAdvSecret } from "../../src/adapters/bot/pairing.js";

describe("withAdvSecret", () => {
  const qr = "https://wa.me/settings/linked_devices#REF,NOISE,IDENT,OLDADV,1";
  it("replaces only the 4th field", () => {
    expect(withAdvSecret(qr, "NEW")).toBe("https://wa.me/settings/linked_devices#REF,NOISE,IDENT,NEW,1");
  });
  it("handles legacy QR without URL prefix", () => {
    expect(withAdvSecret("REF,NOISE,IDENT,OLD", "NEW")).toBe("REF,NOISE,IDENT,NEW");
  });
  it("leaves unexpected shapes untouched", () => {
    expect(withAdvSecret("garbage", "NEW")).toBe("garbage");
  });
});

describe("isRotateRequest", () => {
  it.each([
    [{ content: [{ tag: "companion_reg_refresh" }] }, true],
    [{ content: [{ tag: "pair-device-rotate-qr" }] }, true],
    [{ content: [{ tag: "other" }] }, false],
    [{ content: undefined }, false],
    [{ content: Buffer.from("x") }, false],
  ])("%o → %s", (node, expected) => {
    expect(isRotateRequest(node)).toBe(expected);
  });
});

it("newAdvSecret is 32 random bytes base64", () => {
  const a = newAdvSecret();
  expect(Buffer.from(a, "base64")).toHaveLength(32);
  expect(newAdvSecret()).not.toBe(a);
});
