import { describe, expect, it } from "vitest";
import { formatPairingCode, normalizePairingNumber } from "../../src/adapters/bot/connection.js";

describe("pairing code login", () => {
  it("normalizes the phone number (digits with country code)", () => {
    expect(normalizePairingNumber("+52 1 55 1234 5678")).toBe("5215512345678");
    expect(normalizePairingNumber("123")).toBeNull();
    expect(normalizePairingNumber(undefined)).toBeNull();
    expect(normalizePairingNumber("1".repeat(16))).toBeNull();
  });
  it("formats the code like WhatsApp shows it", () => {
    expect(formatPairingCode("ABCD1234")).toBe("ABCD-1234");
    expect(formatPairingCode("odd")).toBe("odd");
  });
});
