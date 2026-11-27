import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckIcon, CircleCheckIcon, CopyIcon, Loader2Icon } from "@/components/icons";
import { Mascot } from "@/components/pixel/Mascot";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { type LinkStatus, linkStatus, startLink } from "./endpoints";
import { COUNTRIES, composePhone, countryByIso, guessCountry, phoneHint } from "./phone";
import { useSelfStore } from "./selfStore";
import { TrustLink, TrustPromises } from "./TrustInfo";

type Step =
  | { kind: "intro" }
  | { kind: "linking"; id: string; status: LinkStatus; startedAt: number }
  | { kind: "error"; message: string }
  /** Linked: a short «¡Listo!» before closing, so the moment is clear. */
  | { kind: "done"; handle: string | null };

/**
 * Link THIS person's WhatsApp as a device (like WhatsApp Web) so stickers go
 * to their own «Tú» chat. Clear consent first: what happens, what we never
 * keep, how to undo it.
 */
export function SelfLinkDialog() {
  const { open, after } = useSelfStore((s) => s.dialog);
  const close = useSelfStore((s) => s.closeDialog);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-md">{open && <Body after={after} onDone={close} />}</DialogContent>
    </Dialog>
  );
}

/** Event-time clock (kept out of render code). */
const clock = () => Date.now();

const COUNTRY_KEY = "estampido-wa-country";
/** Last country used here, else a guess from the browser's language and time zone. */
function initialCountry(): string {
  try {
    const saved = localStorage.getItem(COUNTRY_KEY);
    if (saved && COUNTRIES.some((c) => c.iso === saved)) return saved;
  } catch {
    // storage blocked
  }
  return guessCountry(
    typeof navigator === "undefined" ? undefined : navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
}

const onPhone = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

function Body({ after, onDone }: { after?: () => void; onDone: () => void }) {
  const setSession = useSelfStore((s) => s.setSession);
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>({ kind: "intro" });
  const [iso, setIso] = useState(initialCountry);
  const [phone, setPhone] = useState("");
  const country = countryByIso(iso);
  const check = composePhone(country, phone);
  const chooseCountry = (next: string) => {
    setIso(next);
    try {
      localStorage.setItem(COUNTRY_KEY, next);
    } catch {
      // private mode: we'll guess again next time
    }
  };
  const [busy, setBusy] = useState(false);

  const begin = async (withPhone: boolean) => {
    setBusy(true);
    try {
      const id = await startLink(withPhone && check.ok ? check.digits : undefined);
      setStep({ kind: "linking", id, status: { state: "waiting" }, startedAt: clock() });
    } catch (err) {
      setStep({ kind: "error", message: err instanceof ApiError ? err.message : "No se pudo empezar. Intenta otra vez." });
    } finally {
      setBusy(false);
    }
  };

  // Follow the linking live.
  const linkId = step.kind === "linking" ? step.id : null;
  useEffect(() => {
    if (!linkId) return;
    let alive = true;
    const tick = async () => {
      try {
        const status = await linkStatus(linkId);
        if (!alive) return;
        if (status.state === "linked") {
          setSession(status.session);
          if (status.me) qc.setQueryData(queryKeys.account.me, status.me); // linking = signed in
          setStep({ kind: "done", handle: status.me?.handle ?? null });
          return;
        }
        if (status.state === "failed") {
          setStep({ kind: "error", message: status.reason });
          return;
        }
        setStep((prev) => ({
          kind: "linking",
          id: linkId,
          status,
          startedAt: prev.kind === "linking" ? prev.startedAt : Date.now(),
        }));
      } catch {
        if (alive) setStep({ kind: "error", message: "La vinculación venció. Intenta otra vez." });
        return;
      }
      if (alive) setTimeout(() => void tick(), 1500);
    };
    const t = setTimeout(() => void tick(), 800);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [linkId, setSession, onDone, after, qc]);

  // «¡Listo!» for a moment, then close and run what was pending (e.g. the send).
  const done = step.kind === "done";
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => {
      onDone();
      after?.();
    }, 1400);
    return () => clearTimeout(t);
  }, [done, onDone, after]);

  if (step.kind === "done") return <Linked handle={step.handle} />;

  if (step.kind === "intro") {
    return (
      <>
        <DialogHeader className="flex flex-col items-center px-8 text-center">
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-stage">
            <Mascot size={56} mood="singing" />
          </div>
          <DialogTitle className="text-[20px]">Conecta tu WhatsApp</DialogTitle>
          <DialogDescription>
            Así te mandamos los stickers a tu chat «Tú», con sonido. También es tu cuenta para guardar favoritos y
            publicar.
          </DialogDescription>
        </DialogHeader>
        <TrustPromises />
        <div className="flex justify-center">
          <TrustLink />
        </div>
        <div className="space-y-2">
          <div className="space-y-1">
            <label htmlFor="wa-country" className="block text-[13px] font-medium">
              Tu número de WhatsApp
            </label>
            <div className="flex gap-2">
              <select
                id="wa-country"
                aria-label="País"
                value={iso}
                onChange={(e) => chooseCountry(e.target.value)}
                className="h-11 w-[8.75rem] shrink-0 rounded-xl bg-muted/60 px-2 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.iso} value={c.iso}>
                    {c.flag} {c.name} +{c.dial}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Número sin el +${country.dial}`}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                autoComplete="tel-national"
                placeholder={country.example}
                aria-invalid={phoneHint(country, check) ? true : undefined}
                className="h-11 min-w-0 flex-1 rounded-xl bg-muted/60 px-3 text-[16px] tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid]:ring-2 aria-[invalid]:ring-destructive/50"
              />
            </div>
            <span className="block text-[11px] text-muted-foreground" aria-live="polite">
              {phoneHint(country, check) ??
                (check.ok
                  ? `Pediremos el código para +${country.dial} ${check.national}. No se guarda.`
                  : `${country.flag} +${country.dial} y tu número (${country.lengths.join(" u ")} dígitos). Solo para pedir el código; no se guarda.`)}
            </span>
          </div>
          <Button className="h-12 w-full rounded-full font-semibold" disabled={busy || !check.ok} onClick={() => void begin(true)}>
            {busy && <Loader2Icon className="size-4 animate-spin" />} Obtener código
          </Button>
          {!onPhone() && (
            <Button variant="ghost" className="w-full rounded-full" disabled={busy} onClick={() => void begin(false)}>
              Mejor con QR (escaneo desde el celular)
            </Button>
          )}
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          Conexión no oficial, como la de WhatsApp Web. Solo te mandas mensajes a ti, por eso el riesgo es muy bajo.
        </p>
      </>
    );
  }

  if (step.kind === "error") {
    return (
      <div className="space-y-4 text-center">
        <DialogHeader className="items-center text-center">
          <DialogTitle>No se pudo vincular</DialogTitle>
          <DialogDescription>{step.message}</DialogDescription>
        </DialogHeader>
        <Button className="rounded-full" onClick={() => setStep({ kind: "intro" })}>
          Intentar otra vez
        </Button>
      </div>
    );
  }

  const s = step.status;
  if (s.state === "pairing") return <Pairing step={s.step} />;
  return <Linking status={s} startedAt={step.startedAt} onRestart={() => setStep({ kind: "intro" })} />;
}

/** The waiting screen: numbered steps for code (phone) or QR (computer), live status. */
function Linking({ status: s, startedAt, onRestart }: { status: LinkStatus; startedAt: number; onRestart: () => void }) {
  const [copied, setCopied] = useState(false);
  // WhatsApp keeps a pairing code alive for ~2 minutes: show it counting down.
  const [now, setNow] = useState(() => Date.now());
  const showing = s.state === "code" || s.state === "qr";
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, 120 - Math.floor((now - startedAt) / 1000));
  const steps =
    s.state === "qr"
      ? [
          "Abre WhatsApp en tu celular.",
          "Toca ⋮ (Android) o Configuración (iPhone) → Dispositivos vinculados.",
          "Toca «Vincular un dispositivo» y apunta la cámara a este código.",
        ]
      : [
          "Copia el código y abre WhatsApp.",
          "Toca ⋮ (Android) o Configuración (iPhone) → Dispositivos vinculados → Vincular un dispositivo.",
          "Elige «Vincular con número de teléfono» y escribe el código.",
          "Regresa aquí: se conecta solo. En tu lista aparecerá como «Chrome (Mac OS)».",
        ];
  return (
    <div className="space-y-4">
      <DialogHeader className="items-center text-center">
        <DialogTitle>{s.state === "qr" ? "Escanea con tu WhatsApp" : "Tu código para WhatsApp"}</DialogTitle>
        <DialogDescription>Así Estampido queda como dispositivo vinculado, solo para mandarte a ti.</DialogDescription>
      </DialogHeader>
      {s.state === "qr" ? (
        <div className="mx-auto w-60 rounded-3xl bg-white p-3">
          <img src={`data:image/svg+xml;utf8,${encodeURIComponent(s.qrSvg)}`} alt="Código QR para vincular" className="aspect-square w-full" />
        </div>
      ) : s.state === "code" ? (
        <div className="space-y-2 rounded-2xl bg-stage px-4 py-4 text-center">
          <p className="font-mono text-4xl font-semibold tracking-[0.15em]" aria-live="polite">
            {s.code}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full"
            onClick={() =>
              void navigator.clipboard?.writeText(s.code.replace("-", "")).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
            }
          >
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            {copied ? "Copiado" : "Copiar código"}
          </Button>
        </div>
      ) : (
        <div className="grid h-40 place-items-center content-center gap-2 text-[13px] text-muted-foreground">
          <Loader2Icon className="mx-auto size-6 animate-spin" />
          Pidiendo tu código a WhatsApp…
        </div>
      )}
      {(s.state === "qr" || s.state === "code") && (
        <ol className="space-y-2 text-[13px]">
          {steps.map((t, i) => (
            <li key={t} className="flex gap-2.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[12px] font-semibold text-background">
                {i + 1}
              </span>
              <span className="pt-0.5 text-muted-foreground">{t}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="flex items-center justify-center gap-2 text-[13px] text-muted-foreground" role="status">
        {s.state === "linked" ? <CircleCheckIcon className="size-4 text-sound" /> : <Loader2Icon className="size-4 animate-spin" />}
        {showing && left === 0
          ? "El código ya pudo vencer: pide otro."
          : `Esperando a tu WhatsApp… vence en ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}
      </p>
      <button type="button" className="mx-auto block text-[12px] text-muted-foreground underline-offset-4 hover:underline" onClick={onRestart}>
        Pedir otro código / cambiar de método
      </button>
    </div>
  );
}

/**
 * After the phone accepts: WhatsApp still takes a few seconds (sometimes ~20)
 * to finish the first login. Show real progress so it never looks frozen.
 */
function Pairing({ step }: { step: "connecting" | "preparing" }) {
  const [since] = useState(clock);
  const [now, setNow] = useState(clock);
  useEffect(() => {
    const id = setInterval(() => setNow(clock()), 1000);
    return () => clearInterval(id);
  }, []);
  const slow = now - since > 12_000;
  const rows: { label: string; state: "done" | "active" | "todo" }[] = [
    { label: "WhatsApp aceptó la vinculación", state: "done" },
    { label: "Conectando de forma segura", state: step === "connecting" ? "active" : "done" },
    { label: "Preparando tu cuenta y tu chat «Tú»", state: step === "preparing" ? "active" : "todo" },
  ];
  return (
    <div className="space-y-5">
      <DialogHeader className="items-center text-center">
        <div className="mx-auto grid size-20 place-items-center rounded-full bg-stage">
          <Mascot size={56} mood="singing" />
        </div>
        <DialogTitle>Vinculando tu WhatsApp…</DialogTitle>
        <DialogDescription>Tarda unos segundos. No cierres esta ventana.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 rounded-2xl bg-stage p-4" role="status" aria-live="polite">
        <ol className="space-y-2.5 text-[14px]">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2.5">
              {r.state === "done" ? (
                <CircleCheckIcon className="size-5 shrink-0 text-sound" />
              ) : r.state === "active" ? (
                <Loader2Icon className="size-5 shrink-0 animate-spin text-foreground" />
              ) : (
                <span className="size-5 shrink-0 rounded-full border-2 border-muted-foreground/30" />
              )}
              <span className={r.state === "todo" ? "text-muted-foreground" : "font-medium"}>{r.label}</span>
            </li>
          ))}
        </ol>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-sound transition-[width] duration-700 ease-out"
            style={{ width: step === "connecting" ? "45%" : "85%" }}
          />
        </div>
      </div>
      <p className="text-center text-[12px] text-muted-foreground">
        {slow
          ? "Casi listo: WhatsApp está terminando de sincronizar. Deja el celular con internet."
          : "Puedes ver «Chrome (Mac OS)» apareciendo en tus Dispositivos vinculados."}
      </p>
    </div>
  );
}

/** The moment it's done: clear confirmation (then the dialog closes by itself). */
function Linked({ handle }: { handle: string | null }) {
  return (
    <div className="space-y-4 py-2 text-center" role="status" aria-live="polite">
      <div className="mx-auto grid size-20 place-items-center rounded-full bg-sound/15">
        <CircleCheckIcon className="size-10 text-sound" />
      </div>
      <DialogHeader className="items-center text-center">
        <DialogTitle className="text-[20px]">¡Listo, WhatsApp vinculado!</DialogTitle>
        <DialogDescription>
          {handle ? (
            <>
              Entraste como <b>@{handle}</b>. Tus stickers llegarán a tu chat «Tú».
            </>
          ) : (
            "Tus stickers llegarán a tu chat «Tú»."
          )}
        </DialogDescription>
      </DialogHeader>
      <p className="text-[12px] text-muted-foreground">
        Lo quitas cuando quieras: «Cerrar sesión» aquí, o en WhatsApp → Dispositivos vinculados.
      </p>
    </div>
  );
}
