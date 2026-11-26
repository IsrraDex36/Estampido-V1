import { COMMUNITY_CATEGORIES, COMMUNITY_LIMITS, type CommunityCategory, type ConvertResponse } from "@contract";
import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useLocation } from "wouter";
import { ROUTES } from "@/app/routes";
import { CheckIcon, CircleAlertIcon, CommunityIcon, Loader2Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LinkDialog } from "@/features/bot/LinkDialog";
import { useLinkGate } from "@/features/bot/useLinkGate";
import { usePublish } from "@/features/community/api/mutations";
import { ApiError } from "@/lib/api";
import { useFavorites } from "@/features/community/store/favoritesStore";
import { cn } from "@/lib/utils";
import { type PublishFormValues, parseTags, publishFormSchema, splitTags } from "../../model/publish";
import { useConverterStore } from "../../store/converterStore";
import { notify } from "@/lib/notify";
import { ActionTile } from "./ActionTile";

/** «Publicar»: share this result with the community (category, title, tags, audio rights). */
export function PublishButton({ result }: { result: ConvertResponse }) {
  const [open, setOpen] = useState(false);
  const [publishedId, setPublishedId] = useState<{ result: string; sticker: string } | null>(null);
  const [, navigate] = useLocation();
  const done = publishedId?.result === result.id;

  if (done) {
    return (
      <ActionTile
        done
        icon={<CheckIcon weight="bold" />}
        title="Publicado"
        hint="Ver"
        onClick={() => navigate(ROUTES.community)}
      />
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <ActionTile icon={<CommunityIcon weight="duotone" />} title="Publicar" hint="Comunidad" />
      </DialogTrigger>
      <DialogContent>
        {open && (
          <PublishForm
            result={result}
            onDone={(stickerId) => {
              setPublishedId({ result: result.id, sticker: stickerId });
              setOpen(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PublishForm({ result, onDone }: { result: ConvertResponse; onDone: (stickerId: string) => void }) {
  const soundOrigin = useConverterStore((s) => s.resultSoundOrigin);
  const addPublished = useFavorites((s) => s.addPublished);
  const publish = usePublish();
  const [, navigate] = useLocation();
  const ids = { title: useId(), tags: useId(), owns: useId(), category: useId() };
  const needsRights = result.audio !== null && !soundOrigin;
  const { gate, dialog } = useLinkGate();

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isValid, isSubmitting },
  } = useForm<PublishFormValues>({
    resolver: zodResolver(publishFormSchema(needsRights)),
    mode: "onChange",
    defaultValues: { category: undefined, title: "", tags: "", owns: false },
  });
  const [title = "", tagsRaw = ""] = useWatch({ control, name: ["title", "tags"] });
  const tagPreview = splitTags(tagsRaw).slice(0, COMMUNITY_LIMITS.maxTags);

  const doPublish = async (values: PublishFormValues) => {
    try {
      const sticker = await publish.mutateAsync({
        resultId: result.id,
        category: values.category as CommunityCategory,
        title: values.title.trim() || undefined,
        tags: parseTags(values.tags),
        ownsAudio: needsRights ? values.owns : undefined,
        soundOrigin,
      });
      addPublished(sticker);
      onDone(sticker.id);
      notify.success("¡Publicado en la comunidad!", {
        action: { label: "Ver", onClick: () => navigate(ROUTES.community) },
      });
    } catch (err) {
      // Public server: publishing needs a linked WhatsApp → link, then publish automatically.
      if (err instanceof ApiError && err.code === "link_required") gate(() => void doPublish(values));
      // The API re-validates: show its message on the form (it stays open to retry).
      else if (err instanceof ApiError && err.status === 400) setError("root", { message: err.message });
      else notify.error(err, { fallback: "No se pudo publicar." });
    }
  };

  const busy = isSubmitting || publish.isPending;

  return (
    <form onSubmit={handleSubmit(doPublish)} noValidate className="flex min-h-0 flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Publicar en la comunidad</DialogTitle>
        <DialogDescription>Otros podrán escucharlo, guardarlo y usar su sonido en sus propios clips.</DialogDescription>
      </DialogHeader>

      <div className="-mx-1 min-h-0 space-y-5 overflow-y-auto px-1">
        <fieldset aria-describedby={errors.category ? ids.category : undefined}>
          <legend className="mb-2 text-[13px] font-medium">
            Categoría <span className="text-muted-foreground">(obligatoria)</span>
          </legend>
          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Categoría">
                {COMMUNITY_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={field.value === c.id}
                    aria-pressed={field.value === c.id}
                    onClick={() => field.onChange(c.id)}
                    onBlur={field.onBlur}
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-3 py-1 text-[13px] transition-colors",
                      field.value === c.id
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                    )}
                  >
                    <span aria-hidden>{c.emoji}</span>
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          />
          <FieldError id={ids.category} message={errors.category?.message} />
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={ids.title} className="flex items-baseline justify-between text-[13px] font-medium">
              Título
              <span
                className={cn(
                  "font-normal tabular-nums",
                  title.trim().length > COMMUNITY_LIMITS.maxTitle ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {title.trim().length}/{COMMUNITY_LIMITS.maxTitle}
              </span>
            </label>
            <input
              id={ids.title}
              {...register("title")}
              placeholder="Opcional"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? `${ids.title}-err` : undefined}
              className={cn(inputClass, errors.title && "ring-2 ring-destructive/60")}
            />
            <FieldError id={`${ids.title}-err`} message={errors.title?.message} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.tags} className="flex items-baseline justify-between text-[13px] font-medium">
              Etiquetas
              <span className="font-normal text-muted-foreground">máx. {COMMUNITY_LIMITS.maxTags}</span>
            </label>
            <input
              id={ids.tags}
              {...register("tags")}
              placeholder="risa, gato"
              autoCapitalize="none"
              aria-invalid={Boolean(errors.tags)}
              aria-describedby={errors.tags ? `${ids.tags}-err` : undefined}
              className={cn(inputClass, errors.tags && "ring-2 ring-destructive/60")}
            />
            {errors.tags ? (
              <FieldError id={`${ids.tags}-err`} message={errors.tags.message} />
            ) : (
              tagPreview.length > 0 && (
                <ul className="flex flex-wrap gap-1" aria-label="Etiquetas que se publicarán">
                  {tagPreview.map((t) => (
                    <li key={t} className="rounded-full bg-muted px-2 py-0.5 text-[12px] text-muted-foreground">
                      #{t}
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        </div>

        {needsRights ? (
          <div className="space-y-1.5">
            <label htmlFor={ids.owns} className="flex items-start gap-3 rounded-2xl bg-muted/50 p-3 text-[13px]">
              <input
                id={ids.owns}
                type="checkbox"
                {...register("owns")}
                aria-invalid={Boolean(errors.owns)}
                aria-describedby={errors.owns ? `${ids.owns}-err` : undefined}
                className="mt-0.5 size-4 accent-[var(--sound)]"
              />
              <span>
                El audio es mío o tengo permiso para compartirlo.
                <span className="block text-muted-foreground">Sin esto no se puede publicar un sticker con sonido.</span>
              </span>
            </label>
            <FieldError id={`${ids.owns}-err`} message={errors.owns?.message} />
          </div>
        ) : soundOrigin ? (
          <p className="rounded-2xl bg-muted/50 p-3 text-[13px] text-muted-foreground">
            Usa un sonido de la comunidad: quedará enlazado a su origen.
          </p>
        ) : null}

        {errors.root?.message && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl bg-destructive/10 p-3 text-[13px] text-destructive">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
            {errors.root.message}
          </p>
        )}
      </div>

      <Button type="submit" className="h-11 rounded-full font-semibold" disabled={!isValid || busy}>
        {busy && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
        {busy ? "Publicando…" : "Publicar"}
      </Button>
      <LinkDialog {...dialog} />
    </form>
  );
}

const inputClass =
  "h-10 w-full rounded-xl bg-muted/60 px-3 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-[12px] text-destructive">
      {message}
    </p>
  );
}
