import { AVATAR_COLORS, AVATAR_EMOJIS, DELETE_ACCOUNT_CONFIRM, type Me, PROFILE_LIMITS } from "@contract";
import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Link } from "wouter";
import { creatorHref, ROUTES } from "@/app/routes";
import { Section } from "@/components/section";
import { Mascot } from "@/components/pixel/Mascot";
import { Loader2Icon, Trash2Icon, TriangleAlertIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useBotStatus } from "@/features/bot/api";
import { TrustLink } from "@/features/self/TrustInfo";
import { LinkDialog } from "@/features/bot/LinkDialog";
import { InfiniteFooter } from "@/features/community/components/InfiniteFooter";
import { StickerCard } from "@/features/community/components/StickerCard";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useDeleteAccount, useDeleteMySticker, useLogout, useMe, useMyStickers, useUpdateMe } from "./api";
import { Avatar } from "./Avatar";
import { AVATAR_BG } from "./avatarStyle";
import { profileDefaults, profilePatch, profileSchema, type ProfileValues } from "./profileForm";

/** Signed-in user's place: profile, what I published, session, delete account. */
export default function AccountPage() {
  const me = useMe();
  if (me.isPending) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 py-10">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }
  if (!me.data) return <SignedOut />;
  return <Account me={me.data} />;
}

function SignedOut() {
  const [open, setOpen] = useState(false);
  const bot = useBotStatus();
  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <Mascot size={88} />
      <h1 className="display text-3xl">Entra con tu WhatsApp</h1>
      <p className="text-[14px] text-muted-foreground">
        Sin contraseñas ni correo: vinculas tu WhatsApp (con un código o QR) y listo. Tendrás tu perfil de creador, tus favoritos en
        todos tus dispositivos y podrás publicar en la comunidad.
      </p>
      <Button className="h-11 rounded-full px-6" disabled={bot?.available === false} onClick={() => setOpen(true)}>
        Entrar con WhatsApp
      </Button>
      {bot?.available === false && (
        <p className="text-[12px] text-muted-foreground">WhatsApp está en pausa ahora; vuelve en un rato.</p>
      )}
      <TrustLink />
      <LinkDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function Account({ me }: { me: Me }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 py-8 sm:py-10">
      <header className="flex items-center gap-4">
        <Avatar avatar={me.avatar} size={56} />
        <div className="min-w-0">
          <p className="font-pixel text-[10px] text-muted-foreground">MI CUENTA</p>
          <h1 className="display truncate text-3xl">{me.displayName}</h1>
          <Link href={creatorHref(me.handle)} className="text-[13px] text-muted-foreground underline-offset-4 hover:underline">
            Ver mi perfil público (@{me.handle})
          </Link>
        </div>
      </header>
      <Section index="01" title="Perfil">
        <ProfileForm me={me} />
      </Section>
      <Section index="02" title="Mis stickers">
        <MyStickers />
      </Section>
      <Section index="03" title="Sesión">
        <SessionCard me={me} />
      </Section>
    </div>
  );
}

function ProfileForm({ me }: { me: Me }) {
  const update = useUpdateMe();
  const ids = { handle: useId(), name: useId(), bio: useId() };
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    reset,
    formState: { errors, isDirty, isValid },
  } = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), mode: "onChange", defaultValues: profileDefaults(me) });
  const [emoji, color, bio = "", handle = ""] = useWatch({ control, name: ["emoji", "color", "bio", "handle"] });

  const onSubmit = handleSubmit(async (values) => {
    const patch = profilePatch(me, profileSchema.parse(values));
    if (Object.keys(patch).length === 0) return;
    try {
      const next = await update.mutateAsync(patch);
      reset(profileDefaults(next));
      notify.success("Perfil guardado");
    } catch (err) {
      if (err instanceof ApiError && err.code === "handle_taken") setError("handle", { message: err.message });
      else setError("root", { message: err instanceof ApiError ? err.message : "No se pudo guardar." });
    }
  });

  const field = "h-11 w-full rounded-xl bg-background/60 px-3 text-[14px] outline-none ring-1 ring-border focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="text-[13px] font-medium">Avatar</legend>
        <div className="flex items-center gap-4">
          <Avatar avatar={`${emoji} ${color}`} size={64} />
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                onClick={() => setValue("color", c, { shouldDirty: true, shouldValidate: true })}
                className={cn("size-8 rounded-full ring-offset-2 ring-offset-background", AVATAR_BG[c], color === c && "ring-2 ring-foreground")}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-8 gap-1.5 sm:max-w-md" role="radiogroup" aria-label="Emoji">
          {AVATAR_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={emoji === e}
              onClick={() => setValue("emoji", e, { shouldDirty: true, shouldValidate: true })}
              className={cn(
                "grid aspect-square place-items-center rounded-xl text-xl transition-colors",
                emoji === e ? "bg-foreground/15 ring-2 ring-foreground" : "bg-muted/60 hover:bg-muted",
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={ids.name} className="text-[13px] font-medium">
            Nombre
          </label>
          <input id={ids.name} {...register("displayName")} maxLength={PROFILE_LIMITS.displayName} className={field} />
          {errors.displayName && <p className="text-[12px] text-destructive">{errors.displayName.message}</p>}
        </div>
        <div className="space-y-1.5">
          <label htmlFor={ids.handle} className="text-[13px] font-medium">
            Usuario
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px] text-muted-foreground">@</span>
            <input
              id={ids.handle}
              {...register("handle")}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={20}
              className={cn(field, "pl-7")}
              aria-invalid={Boolean(errors.handle)}
            />
          </div>
          {errors.handle ? (
            <p className="text-[12px] text-destructive">{errors.handle.message}</p>
          ) : (
            <p className="truncate text-[12px] text-muted-foreground">{window.location.host}/u/{handle.trim().toLowerCase()}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={ids.bio} className="flex justify-between text-[13px] font-medium">
          Sobre ti <span className="font-normal text-muted-foreground tabular-nums">{bio.length}/{PROFILE_LIMITS.bio}</span>
        </label>
        <textarea
          id={ids.bio}
          {...register("bio")}
          rows={3}
          maxLength={PROFILE_LIMITS.bio}
          placeholder="Hago stickers de memes y doblajes 🎙️"
          className="w-full resize-none rounded-xl bg-background/60 px-3 py-2.5 text-[14px] outline-none ring-1 ring-border focus-visible:ring-2 focus-visible:ring-ring"
        />
        {errors.bio && <p className="text-[12px] text-destructive">{errors.bio.message}</p>}
      </div>

      {errors.root && <p className="text-[13px] text-destructive">{errors.root.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" className="rounded-full" disabled={!isDirty || !isValid || update.isPending}>
          {update.isPending && <Loader2Icon className="size-4 animate-spin" />} Guardar cambios
        </Button>
        {isDirty && (
          <Button type="button" variant="ghost" className="rounded-full" onClick={() => reset(profileDefaults(me))}>
            Descartar
          </Button>
        )}
      </div>
    </form>
  );
}

function MyStickers() {
  const list = useMyStickers(true);
  const remove = useDeleteMySticker();
  const [armed, setArmed] = useState<string | null>(null);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  if (list.isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="aspect-[3/4] rounded-3xl" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-stage px-6 py-10 text-center">
        <p className="text-[14px] text-muted-foreground">Aún no publicas nada. Lo que publiques aparecerá aquí y en tu perfil.</p>
        <Button asChild className="rounded-full">
          <Link href={ROUTES.create}>Crear un sticker</Link>
        </Button>
      </div>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((s) => (
          <div key={s.id} className="relative">
            <StickerCard sticker={s} />
            {!s.listed && (
              <span className="pointer-events-none absolute top-2.5 right-2.5 rounded-full bg-card/90 px-2 py-0.5 text-[11px] text-muted-foreground">
                Solo sonido
              </span>
            )}
            <div className="mt-1.5 flex justify-end">
              {armed === s.id ? (
                <Button
                  size="sm"
                  variant="destructive"
                  className="rounded-full"
                  autoFocus
                  onBlur={() => setArmed(null)}
                  onClick={() => {
                    setArmed(null);
                    remove.mutate(s.id);
                  }}
                >
                  ¿Borrar «{s.title}»?
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full text-muted-foreground hover:text-destructive"
                  disabled={remove.isPending && remove.variables === s.id}
                  onClick={() => setArmed(s.id)}
                >
                  <Trash2Icon className="size-4" /> Borrar
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <InfiniteFooter
        hasNext={Boolean(list.hasNextPage)}
        loading={list.isFetchingNextPage}
        error={list.isError}
        onMore={() => void list.fetchNextPage()}
        endLabel="Eso es todo."
      />
    </>
  );
}

function SessionCard({ me }: { me: Me }) {
  const logout = useLogout();
  return (
    <div className="space-y-4">
      <p className="text-[14px] text-muted-foreground">
        Entraste con el WhatsApp <b className="text-foreground">{me.phone}</b>. Tu número nunca se muestra en tu perfil.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="rounded-full" disabled={logout.isPending} onClick={() => logout.mutate()}>
          Cerrar sesión en este navegador
        </Button>
        <DeleteAccount />
      </div>
    </div>
  );
}

function DeleteAccount() {
  const del = useDeleteAccount();
  const [typed, setTyped] = useState("");
  const id = useId();
  return (
    <Dialog onOpenChange={(o) => !o && setTyped("")}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="rounded-full text-destructive">
          Borrar mi cuenta
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlertIcon className="size-5 text-destructive" /> Borrar mi cuenta
          </DialogTitle>
          <DialogDescription>
            Se borran tu perfil, <b>todos los stickers y sonidos que publicaste</b>, tus favoritos y tus sesiones en todos tus
            dispositivos. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed === DELETE_ACCOUNT_CONFIRM) del.mutate();
          }}
        >
          <label htmlFor={id} className="block text-[13px] text-muted-foreground">
            Escribe <b className="font-mono text-foreground">{DELETE_ACCOUNT_CONFIRM}</b> para confirmar
          </label>
          <input
            id={id}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className="h-11 w-full rounded-xl bg-muted/60 px-4 font-mono text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" className="rounded-full">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" className="rounded-full" disabled={typed !== DELETE_ACCOUNT_CONFIRM || del.isPending}>
              {del.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />} Borrar para
              siempre
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
