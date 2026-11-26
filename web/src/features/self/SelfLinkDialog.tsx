import { useEffect, useState } from "react";
import { CircleCheckIcon, Loader2Icon } from "@/components/icons";
import { Mascot } from "@/components/pixel/Mascot";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import { type LinkStatus, linkStatus, startLink } from "./endpoints";
import { useSelfStore } from "./selfStore";

type Step = { kind: "intro" } | { kind: "linking"; id: string; status: LinkStatus } | { kind: "error"; message: string };

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

const onPhone = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

function Body({ after, onDone }: { after?: () => void; onDone: () => void }) {
  const setSession = useSelfStore((s) => s.setSession);
  const [step, setStep] = useState<Step>({ kind: "intro" });
  const [phone, setPhone] = useState("52");
  const [busy, setBusy] = useState(false);

  const begin = async (withPhone: boolean) => {
    setBusy(true);
    try {
      const id = await startLink(withPhone ? phone : undefined);
      setStep({ kind: "linking", id, status: { state: "waiting" } });
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
          onDone();
          after?.();
          return;
        }
        if (status.state === "failed") {
          setStep({ kind: "error", message: status.reason });
          return;
        }
        setStep({ kind: "linking", id: linkId, status });
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
  }, [linkId, setSession, onDone, after]);

  if (step.kind === "intro") {
    const digits = phone.replace(/\D/g, "");
    return (
      <>
        <DialogHeader className="flex flex-col items-center px-8 text-center">
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-stage">
            <Mascot size={56} mood="singing" />
          </div>
          <DialogTitle className="text-[20px]">Envíatelos a tu propio WhatsApp</DialogTitle>
          <DialogDescription>Llegan a tu chat «Tú», con sonido, y desde ahí los guardas o reenvías.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-[13px]">
          {[
            ["🔗", "Estampido se vincula a tu WhatsApp como un dispositivo (igual que WhatsApp Web)."],
            ["🙋", "Solo te enviamos a ti, a tu chat «Tú». Nunca a otras personas."],
            ["🔒", "No guardamos tus chats, contactos ni tu número. La sesión queda cifrada solo en este navegador."],
            ["↩️", "Quítalo cuando quieras: aquí o en WhatsApp → Dispositivos vinculados."],
          ].map(([e, t]) => (
            <li key={t} className="flex gap-2.5">
              <span aria-hidden>{e}</span>
              <span className="text-muted-foreground">{t}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-2">
          <label className="block space-y-1 text-[13px] font-medium">
            Tu número de WhatsApp (con código de país)
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="52 229 000 0000"
              className="h-11 w-full rounded-xl bg-muted/60 px-3 text-[16px] font-normal tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="block text-[11px] font-normal text-muted-foreground">Solo para pedir el código; no se guarda.</span>
          </label>
          <Button className="h-12 w-full rounded-full font-semibold" disabled={busy || digits.length < 10} onClick={() => void begin(true)}>
            {busy && <Loader2Icon className="size-4 animate-spin" />} Obtener código
          </Button>
          {!onPhone() && (
            <Button variant="ghost" className="w-full rounded-full" disabled={busy} onClick={() => void begin(false)}>
              Mejor con QR (escaneo desde el celular)
            </Button>
          )}
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          Es una conexión no oficial de WhatsApp. El riesgo es muy bajo porque solo te mandas mensajes a ti.
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
  return (
    <div className="space-y-4">
      <DialogHeader className="items-center text-center">
        <DialogTitle>{s.state === "qr" ? "Escanea con tu WhatsApp" : "Escribe este código en tu WhatsApp"}</DialogTitle>
        <DialogDescription>
          WhatsApp → <b>Dispositivos vinculados</b> → <b>Vincular un dispositivo</b>
          {s.state === "code" ? (
            <>
              {" "}
              → <b>Vincular con número de teléfono</b>
            </>
          ) : null}
          .
        </DialogDescription>
      </DialogHeader>
      {s.state === "qr" ? (
        <div className="mx-auto w-64 rounded-3xl bg-white p-3">
          <img src={`data:image/svg+xml;utf8,${encodeURIComponent(s.qrSvg)}`} alt="Código QR para vincular" className="aspect-square w-full" />
        </div>
      ) : s.state === "code" ? (
        <p className="text-center font-mono text-4xl font-semibold tracking-[0.15em]" aria-live="polite">
          {s.code}
        </p>
      ) : (
        <div className="grid h-40 place-items-center">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <p className="flex items-center justify-center gap-2 text-[13px] text-muted-foreground" role="status">
        {s.state === "linked" ? <CircleCheckIcon className="size-4 text-sound" /> : <Loader2Icon className="size-4 animate-spin" />}
        Esperando a tu WhatsApp…
      </p>
    </div>
  );
}
