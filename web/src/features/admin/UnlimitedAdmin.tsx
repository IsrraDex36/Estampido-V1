import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Loader2Icon, XIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ApiError, readJson } from "@/lib/api";

interface UnlimitedView {
  items: { handle: string; exists: boolean }[];
  fromEnv: string[];
}

/**
 * «Sin límite de publicaciones»: your @ (and anyone you trust) skip the
 * per-account quota (30/h, 150/day). Saved in the database.
 */
export function UnlimitedAdmin({ token }: { token: string }) {
  const qc = useQueryClient();
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const key = ["admin", "unlimited", token];
  const view = useQuery({
    queryKey: key,
    queryFn: async () => readJson<UnlimitedView>(await fetch("/api/admin/settings/unlimited", { headers })),
    meta: { errorMessage: false },
  });
  const save = useMutation({
    mutationFn: async (handles: string[]) =>
      readJson<UnlimitedView>(
        await fetch("/api/admin/settings/unlimited", { method: "PUT", headers, body: JSON.stringify({ handles }) }),
      ),
    meta: { errorMessage: false },
    onSuccess: (data) => qc.setQueryData(key, data),
  });
  const [draft, setDraft] = useState("");
  const items = view.data?.items ?? [];
  const add = (e: FormEvent) => {
    e.preventDefault();
    const h = draft.trim();
    if (!h) return;
    save.mutate([...items.map((i) => i.handle), h], { onSuccess: () => setDraft("") });
  };
  const error = save.error instanceof ApiError ? save.error.message : save.error ? "No se pudo guardar." : null;

  return (
    <section className="space-y-3 rounded-3xl bg-stage p-5" aria-label="Sin límite de publicaciones">
      <div>
        <h2 className="text-[15px] font-semibold">Sin límite de publicaciones</h2>
        <p className="text-[13px] text-muted-foreground">
          Estas cuentas no tienen el límite de 30 por hora y 150 al día. Tu usuario es tu @ (en «Mi cuenta»).
        </p>
      </div>
      <form onSubmit={add} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="@tu_usuario"
          aria-label="Usuario"
          autoCapitalize="none"
          autoComplete="off"
          className="h-10 min-w-0 flex-1 rounded-full bg-background/60 px-4 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" className="h-10 rounded-full" disabled={!draft.trim() || save.isPending}>
          {save.isPending && <Loader2Icon className="size-4 animate-spin" />} Agregar
        </Button>
      </form>
      {error && <p className="text-[13px] text-destructive">{error}</p>}
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((i) => (
            <li key={i.handle} className="flex items-center gap-1 rounded-full bg-background/60 py-1 pr-1 pl-3 text-[13px]">
              <span className="font-medium">@{i.handle}</span>
              {!i.exists && <span className="text-[11px] text-retro-a">(aún no existe)</span>}
              <button
                type="button"
                aria-label={`Quitar @${i.handle}`}
                disabled={save.isPending}
                onClick={() => save.mutate(items.filter((x) => x.handle !== i.handle).map((x) => x.handle))}
                className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {(view.data?.fromEnv.length ?? 0) > 0 && (
        <p className="text-[12px] text-muted-foreground">También desde el servidor: {view.data?.fromEnv.map((h) => `@${h}`).join(", ")}</p>
      )}
    </section>
  );
}
