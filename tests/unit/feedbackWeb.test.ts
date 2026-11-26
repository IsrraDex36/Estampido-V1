import { describe, expect, it } from "vitest";
import { feedbackDefaults, feedbackSchema } from "../../web/src/features/feedback/schema.js";

describe("feedback form (same rules as the API)", () => {
  it("accepts a normal message; rejects short, long or unknown kinds", () => {
    expect(feedbackSchema.safeParse({ ...feedbackDefaults, message: "Me encanta" }).success).toBe(true);
    for (const bad of [
      { message: "hey" },
      { message: "x".repeat(1001) },
      { kind: "queja", message: "Hola hola" },
      { contact: "x".repeat(121), message: "Hola hola" },
    ]) {
      expect(feedbackSchema.safeParse({ ...feedbackDefaults, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
