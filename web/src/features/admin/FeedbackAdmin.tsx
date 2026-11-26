import { type AdminFeedback, FEEDBACK_KINDS, type FeedbackStatus } from "@contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CircleCheckIcon, Loader2Icon, Trash2Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { readJson } from "@/lib/api";
import { errorMessage, notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

const KIND = Object.fromEntries(FEEDBACK_KINDS.map((k) => [k.id, k])) as Record<string, (typeof FEEDBACK_KINDS)[number]>;
const auth = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
const FILTERS: { id: FeedbackStatus | "todos"; label: string }[] = [
  { id: "nuevo", label: "Nuevos" },
  { id: "leido", label: "Leídos" },
  { id: "hecho", label: "Hechos" },
  { id: "todos", label: "Todos" },
];
const when = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Feedback inbox: ideas, problems and comments; mark read/done, delete. */
export function FeedbackAdmin({ token }: { token: string }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FeedbackStatus | "todos">("nuevo");
  const key = ["admin", "feedback", token, filter] as const;
  const list = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) =>
      readJson<AdminFeedback>(
        await fetch(`/api/admin/feedback${filter === "todos" ? "" : `?status=${filter}`}`, { headers: auth(token), signal }),
      ),
    refetchInterval: 60_000,
    retry: false,
    meta: { errorMessage: false },
  });
  const act = useMutation({
    mutationFn: async (a: { id: string; status?: FeedbackStatus; remove?: boolean }) =>
      readJson(
        await fetch(`/api/admin/feedback/${a.id}`, {
          method: a.remove ? "DELETE" : "PATCH",
          headers: auth(token),
          body: a.remove ? undefined : JSON.stringify({ status: a.status }),
        }),
      ),
    onError: (err) => notify.error(errorMessage(err, "No se pudo actualizar.")),
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin", "feedback", token] }),
  });
  const items = list.data?.items ?? [];

  return (
    <section aria-label="Comentarios" className="space-y-4 rounded-3xl bg-muted/40 p-5 ring-1 ring-border/60">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">💬 Comentarios</h2>
        {(list.data?.unread ?? 0) > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[12px] text-primary-foreground tabular-nums">
            {list.data?.unread} {list.data?.unread === 1 ? "nuevo" : "nuevos"}
          </span>
        )}
      </div>
      <div role="tablist" className="flex gap-1 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-[12px] font-medium",
              filter === f.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {list.isPending ? (
        <div className="grid h-16 place-items-center">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <CircleCheckIcon className="size-4 text-sound" weight="fill" /> Nada por aquí.
        </p>
      ) : (
        <ul className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
          {items.map((f) => (
            <li key={f.id} className="space-y-2 rounded-2xl bg-background/60 p-3">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                <span className="rounded-full bg-muted px-2 py-0.5 text-foreground">
                  {KIND[f.kind]?.emoji} {KIND[f.kind]?.label}
                </span>
                <span>{when(f.createdAt)}</span>
                {f.author ? <span>@{f.author.handle}</span> : f.contact ? <span>{f.contact}</span> : <span>anónimo</span>}
                {f.page && <span>· {f.page}</span>}
              </p>
              <p className="text-[14px] whitespace-pre-line text-pretty">{f.message}</p>
              {f.app && <p className="font-mono text-[11px] text-muted-foreground">{f.app}</p>}
              <div className="flex flex-wrap gap-1.5">
                {f.status !== "leido" && (
                  <Button size="sm" variant="secondary" className="h-7 rounded-full" onClick={() => act.mutate({ id: f.id, status: "leido" })}>
                    Leído
                  </Button>
                )}
                {f.status !== "hecho" && (
                  <Button size="sm" variant="secondary" className="h-7 rounded-full" onClick={() => act.mutate({ id: f.id, status: "hecho" })}>
                    Hecho
                  </Button>
                )}
                {f.status !== "nuevo" && (
                  <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={() => act.mutate({ id: f.id, status: "nuevo" })}>
                    Marcar nuevo
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 rounded-full text-muted-foreground hover:text-destructive"
                  aria-label="Borrar comentario"
                  onClick={() => act.mutate({ id: f.id, remove: true })}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
