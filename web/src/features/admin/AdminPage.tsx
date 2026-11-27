import { ADMIN_UNLINK_CONFIRM, type AdminHealth, type AdminPairing } from "@contract";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { CircleCheckIcon, Loader2Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ApiError, readJson } from "@/lib/api";
import { BackupsAdmin } from "./BackupsAdmin";
import { CommunityAdmin } from "./CommunityAdmin";
import { DefenseAdmin } from "./DefenseAdmin";
import { FeedbackAdmin } from "./FeedbackAdmin";
import { ReportsAdmin } from "./ReportsAdmin";
import { UnlimitedAdmin } from "./UnlimitedAdmin";

const KEY = "estampido-admin";
const readToken = () => {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};

async function fetchPairing(token: string, signal: AbortSignal): Promise<AdminPairing> {
  return readJson<AdminPairing>(await fetch("/api/admin/pairing", { headers: { authorization: `Bearer ${token}` }, signal }));
}

/**
 * Owner-only: link the BOT's WhatsApp from the browser (big QR or code), live.
 * Protected by SVA_ADMIN_TOKEN; the password stays in this tab only.
 */
export function AdminPage() {
  const [token, setToken] = useState(readToken);
  const [draft, setDraft] = useState("");
  const pairing = useQuery({
    queryKey: ["admin", "pairing", token],
    queryFn: ({ signal }) => fetchPairing(token, signal),
    enabled: token !== "",
    retry: false,
    // Fast while linking (QR rotates), slow once connected.
    refetchInterval: (q) => (q.state.status === "error" ? false : q.state.data?.state === "connected" ? 30_000 : 2_500),
    meta: { errorMessage: false },
  });
  const unauthorized = pairing.error instanceof ApiError && pairing.error.status === 401;
  const disabled = pairing.error instanceof ApiError && pairing.error.status === 404;

  const login = (e: FormEvent) => {
    e.preventDefault();
    try {
      sessionStorage.setItem(KEY, draft);
    } catch {
      // in-memory only
    }
    setToken(draft);
  };
  const logout = () => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // ignore
    }
    setToken("");
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
      <p className="font-pixel text-[10px] text-muted-foreground">ADMINISTRACIÓN</p>
      <h1 className="display mt-2 text-4xl">Vincular el bot</h1>
      <p className="mt-2 text-[14px] text-muted-foreground">
        Conecta el WhatsApp que enviará los stickers. Solo para el dueño.
      </p>

      {!token || unauthorized || disabled ? (
        <form onSubmit={login} className="mt-8 space-y-3">
          <input
            type="password"
            autoComplete="current-password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Contraseña de administrador"
            className="h-11 w-full rounded-xl bg-muted/60 px-4 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {unauthorized && <p className="text-[13px] text-destructive">Contraseña incorrecta.</p>}
          {disabled && (
            <p className="text-[13px] text-muted-foreground">
              El panel no está disponible.
            </p>
          )}
          <Button type="submit" className="h-11 w-full rounded-full" disabled={draft.length < 1}>
            Entrar
          </Button>
        </form>
      ) : (
        <div className="mt-8 space-y-5">
          <Status data={pairing.data} loading={pairing.isPending} token={token} onUnlinked={() => void pairing.refetch()} />
          <DefenseAdmin token={token} />
          <HealthPanel token={token} />
          <BackupsAdmin token={token} />
          <UnlimitedAdmin token={token} />
          <ReportsAdmin token={token} />
          <FeedbackAdmin token={token} />
          <CommunityAdmin token={token} />
          <Button variant="ghost" size="sm" className="rounded-full" onClick={logout}>
            Salir
          </Button>
        </div>
      )}
    </div>
  );
}

function Status({
  data,
  loading,
  token,
  onUnlinked,
}: {
  data: AdminPairing | undefined;
  loading: boolean;
  token: string;
  onUnlinked: () => void;
}) {
  if (loading || !data) {
    return (
      <div className="grid h-64 place-items-center rounded-3xl bg-stage">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (data.state === "connected") {
    return (
      <div className="space-y-4 rounded-3xl bg-stage p-6">
        <div className="flex items-center gap-3">
          <CircleCheckIcon className="size-8 shrink-0 text-sound" weight="fill" />
          <div className="min-w-0">
            <p className="font-semibold">Bot conectado</p>
            <p className="text-[13px] text-muted-foreground">WhatsApp {data.phone}. Ya puedes cerrar esta página.</p>
          </div>
        </div>
        <UnlinkBot token={token} phone={data.phone} onDone={onUnlinked} />
      </div>
    );
  }
  if (data.state === "blocked") {
    return (
      <div className="space-y-4 rounded-3xl bg-destructive/10 p-6 ring-1 ring-destructive/40">
        <div>
          <p className="font-semibold text-destructive">WhatsApp rechazó el número del bot (403)</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Suele significar que la cuenta del bot quedó <b>restringida o suspendida</b>. El bot ya no reintenta cada 2
            segundos: espera y vuelve a probar a las{" "}
            {new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit" }).format(new Date(data.retryAt))}.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
            <li>Abre WhatsApp en el teléfono del bot y revisa si muestra un aviso de cuenta suspendida.</li>
            <li>Si está suspendida: desvincula aquí y vincula otro número.</li>
            <li>«Enviar a mi WhatsApp» (cada quien con su propio WhatsApp) sigue funcionando sin el bot.</li>
          </ul>
        </div>
        <UnlinkBot token={token} phone="del bot" onDone={onUnlinked} />
      </div>
    );
  }
  if (data.state === "qr") {
    return (
      <div className="space-y-3">
        <div className="rounded-3xl bg-white p-4">
          <img
            src={`data:image/svg+xml;utf8,${encodeURIComponent(data.qrSvg)}`}
            alt="Código QR para vincular el bot"
            className="aspect-square w-full"
          />
        </div>
        <p className="text-[13px] text-muted-foreground">
          En el celular del bot: WhatsApp → <b className="text-foreground">Dispositivos vinculados</b> →{" "}
          <b className="text-foreground">Vincular un dispositivo</b> → escanea. El QR se renueva solo.
        </p>
      </div>
    );
  }
  if (data.state === "code") {
    return (
      <div className="space-y-3 rounded-3xl bg-stage p-6 text-center">
        <p className="font-pixel text-[10px] text-muted-foreground">CÓDIGO DE VINCULACIÓN</p>
        <p className="font-mono text-4xl font-semibold tracking-[0.2em]">{data.code}</p>
        <p className="text-[13px] text-muted-foreground">
          WhatsApp → Dispositivos vinculados → Vincular un dispositivo → «Vincular con número de teléfono».
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-3xl bg-stage p-6 text-[14px] text-muted-foreground">
      {data.state === "offline" ? "El bot no está corriendo." : "Preparando la vinculación…"}
    </div>
  );
}

const HEALTH: Record<AdminHealth["status"], { label: string; dot: string }> = {
  ok: { label: "Todo bien", dot: "bg-sound" },
  degraded: { label: "Con problemas", dot: "bg-retro-a" },
  down: { label: "Sin conexión", dot: "bg-destructive" },
  unlinked: { label: "Desvinculado", dot: "bg-destructive" },
  starting: { label: "Arrancando", dot: "bg-muted-foreground/50" },
  offline: { label: "Bot apagado", dot: "bg-muted-foreground/50" },
};

const ago = (t: number | null) => {
  if (!t) return "—";
  const min = Math.round((Date.now() - t) / 60_000);
  return min < 1 ? "hace un momento" : min < 60 ? `hace ${min} min` : `hace ${Math.round(min / 60)} h`;
};

/** Watchdog report: status, last activity, recent trouble. */
function HealthPanel({ token }: { token: string }) {
  const health = useQuery({
    queryKey: ["admin", "health", token],
    queryFn: async ({ signal }) =>
      readJson<AdminHealth>(await fetch("/api/admin/health", { headers: { authorization: `Bearer ${token}` }, signal })),
    refetchInterval: 15_000,
    retry: false,
    meta: { errorMessage: false },
  });
  const h = health.data;
  if (!h) return null;
  const s = HEALTH[h.status];
  return (
    <section aria-label="Salud del bot" className="space-y-3 rounded-3xl bg-muted/40 p-5 ring-1 ring-border/60">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Vigilante</h2>
        <span className="flex items-center gap-2 text-[13px]">
          <span className={`size-2 rounded-full ${s.dot}`} aria-hidden /> {s.label}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        <dt className="text-muted-foreground">Último mensaje recibido</dt>
        <dd className="text-right tabular-nums">{ago(h.lastInboundAt)}</dd>
        <dt className="text-muted-foreground">Última prueba OK</dt>
        <dd className="text-right tabular-nums">{ago(h.lastProbeOkAt)}</dd>
        <dt className="text-muted-foreground">Reconexiones (24 h)</dt>
        <dd className="text-right tabular-nums">{h.reconnects24h}</dd>
        <dt className="text-muted-foreground">Indescifrables (1 h)</dt>
        <dd className="text-right tabular-nums">{h.decryptFailuresRecent}</dd>
        {h.outbound && (
          <>
            <dt className="text-muted-foreground">Mensajes enviados (1 h)</dt>
            <dd className="text-right tabular-nums">
              {h.outbound.lastHour}
              <span className="text-muted-foreground"> / {h.outbound.limits.perHour}</span>
            </dd>
            <dt className="text-muted-foreground">Mensajes enviados (24 h)</dt>
            <dd className="text-right tabular-nums">{h.outbound.last24h}</dd>
            <dt className="text-muted-foreground">Calentamiento del número</dt>
            <dd className="text-right tabular-nums">
              {h.outbound.warmupDay === null ? "—" : h.outbound.warmupDay >= 30 ? "completo" : `día ${h.outbound.warmupDay + 1}`}
            </dd>
          </>
        )}
      </dl>
      {h.outbound && h.outbound.warmupDay !== null && h.outbound.warmupDay < 30 && (
        <p className="text-[12px] text-muted-foreground">
          Número nuevo: el bot envía con calma (máx. {h.outbound.limits.perMinute}/min y {h.outbound.limits.perHour}/h) y
          sube el ritmo poco a poco durante un mes.
        </p>
      )}
      {h.problems.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
          {h.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * «Desvincular bot»: logs the bot's WhatsApp out (the old phone drops the
 * device by itself) and shows a new QR here to link another number.
 * Typed confirmation: every linked person depends on this number.
 */
function UnlinkBot({ token, phone, onDone }: { token: string; phone: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" } | { kind: "error"; message: string }>({ kind: "idle" });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState({ kind: "busy" });
    try {
      await readJson(
        await fetch("/api/admin/bot/unlink", {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ confirm: typed.trim() }),
        }),
      );
      setOpen(false);
      setTyped("");
      setState({ kind: "idle" });
      onDone();
    } catch (err) {
      setState({ kind: "error", message: err instanceof ApiError ? err.message : "No se pudo desvincular." });
    }
  };
  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="rounded-full text-destructive" onClick={() => setOpen(true)}>
        Desvincular bot (cambiar de número)
      </Button>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-background/60 p-4">
      <p className="text-[13px]">
        Se cierra la sesión de WhatsApp {phone} en el bot y aquí aparece un QR nuevo para vincular otro número. Las
        personas tendrán que volver a «Entrar con WhatsApp» con el número nuevo.
      </p>
      <label className="block space-y-1 text-[12px] text-muted-foreground">
        Escribe <b className="text-foreground">{ADMIN_UNLINK_CONFIRM}</b> para confirmar
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          aria-label="Confirmación"
          className="h-10 w-full rounded-xl bg-muted/60 px-3 text-[15px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      {state.kind === "error" && <p className="text-[13px] text-destructive">{state.message}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" className="rounded-full" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button
          type="submit"
          variant="destructive"
          className="rounded-full"
          disabled={typed.trim() !== ADMIN_UNLINK_CONFIRM || state.kind === "busy"}
        >
          {state.kind === "busy" && <Loader2Icon className="size-4 animate-spin" />} Desvincular
        </Button>
      </div>
    </form>
  );
}
