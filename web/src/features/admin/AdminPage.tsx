import type { AdminPairing } from "@contract";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { CircleCheckIcon, Loader2Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ApiError, readJson } from "@/lib/api";

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
    refetchInterval: (q) => (q.state.status === "error" ? false : 2_500),
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
            placeholder="Contraseña (SVA_ADMIN_TOKEN)"
            className="h-11 w-full rounded-xl bg-muted/60 px-4 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {unauthorized && <p className="text-[13px] text-destructive">Contraseña incorrecta.</p>}
          {disabled && (
            <p className="text-[13px] text-muted-foreground">
              El panel está desactivado. Define <code>SVA_ADMIN_TOKEN</code> (16+ caracteres) en el servidor.
            </p>
          )}
          <Button type="submit" className="h-11 w-full rounded-full" disabled={draft.length < 1}>
            Entrar
          </Button>
        </form>
      ) : (
        <div className="mt-8 space-y-5">
          <Status data={pairing.data} loading={pairing.isPending} />
          <Button variant="ghost" size="sm" className="rounded-full" onClick={logout}>
            Salir
          </Button>
        </div>
      )}
    </div>
  );
}

function Status({ data, loading }: { data: AdminPairing | undefined; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="grid h-64 place-items-center rounded-3xl bg-stage">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (data.state === "connected") {
    return (
      <div className="flex items-center gap-3 rounded-3xl bg-stage p-6">
        <CircleCheckIcon className="size-8 text-sound" weight="fill" />
        <div>
          <p className="font-semibold">Bot conectado</p>
          <p className="text-[13px] text-muted-foreground">WhatsApp {data.phone}. Ya puedes cerrar esta página.</p>
        </div>
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
