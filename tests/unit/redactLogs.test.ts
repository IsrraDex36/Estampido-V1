import { describe, expect, it } from "vitest";
import { carriesSecrets, installLogRedaction, isSecretLog } from "../../src/adapters/bot/redactLogs.js";

/** Same class name and shape libsignal prints («SessionEntry { _chains, currentRatchet … }»). */
class SessionEntry {
  _chains: Record<string, unknown> = {};
  currentRatchet: Record<string, unknown> = {};
}

function realEntry() {
  const e = new SessionEntry() as unknown as Record<string, unknown>;
  e.currentRatchet = {
    ephemeralKeyPair: { pubKey: Buffer.alloc(33, 5), privKey: Buffer.alloc(32, 9) },
    rootKey: Buffer.alloc(32, 7),
  };
  return e;
}

describe("Signal keys never reach the logs", () => {
  it("drops libsignal's «Closing session: SessionEntry {…}» (the exact production leak)", () => {
    expect(isSecretLog(["Closing session:", realEntry()])).toBe(true);
    expect(isSecretLog(["Opening session:", realEntry()])).toBe(true);
    expect(isSecretLog(["Removing old closed session:", realEntry()])).toBe(true);
    expect(isSecretLog(["Closing open session in favor of incoming prekey bundle"])).toBe(true);
  });

  it("drops any argument carrying key material, whatever the message", () => {
    expect(isSecretLog(["algo pasó", realEntry()])).toBe(true);
    expect(isSecretLog(["x", { deep: { more: { privKey: Buffer.alloc(32) } } }])).toBe(true);
    expect(isSecretLog(["x", { creds: { noiseKey: {} } }])).toBe(true);
  });

  it("keeps our normal lines (and is bounded on cycles / huge objects)", () => {
    expect(isSecretLog(["[self] send rechazado: logged_out"])).toBe(false);
    expect(isSecretLog(["Conexión cerrada (código 403).", { code: 403 }])).toBe(false);
    expect(isSecretLog([Buffer.alloc(10)])).toBe(false);
    const cyc: Record<string, unknown> = { a: 1 };
    cyc.self = cyc;
    expect(carriesSecrets(cyc)).toBe(false);
    const wide = Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`k${i}`, i]));
    expect(carriesSecrets(wide)).toBe(false);
  });

  it("installed on a console: secret lines vanish, others pass through untouched", () => {
    const out: unknown[][] = [];
    const sink = {
      log: (...a: unknown[]) => out.push(a),
      info: (...a: unknown[]) => out.push(a),
      warn: (...a: unknown[]) => out.push(a),
      error: (...a: unknown[]) => out.push(a),
      debug: (...a: unknown[]) => out.push(a),
      trace: (...a: unknown[]) => out.push(a),
    } as unknown as Console;
    installLogRedaction(sink);
    sink.info("Closing session:", realEntry());
    sink.warn("Session already closed", realEntry());
    sink.log("[self] envío: WhatsApp cerró con código 401");
    expect(out).toEqual([["[self] envío: WhatsApp cerró con código 401"]]);
  });
});
