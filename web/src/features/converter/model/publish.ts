import { COMMUNITY_CATEGORIES, COMMUNITY_LIMITS, COMMUNITY_TAG_RE, type CommunityCategory } from "@contract";
import { z } from "zod";

/** "risa, gato  #perro" → ["risa","gato","perro"] (trimmed, lower-case, deduped; no cap). Pure. */
export function splitTags(raw: string): string[] {
  const tags = raw
    .split(/[,\s#]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(tags)];
}

/** Tags as sent to the API (max 3). Pure. */
export const parseTags = (raw: string): string[] => splitTags(raw).slice(0, COMMUNITY_LIMITS.maxTags);

const categoryIds = COMMUNITY_CATEGORIES.map((c) => c.id) as [CommunityCategory, ...CommunityCategory[]];

/**
 * «Publicar en la comunidad» form rules — the same limits the API enforces
 * (src/adapters/http/community/routes.ts), so the server rarely has to say no.
 * `needsRights`: the sticker has its own (non-community) audio.
 */
export function publishFormSchema(needsRights: boolean) {
  return z.object({
    category: z.enum(categoryIds, { message: "Elige una categoría." }),
    title: z
      .string()
      .trim()
      .max(COMMUNITY_LIMITS.maxTitle, `El título admite hasta ${COMMUNITY_LIMITS.maxTitle} caracteres.`),
    tags: z.string().superRefine((raw, ctx) => {
      const tags = splitTags(raw);
      if (tags.length > COMMUNITY_LIMITS.maxTags) {
        ctx.addIssue({ code: "custom", message: `Máximo ${COMMUNITY_LIMITS.maxTags} etiquetas.` });
      }
      const long = tags.find((t) => t.length > COMMUNITY_LIMITS.maxTagLength);
      if (long) {
        ctx.addIssue({
          code: "custom",
          message: `«${long.slice(0, 12)}…» es muy larga (máx. ${COMMUNITY_LIMITS.maxTagLength} caracteres).`,
        });
      }
      const bad = tags.find((t) => !COMMUNITY_TAG_RE.test(t));
      if (bad) ctx.addIssue({ code: "custom", message: `«${bad}»: usa solo letras, números, - y _.` });
    }),
    owns: needsRights
      ? z.boolean().refine((v) => v, { message: "Confirma que el audio es tuyo o que tienes permiso." })
      : z.boolean(),
  });
}

export type PublishFormValues = z.input<ReturnType<typeof publishFormSchema>>;
