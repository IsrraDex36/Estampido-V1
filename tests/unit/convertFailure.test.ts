import { describe, expect, it } from "vitest";
import type { ConvertErrorCode } from "../../src/adapters/http/contract.js";
import { describeFailure } from "../../web/src/features/converter/model/failure.js";

const f = (code: string, extra: Partial<{ status: number; retryAfterSec: number; message: string }> = {}) => ({
  code,
  status: 500,
  message: "mensaje del servidor",
  ...extra,
});

describe("conversion failure card", () => {
  it("every code the API can answer has a title, a body and at least one action", () => {
    const codes: ConvertErrorCode[] = [
      "busy",
      "one_at_a_time",
      "timeout",
      "upload_failed",
      "too_large",
      "bad_type",
      "missing_file",
      "bad_options",
      "unprocessable",
      "expired",
      "internal",
      "network",
      "aborted",
    ];
    for (const code of [...codes, "invalid_file", "algo_nuevo"]) {
      const v = describeFailure(f(code));
      expect(v.title.length, code).toBeGreaterThan(5);
      expect(v.body.length, code).toBeGreaterThan(5);
      expect(v.actions.length, code).toBeGreaterThan(0);
    }
  });

  it("busy retries by itself after the server's Retry-After (bounded 5–60 s)", () => {
    expect(describeFailure(f("busy", { status: 503, retryAfterSec: 12 }))).toMatchObject({
      tone: "busy",
      autoRetrySec: 12,
    });
    expect(describeFailure(f("busy", { retryAfterSec: 1 })).autoRetrySec).toBe(5);
    expect(describeFailure(f("busy", { retryAfterSec: 999 })).autoRetrySec).toBe(60);
    expect(describeFailure(f("busy")).autoRetrySec).toBe(10);
  });

  it("file problems offer choosing another file; timeouts offer a shorter clip (and no HQ when on)", () => {
    for (const c of ["too_large", "bad_type", "invalid_file", "unprocessable"]) {
      expect(describeFailure(f(c)).actions[0], c).toBe("choose_file");
    }
    expect(describeFailure(f("timeout")).actions).toEqual(["shorter", "retry"]);
    expect(describeFailure(f("timeout"), { hq: true }).actions).toEqual(["shorter", "no_hq", "retry"]);
  });

  it("our own errors never blame the file and invite feedback", () => {
    const v = describeFailure(f("internal", { message: "Error: secreto /x/y" }));
    expect(v.body).not.toContain("secreto");
    expect(v.actions).toContain("feedback");
  });

  it("connection problems say so and offer retry", () => {
    expect(describeFailure(f("network", { status: 0 }))).toMatchObject({ tone: "connection", actions: ["retry"] });
  });
});
