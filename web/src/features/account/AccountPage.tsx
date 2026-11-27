import { AVATAR_COLORS, AVATAR_EMOJI_GROUPS, AVATAR_EMOJIS, DELETE_ACCOUNT_CONFIRM, type Me, PROFILE_LIMITS } from "@contract";
import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Link } from "wouter";
import { creatorHref, ROUTES } from "@/app/routes";
import { Section } from "@/components/section";
import { Mascot } from "@/components/pixel/Mascot";
import { CheckIcon, Loader2Icon, Trash2Icon, TriangleAlertIcon, WhatsAppIcon } from "@/components/icons";
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
import { useSelfStore } from "@/features/self/selfStore";
import { TrustLink } from "@/features/self/TrustInfo";
import { LinkDialog } from "@/features/bot/LinkDialog";
import { InfiniteFooter } from "@/features/community/components/InfiniteFooter";
import { StickerCard } from "@/features/community/components/StickerCard";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useDeleteAccount, useDeleteMySticker, useLogout, useMe, useMyStickers, useUpdateMe } from "./api";
import { Avatar } from "./Avatar";
import { AVATAR_BG, AVATAR_COLOR_NAME } from "./avatarStyle";
import { ProfileHeader } from "./ProfileHeader";
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
  // One form for the whole page: the fields edit it, «Así te ven» previews it live.
  const form = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), mode: "onChange", defaultValues: profileDefaults(me) });
  return (
    <div className="mx-auto w-full max-w-6xl py-6 sm:py-10 4xl:max-w-7xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-pixel text-[10px] text-muted-foreground">MI CUENTA</p>
          <h1 className="display truncate text-3xl sm:text-4xl">Hola, {me.displayName}</h1>
        </div>
        <Button asChild variant="secondary" className="rounded-full">
          <Link href={creatorHref(me.handle)}>Ver mi perfil público</Link>
        </Button>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem] 4xl:gap-8">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:order-last">
          <LivePreview form={form} me={me} />
          <div className="hidden lg:block">
            <SessionCard me={me} />
          </div>
        </aside>
        <div className="min-w-0 space-y-6">
          <Section index="01" title="Perfil">
            <ProfileForm me={me} form={form} />
          </Section>
          <Section index="02" title="Mis stickers">
            <MyStickers />
          </Section>
          <div className="lg:hidden">
            <SessionCard me={me} />
          </div>
        </div>
      </div>
    </div>
  );
}

type ProfileFormApi = ReturnType<typeof useForm<ProfileValues>>;

/** «Así te ven»: the public header, updating as you type. */
function LivePreview({ form, me }: { form: ProfileFormApi; me: Me }) {
  const [emoji, color, displayName = "", handle = "", bio = ""] = useWatch({
    control: form.control,
    name: ["emoji", "color", "displayName", "handle", "bio"],
  });
  return (
    <section aria-label="Así te ven" className="space-y-2">
      <p className="px-1 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">Así te ven</p>
      <ProfileHeader
        compact
        displayName={displayName.trim() || me.displayName}
        handle={handle.trim().toLowerCase() || me.handle}
        bio={bio.trim()}
        avatar={`${emoji} ${color}`}
      />
    </section>
  );
}

function ProfileForm({ me, form }: { me: Me; form: ProfileFormApi }) {
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
  } = form;
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

  const field =
    "h-11 w-full rounded-xl bg-background/60 px-3 text-[16px] outline-none ring-1 ring-border transition-shadow focus-visible:ring-2 focus-visible:ring-ring sm:text-[14px] aria-[invalid=true]:ring-destructive/60";
  const cleanHandle = handle.trim().toLowerCase();
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-7">
      <fieldset className="min-w-0 space-y-4">
        <legend className="mb-1 text-[14px] font-semibold">Tu avatar</legend>
        <div className="flex min-w-0 items-center gap-4">
          <Avatar avatar={`${emoji} ${color}`} size={64} label="Vista de tu avatar" />
          <div className="min-w-0 space-y-2">
            <p className="text-[12.5px] text-muted-foreground">Color de fondo</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color de fondo">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={AVATAR_COLOR_NAME[c]}
                  title={AVATAR_COLOR_NAME[c]}
                  onClick={() => setValue("color", c, { shouldDirty: true, shouldValidate: true })}
                  className={cn(
                    "grid size-10 place-items-center rounded-full ring-offset-2 ring-offset-background transition-transform active:scale-95",
                    AVATAR_BG[c],
                    color === c && "ring-2 ring-foreground",
                  )}
                >
                  {color === c && <CheckIcon className="size-4 text-black/70" weight="bold" />}
                </button>
              ))}
            </div>
          </div>
        </div>
        <EmojiPicker
          value={emoji}
          onChange={(e) => setValue("emoji", e, { shouldDirty: true, shouldValidate: true })}
        />
      </fieldset>

      <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-[14px] font-semibold">Nombre y usuario</legend>
        <div className="space-y-1.5">
          <label htmlFor={ids.name} className="text-[13px] font-medium">
            Nombre
          </label>
          <input
            id={ids.name}
            {...register("displayName")}
            maxLength={PROFILE_LIMITS.displayName}
            autoComplete="nickname"
            className={field}
            aria-invalid={Boolean(errors.displayName)}
          />
          {errors.displayName ? (
            <p className="text-[12px] text-destructive">{errors.displayName.message}</p>
          ) : (
            <p className="text-[12px] text-muted-foreground">Así aparece en tu perfil y tus stickers.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <label htmlFor={ids.handle} className="text-[13px] font-medium">
            Usuario
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[15px] text-muted-foreground">@</span>
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
            {!errors.handle && cleanHandle && (
              <CheckIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-sound" weight="bold" />
            )}
          </div>
          {errors.handle ? (
            <p className="text-[12px] text-destructive">{errors.handle.message}</p>
          ) : (
            <p className="truncate text-[12px] text-muted-foreground">
              Tu enlace: {window.location.host}/u/<b className="font-medium text-foreground">{cleanHandle}</b>
            </p>
          )}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor={ids.bio} className="flex items-baseline justify-between text-[14px] font-semibold">
          Sobre ti
          <span
            className={cn(
              "text-[12px] font-normal tabular-nums",
              bio.length > PROFILE_LIMITS.bio * 0.9 ? "text-retro-a" : "text-muted-foreground",
            )}
          >
            {bio.length}/{PROFILE_LIMITS.bio}
          </span>
        </label>
        <textarea
          id={ids.bio}
          {...register("bio")}
          rows={3}
          maxLength={PROFILE_LIMITS.bio}
          placeholder="Hago stickers de memes y doblajes 🎙️"
          className="w-full resize-none rounded-xl bg-background/60 px-3 py-2.5 text-[16px] outline-none ring-1 ring-border focus-visible:ring-2 focus-visible:ring-ring sm:text-[14px]"
        />
        {errors.bio && <p className="text-[12px] text-destructive">{errors.bio.message}</p>}
      </div>

      {errors.root && <p className="text-[13px] text-destructive">{errors.root.message}</p>}
      {/* Phones: unsaved changes keep the buttons in reach (sticky bar). */}
      <div
        className={cn(
          "flex items-center gap-2",
          isDirty &&
            "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-30 max-sm:border-t max-sm:border-border max-sm:bg-background/95 max-sm:px-4 max-sm:pt-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:backdrop-blur",
        )}
      >
        <Button type="submit" className="rounded-full max-sm:flex-1" disabled={!isDirty || !isValid || update.isPending}>
          {update.isPending && <Loader2Icon className="size-4 animate-spin" />} Guardar cambios
        </Button>
        {isDirty && (
          <Button type="button" variant="ghost" className="rounded-full" onClick={() => reset(profileDefaults(me))}>
            Descartar
          </Button>
        )}
        {!isDirty && <span className="text-[12px] text-muted-foreground">Todo guardado.</span>}
      </div>
    </form>
  );
}

type AvatarEmoji = (typeof AVATAR_EMOJIS)[number];

/** 56 emojis in 5 groups (chips + one grid): a choice, not a wall. Opens on your current emoji's group. */
function EmojiPicker({ value, onChange }: { value: string; onChange: (e: AvatarEmoji) => void }) {
  const [group, setGroup] = useState(
    () => AVATAR_EMOJI_GROUPS.find((g) => (g.emojis as readonly string[]).includes(value))?.id ?? AVATAR_EMOJI_GROUPS[0].id,
  );
  const current = AVATAR_EMOJI_GROUPS.find((g) => g.id === group) ?? AVATAR_EMOJI_GROUPS[0];
  return (
    <div className="min-w-0 space-y-2.5">
      <p className="text-[12.5px] text-muted-foreground">Emoji</p>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Tipo de emoji">
        {AVATAR_EMOJI_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={g.id === group}
            onClick={() => setGroup(g.id)}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors",
              g.id === group ? "bg-foreground text-background" : "bg-muted/60 text-muted-foreground hover:text-foreground",
            )}
          >
            <span aria-hidden>{g.emojis[0]}</span>
            {g.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-1.5 min-[400px]:grid-cols-8 sm:max-w-md" role="radiogroup" aria-label={`Emoji · ${current.label}`}>
        {current.emojis.map((e) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={value === e}
            aria-label={e}
            onClick={() => onChange(e)}
            className={cn(
              "grid aspect-square min-h-10 place-items-center rounded-xl text-xl transition-colors",
              value === e ? "bg-foreground/15 ring-2 ring-foreground" : "bg-muted/60 hover:bg-muted",
            )}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 3xl:grid-cols-4 4xl:grid-cols-5">
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
  const linked = useSelfStore((st) => st.session !== null);
  return (
    <section aria-label="Sesión" className="space-y-4 rounded-3xl bg-muted/40 p-5 ring-1 ring-border/60">
      <div className="flex items-center gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", linked ? "bg-sound-soft text-sound" : "bg-muted text-muted-foreground")}>
          <WhatsAppIcon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">{linked ? "WhatsApp conectado" : "WhatsApp sin conectar"}</p>
          <p className="truncate text-[12.5px] text-muted-foreground">
            Número terminado en <b className="text-foreground">{me.phone.replace(/\D/g, "").slice(-4) || "—"}</b> · nunca se muestra
          </p>
        </div>
      </div>
      <TrustLink className="text-[12.5px]" />
      <div className="flex flex-col gap-2">
        <Button variant="secondary" className="w-full rounded-full" disabled={logout.isPending} onClick={() => logout.mutate()}>
          {logout.isPending && <Loader2Icon className="size-4 animate-spin" />} Cerrar sesión
        </Button>
        <DeleteAccount />
      </div>
    </section>
  );
}

function DeleteAccount() {
  const del = useDeleteAccount();
  const [typed, setTyped] = useState("");
  const id = useId();
  return (
    <Dialog onOpenChange={(o) => !o && setTyped("")}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="w-full rounded-full text-destructive">
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
