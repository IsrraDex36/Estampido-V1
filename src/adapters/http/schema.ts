import { z } from "zod";
import { API_LIMITS, type ConvertRequestFields } from "./contract.js";

const boolish = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0", "on", "off"])])
  .transform((v) => v === true || v === "true" || v === "1" || v === "on");

export const convertFieldsSchema = z.object({
  startSec: z.coerce.number().min(0).default(0),
  // Per-kind maximum (5 s video/GIF, 10 s image) is enforced by the pipeline.
  durationSec: z.coerce
    .number()
    .min(API_LIMITS.minDurationSec, `La duración mínima es ${API_LIMITS.minDurationSec} s.`)
    .max(API_LIMITS.maxDurationSec, `La duración máxima es ${API_LIMITS.maxDurationSec} s.`)
    .optional(),
  fit: z.enum(["pad", "crop"]).default("pad"),
  includeAudio: boolish.default(true),
  audioStartSec: z.coerce.number().min(0).default(0),
  hq: boolish.default(false),
  includeMetadata: boolish.default(true),
  packName: z.string().max(128).optional(),
  publisher: z.string().max(128).optional(),
  emojis: z.string().max(64).optional(),
}) satisfies z.ZodType<ConvertRequestFields, unknown>;
