import { type AdminReports, REPORT_REASONS } from "@contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CircleCheckIcon, FlagIcon, Loader2Icon, Trash2Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { readJson } from "@/lib/api";
import { errorMessage, notify } from "@/lib/notify";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";
import { AuthedImage } from "./AuthedImage";

const LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.id, r.label])) as Record<string, string>;
const auth = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
const ago = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return min < 60 ? `hace ${Math.max(1, min)} min` : min < 1440 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} d`;
};

/** Review queue: reported stickers, most reported first. Keep · delete · block the creator. */
export function ReportsAdmin({ token }: { token: string }) {
  const qc = useQueryClient();
  const key = ["admin", "reports", token] as const;
  const reports = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => readJson<AdminReports>(await fetch("/api/admin/reports", { headers: auth(token), signal })),
    refetchInterval: 60_000,
    retry: false,
    meta: { errorMessage: false },
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: key }),
      qc.invalidateQueries({ queryKey: ["admin", "community", token] }),
      qc.invalidateQueries({ queryKey: queryKeys.community.all }),
      qc.invalidateQueries({ queryKey: queryKeys.creators.all }),
    ]);
  const act = useMutation({
    mutationFn: async (a: { kind: "keep" | "delete" | "ban" | "unban"; id: string; handle?: string }) => {
      const req =
        a.kind === "keep"
          ? fetch(`/api/admin/reports/${a.id}/dismiss`, { method: "POST", headers: auth(token) })
          : a.kind === "delete"
            ? fetch(`/api/admin/community/stickers/${a.id}`, { method: "DELETE", headers: auth(token) })
            : fetch(`/api/admin/users/${a.handle}/ban`, { method: a.kind === "ban" ? "POST" : "DELETE", headers: auth(token) });
      await readJson(await req);
      return a;
    },
    onSuccess: (a) =>
      notify.success(
        a.kind === "keep"
          ? "Se queda: reportes descartados"
          : a.kind === "delete"
            ? "Sticker borrado"
            : a.kind === "ban"
              ? `@${a.handle} bloqueado`
              : `@${a.handle} desbloqueado`,
      ),
    onError: (err) => notify.error(errorMessage(err, "No se pudo completar.")),
    onSettled: refresh,
  });

  const items = reports.data?.items ?? [];
  return (
    <section aria-label="Reportes" className="space-y-4 rounded-3xl bg-muted/40 p-5 ring-1 ring-border/60">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <FlagIcon className="size-4" /> Reportes
        </h2>
        {items.length > 0 && (
          <span className="rounded-full bg-destructive px-2 py-0.5 font-mono text-[12px] text-white tabular-nums">{items.length}</span>
        )}
      </div>
      {reports.isPending ? (
        <div className="grid h-20 place-items-center">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <CircleCheckIcon className="size-4 text-sound" weight="fill" /> Nada por revisar.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <ReportCard
              key={it.sticker.id}
              item={it}
              token={token}
              busy={act.isPending && act.variables?.id === it.sticker.id}
              onAct={(kind) => act.mutate({ kind, id: it.sticker.id, handle: it.sticker.creator?.handle })}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReportCard({
  item,
  token,
  busy,
  onAct,
}: {
  item: AdminReports["items"][number];
  token: string;
  busy: boolean;
  onAct: (kind: "keep" | "delete" | "ban" | "unban") => void;
}) {
  const [confirm, setConfirm] = useState<"delete" | "ban" | null>(null);
  const s = item.sticker;
  return (
    <li className="space-y-3 rounded-2xl bg-background/60 p-3">
      <div className="flex gap-3">
        <AuthedImage src={s.stickerUrl} token={token} className="size-16 shrink-0 rounded-xl bg-stage object-contain" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-[14px] font-medium">{s.title}</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {s.creator ? `@${s.creator.handle}` : "anónimo"}
            {item.creatorBanned && " · bloqueado"} · {s.reports} {s.reports === 1 ? "reporte" : "reportes"} · {ago(item.latestAt)}
          </p>
          <div className="flex flex-wrap gap-1">
            {s.hidden && <span className="rounded-full bg-retro-a/90 px-2 py-0.5 text-[11px] font-medium text-black">Oculto</span>}
            {Object.entries(item.reasons).map(([r, n]) => (
              <span key={r} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                {LABEL[r] ?? r} · {n}
              </span>
            ))}
          </div>
        </div>
      </div>
      {item.notes.length > 0 && (
        <ul className="space-y-1 border-l-2 border-border pl-3 text-[12px] text-muted-foreground">
          {item.notes.slice(0, 3).map((n) => (
            <li key={`${n.createdAt}-${n.note}`}>«{n.note}»</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" className="rounded-full" disabled={busy} onClick={() => onAct("keep")}>
          Mantener
        </Button>
        <Button
          size="sm"
          variant={confirm === "delete" ? "destructive" : "ghost"}
          className={cn("rounded-full", confirm !== "delete" && "text-destructive")}
          disabled={busy}
          onBlur={() => setConfirm(null)}
          onClick={() => (confirm === "delete" ? onAct("delete") : setConfirm("delete"))}
        >
          <Trash2Icon className="size-4" /> {confirm === "delete" ? "¿Borrar?" : "Borrar"}
        </Button>
        {s.creator &&
          (item.creatorBanned ? (
            <Button size="sm" variant="ghost" className="rounded-full" disabled={busy} onClick={() => onAct("unban")}>
              Desbloquear @{s.creator.handle}
            </Button>
          ) : (
            <Button
              size="sm"
              variant={confirm === "ban" ? "destructive" : "ghost"}
              className={cn("rounded-full", confirm !== "ban" && "text-destructive")}
              disabled={busy}
              onBlur={() => setConfirm(null)}
              onClick={() => (confirm === "ban" ? onAct("ban") : setConfirm("ban"))}
            >
              {confirm === "ban" ? `¿Bloquear a @${s.creator.handle}?` : `Bloquear @${s.creator.handle}`}
            </Button>
          ))}
      </div>
    </li>
  );
}
