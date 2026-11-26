import { z } from "zod";
import {
  API_LIMITS,
  COLOR_LOOKS,
  type ConvertRequestFields,
  type StickerBackground,
  VOICE_EFFECTS,
} from "./contract.js";

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
  background: z
    .string()
    .regex(/^(transparent|blur|#[0-9a-fA-F]{6})$/, "Fondo no válido.")
    .transform((v) => v as StickerBackground)
    .optional(),
  cropX: z.coerce.number().min(0, "Encuadre no válido.").max(1, "Encuadre no válido.").optional(),
  cropY: z.coerce.number().min(0, "Encuadre no válido.").max(1, "Encuadre no válido.").optional(),
  cropZoom: z.coerce.number().min(1, "El zoom mínimo es 1×.").max(4, "El zoom máximo es 4×.").optional(),
  includeAudio: boolish.default(true),
  audioStartSec: z.coerce.number().min(0).default(0),
  audioDurationSec: z.coerce
    .number()
    .min(API_LIMITS.minDurationSec, `El sonido debe durar al menos ${API_LIMITS.minDurationSec} s.`)
    .max(API_LIMITS.maxDurationSec)
    .optional(),
  hq: boolish.default(false),
  includeMetadata: boolish.default(true),
  packName: z.string().max(128).optional(),
  publisher: z.string().max(128).optional(),
  emojis: z.string().max(64).optional(),
  voice: z.enum(VOICE_EFFECTS, { message: "Efecto de voz no válido." }).optional(),
  look: z.enum(COLOR_LOOKS, { message: "Filtro no válido." }).optional(),
  flip: boolish.default(false),
}) satisfies z.ZodType<ConvertRequestFields, unknown>;
