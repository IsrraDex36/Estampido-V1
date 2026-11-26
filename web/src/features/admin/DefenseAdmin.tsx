import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { readJson } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * «Modo defensa»: switch it on during an attack. Creating stickers then needs
 * a signed-in (WhatsApp-linked) account — bots don't have one — so real
 * people keep using Estampido while it lasts. Everything else stays open.
 */
export function DefenseAdmin({ token }: { token: string }) {
  const qc = useQueryClient();
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const key = ["admin", "defense", token];
  const state = useQuery({
    queryKey: key,
    queryFn: async () => readJson<{ on: boolean }>(await fetch("/api/admin/settings/defense", { headers })),
    meta: { errorMessage: false },
  });
  const set = useMutation({
    mutationFn: async (on: boolean) =>
      readJson<{ on: boolean }>(await fetch("/api/admin/settings/defense", { method: "PUT", headers, body: JSON.stringify({ on }) })),
    onSuccess: (d) => qc.setQueryData(key, d),
  });
  const on = state.data?.on === true;
  return (
    <section
      className={cn("space-y-2 rounded-3xl p-5", on ? "bg-retro-a/15 ring-1 ring-retro-a/40" : "bg-stage")}
      aria-label="Modo defensa"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">Modo defensa {on && <span className="text-retro-a">· activo</span>}</h2>
          <p className="text-[13px] text-muted-foreground">
            Durante un ataque: solo quien entró con su WhatsApp puede crear stickers. Lo demás sigue abierto.
          </p>
        </div>
        <Switch
          checked={on}
          disabled={state.isPending || set.isPending}
          onCheckedChange={(v) => set.mutate(v)}
          aria-label="Modo defensa"
        />
      </div>
      {on && (
        <p className="text-[12px] text-muted-foreground">
          Apágalo cuando pase: mientras está activo, quien no tiene cuenta ve «Entra con tu WhatsApp para crear».
        </p>
      )}
    </section>
  );
}
