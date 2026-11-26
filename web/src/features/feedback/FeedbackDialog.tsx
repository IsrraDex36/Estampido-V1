import { FEEDBACK_KINDS, FEEDBACK_LIMITS, type FeedbackRequest } from "@contract";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useLocation } from "wouter";
import { Loader2Icon } from "@/components/icons";
import { Mascot } from "@/components/pixel/Mascot";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMe } from "@/features/account/api";
import { ApiError, clientHeaders, readJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import { feedbackDefaults, feedbackSchema, type FeedbackValues } from "./schema";

async function sendFeedback(req: FeedbackRequest): Promise<void> {
  await readJson(
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json", ...clientHeaders() },
      body: JSON.stringify(req),
    }),
  );
}

/** Short device hint for bug reports (no full user agent). */
function appHint(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : "otro";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "otro";
  return `v${__APP_VERSION__} · ${browser} · ${os} · ${window.innerWidth}px`;
}

/** «Enviar comentarios»: an idea, a problem or anything else, straight to the owner. */
export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [sent, setSent] = useState(false);
  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) setTimeout(() => setSent(false), 200); // after the close animation
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        {sent ? <Thanks onClose={() => close(false)} /> : open && <FeedbackForm onSent={() => setSent(true)} />}
      </DialogContent>
    </Dialog>
  );
}

function FeedbackForm({ onSent }: { onSent: () => void }) {
  const me = useMe().data;
  const [pathname] = useLocation();
  const ids = { message: useId(), contact: useId() };
  const send = useMutation({ mutationKey: ["feedback", "send"], mutationFn: sendFeedback, meta: { errorMessage: false } });
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isValid },
  } = useForm<FeedbackValues>({ resolver: zodResolver(feedbackSchema), mode: "onChange", defaultValues: feedbackDefaults });
  const [kind, message = ""] = useWatch({ control, name: ["kind", "message"] });

  const onSubmit = handleSubmit(async (v) => {
    try {
      await send.mutateAsync({
        kind: v.kind as FeedbackRequest["kind"],
        message: v.message.trim(),
        contact: v.contact.trim() || undefined,
        website: v.website || undefined,
        page: pathname,
        app: appHint(),
      });
      onSent();
    } catch (err) {
      setError("root", { message: err instanceof ApiError ? err.message : "No se pudo enviar. Inténtalo de nuevo." });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>Envíanos tus comentarios</DialogTitle>
        <DialogDescription>Ideas, algo que no funcionó o lo que quieras contarnos. Lo leemos todo.</DialogDescription>
      </DialogHeader>

      <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-3 gap-2">
        {FEEDBACK_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={kind === k.id}
            onClick={() => setValue("kind", k.id, { shouldValidate: true })}
            className={cn(
              "flex flex-col items-center gap-1 rounded-2xl py-3 text-[13px] font-medium ring-1 transition-colors",
              kind === k.id ? "bg-foreground text-background ring-foreground" : "ring-border hover:bg-muted/60",
            )}
          >
            <span className="text-xl" aria-hidden>
              {k.emoji}
            </span>
            {k.label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <label htmlFor={ids.message} className="flex justify-between text-[13px] font-medium">
          Mensaje
          <span className="font-normal text-muted-foreground tabular-nums">
            {message.length}/{FEEDBACK_LIMITS.maxMessage}
          </span>
        </label>
        <textarea
          id={ids.message}
          {...register("message")}
          rows={5}
          maxLength={FEEDBACK_LIMITS.maxMessage}
          placeholder={
            kind === "problema"
              ? "¿Qué pasó? ¿Qué esperabas que pasara? Si puedes, dinos en qué paso."
              : kind === "idea"
                ? "¿Qué te gustaría que hiciera Estampido?"
                : "Cuéntanos…"
          }
          className="w-full resize-none rounded-xl bg-muted/60 px-3 py-2.5 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {errors.message && <p className="text-[12px] text-destructive">{errors.message.message}</p>}
      </div>

      {me ? (
        <p className="text-[12px] text-muted-foreground">
          Lo enviamos como <b className="text-foreground">@{me.handle}</b>, por si necesitamos responderte.
        </p>
      ) : (
        <div className="space-y-1.5">
          <label htmlFor={ids.contact} className="text-[13px] font-medium">
            ¿Cómo te respondemos? <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <input
            id={ids.contact}
            {...register("contact")}
            maxLength={FEEDBACK_LIMITS.maxContact}
            placeholder="Correo o @usuario"
            className="h-11 w-full rounded-xl bg-muted/60 px-3 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}

      {/* Honeypot: off-screen and skipped by keyboard/readers; bots fill it. */}
      <input {...register("website")} tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] size-px opacity-0" />

      {errors.root && <p className="text-[13px] text-destructive">{errors.root.message}</p>}
      <Button type="submit" className="h-11 w-full rounded-full" disabled={!isValid || send.isPending}>
        {send.isPending && <Loader2Icon className="size-4 animate-spin" />} Enviar
      </Button>
    </form>
  );
}

function Thanks({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <Mascot size={88} mood="singing" />
      <DialogTitle className="display text-2xl">¡Gracias!</DialogTitle>
      <DialogDescription>Lo recibimos. Cada mensaje nos ayuda a mejorar Estampido.</DialogDescription>
      <Button className="mt-2 rounded-full" onClick={onClose}>
        Listo
      </Button>
    </div>
  );
}
