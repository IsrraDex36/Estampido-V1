import { describe, expect, it } from "vitest";
import { convertFieldsSchema } from "../../src/adapters/http/schema.js";

describe("convert fields: background", () => {
  it("accepts transparent, blur and #rrggbb; omitted stays undefined", () => {
    for (const background of ["transparent", "blur", "#FF3366", "#00aa11"]) {
      expect(convertFieldsSchema.parse({ background }).background).toBe(background);
    }
    expect(convertFieldsSchema.parse({}).background).toBeUndefined();
  });

  it("rejects anything else (no filter injection)", () => {
    for (const background of ["red", "#fff", "#ff336", "blur;drawtext", "#ff3366:x", ""]) {
      expect(convertFieldsSchema.safeParse({ background }).success).toBe(false);
    }
  });
});
