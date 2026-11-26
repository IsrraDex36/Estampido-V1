import { FEEDBACK_KINDS, FEEDBACK_LIMITS } from "@contract";
import { z } from "zod";

const kindIds = FEEDBACK_KINDS.map((k) => k.id) as [string, ...string[]];

/** Same rules as the API (it re-validates): instant feedback in the form. */
export const feedbackSchema = z.object({
  kind: z.enum(kindIds, { message: "Elige el tipo." }),
  message: z
    .string()
    .trim()
    .min(FEEDBACK_LIMITS.minMessage, "Cuéntanos un poco más.")
    .max(FEEDBACK_LIMITS.maxMessage, `Máximo ${FEEDBACK_LIMITS.maxMessage} caracteres.`),
  contact: z.string().trim().max(FEEDBACK_LIMITS.maxContact, `Máximo ${FEEDBACK_LIMITS.maxContact} caracteres.`),
  /** Honeypot (hidden from people). */
  website: z.string(),
});
export type FeedbackValues = z.input<typeof feedbackSchema>;
export const feedbackDefaults: FeedbackValues = { kind: "idea", message: "", contact: "", website: "" };
