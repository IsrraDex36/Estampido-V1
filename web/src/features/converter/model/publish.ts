import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_LIMITS,
  COMMUNITY_TAG_RE,
  type CommunityCategory,
  type PublishShare,
} from "@contract";
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

export interface PublishContext {
  /** The result has sound. */
  hasAudio: boolean;
  /** Its sound came from the community (remix). */
  fromCommunity: boolean;
}

/** Which «share» options make sense for this result. Pure. */
export function shareOptions({ hasAudio, fromCommunity }: PublishContext): Record<PublishShare, string | null> {
  return {
    both: hasAudio ? null : "Este sticker no tiene sonido.",
    sticker: null,
    sound: !hasAudio ? "Este sticker no tiene sonido." : fromCommunity ? "Ese sonido ya está en la comunidad." : null,
  };
}

export const defaultShare = (ctx: PublishContext): PublishShare => (ctx.hasAudio ? "both" : "sticker");

/** Publishing your own sound needs the rights checkbox; silent or community sounds don't. Pure. */
export const needsAudioRights = (share: PublishShare, { hasAudio, fromCommunity }: PublishContext): boolean =>
  hasAudio && !fromCommunity && share !== "sticker";

/**
 * «Publicar en la comunidad» form rules — the same limits the API enforces
 * (src/adapters/http/community/routes.ts), so the server rarely has to say no.
 */
export function publishFormSchema(ctx: PublishContext) {
  return z
    .object({
      share: z.enum(["both", "sticker", "sound"]),
      category: z.enum(categoryIds, { message: "Elige una categoría." }),
      title: z
        .string()
        .trim()
        .max(COMMUNITY_LIMITS.maxTitle, `El título admite hasta ${COMMUNITY_LIMITS.maxTitle} caracteres.`),
      tags: z.string().superRefine((raw, issue) => {
        const tags = splitTags(raw);
        if (tags.length > COMMUNITY_LIMITS.maxTags) {
          issue.addIssue({ code: "custom", message: `Máximo ${COMMUNITY_LIMITS.maxTags} etiquetas.` });
        }
        const long = tags.find((t) => t.length > COMMUNITY_LIMITS.maxTagLength);
        if (long) {
          issue.addIssue({
            code: "custom",
            message: `«${long.slice(0, 12)}…» es muy larga (máx. ${COMMUNITY_LIMITS.maxTagLength} caracteres).`,
          });
        }
        const bad = tags.find((t) => !COMMUNITY_TAG_RE.test(t));
        if (bad) issue.addIssue({ code: "custom", message: `«${bad}»: usa solo letras, números, - y _.` });
      }),
      owns: z.boolean(),
    })
    .superRefine((v, issue) => {
      const blocked = shareOptions(ctx)[v.share];
      if (blocked) issue.addIssue({ code: "custom", path: ["share"], message: blocked });
      if (needsAudioRights(v.share, ctx) && !v.owns) {
        issue.addIssue({ code: "custom", path: ["owns"], message: "Confirma que el audio es tuyo o que tienes permiso." });
      }
    });
}

export type PublishFormValues = z.input<ReturnType<typeof publishFormSchema>>;
