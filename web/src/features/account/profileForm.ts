import { AVATAR_COLORS, AVATAR_EMOJIS, HANDLE_RE, type Me, type MeUpdate, PROFILE_LIMITS } from "@contract";
import { z } from "zod";

/** Same rules as the API (it re-validates): instant feedback in the form. */
export const profileSchema = z.object({
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(HANDLE_RE, "De 3 a 20: letras minúsculas, números o _ (sin espacios ni acentos)."),
  displayName: z
    .string()
    .trim()
    .min(1, "Escribe tu nombre.")
    .max(PROFILE_LIMITS.displayName, `Máximo ${PROFILE_LIMITS.displayName} caracteres.`),
  bio: z.string().trim().max(PROFILE_LIMITS.bio, `Máximo ${PROFILE_LIMITS.bio} caracteres.`),
  emoji: z.enum(AVATAR_EMOJIS),
  color: z.enum(AVATAR_COLORS),
});
export type ProfileValues = z.input<typeof profileSchema>;

export function profileDefaults(me: Me): ProfileValues {
  const [emoji, color] = me.avatar.split(" ");
  return {
    handle: me.handle,
    displayName: me.displayName,
    bio: me.bio,
    emoji: ((AVATAR_EMOJIS as readonly string[]).includes(emoji ?? "") ? emoji : "🐸") as ProfileValues["emoji"],
    color: ((AVATAR_COLORS as readonly string[]).includes(color ?? "") ? color : "lime") as ProfileValues["color"],
  };
}

/** Only what changed (PATCH semantics). Pure. */
export function profilePatch(me: Me, v: z.output<typeof profileSchema>): MeUpdate {
  const patch: MeUpdate = {};
  if (v.handle !== me.handle) patch.handle = v.handle;
  if (v.displayName !== me.displayName) patch.displayName = v.displayName;
  if (v.bio !== me.bio) patch.bio = v.bio;
  const avatar = `${v.emoji} ${v.color}`;
  if (avatar !== me.avatar) patch.avatar = avatar;
  return patch;
}
