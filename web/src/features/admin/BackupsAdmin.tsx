import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DownloadIcon, Loader2Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { readJson } from "@/lib/api";
import { formatBytes } from "@/lib/format";

interface BackupInfo {
  name: string;
  bytes: number;
  day: string;
}

/**
 * Database backups: the server keeps 7 daily + 4 weekly; download the latest
 * to keep a copy outside the server (that's the one that survives a disaster).
 */
export function BackupsAdmin({ token }: { token: string }) {
  const qc = useQueryClient();
  const auth = { authorization: `Bearer ${token}` };
  const list = useQuery({
    queryKey: ["admin", "backups", token],
    queryFn: async () => readJson<{ items: BackupInfo[]; enabled: boolean }>(await fetch("/api/admin/backups", { headers: auth })),
    meta: { errorMessage: false },
  });
  const run = useMutation({
    mutationFn: async () => readJson<BackupInfo>(await fetch("/api/admin/backups", { method: "POST", headers: auth })),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["admin", "backups"] }),
  });
  const download = async (b: BackupInfo) => {
    // Authenticated download → blob → save (a plain link can't send the token).
    const res = await fetch(`/api/admin/backups/${encodeURIComponent(b.name)}`, { headers: auth });
    if (!res.ok) return;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `estampido-${b.name}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  const items = list.data?.items ?? [];
  const latest = items[0];
  if (list.data && !list.data.enabled) return null;
  return (
    <section className="space-y-3 rounded-3xl bg-stage p-5" aria-label="Respaldos">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Respaldos de la base</h2>
        <span className="text-[12px] text-muted-foreground">7 diarios + 4 semanales</span>
      </div>
      <p className="text-[13px] text-muted-foreground">
        {latest ? (
          <>
            Último: <b className="text-foreground">{latest.day}</b> · {formatBytes(latest.bytes)}. Descárgalo de vez en
            cuando y guárdalo fuera del servidor.
          </>
        ) : (
          "Aún no hay respaldos."
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" className="rounded-full" disabled={run.isPending} onClick={() => run.mutate()}>
          {run.isPending && <Loader2Icon className="size-4 animate-spin" />} Respaldar ahora
        </Button>
        {latest && (
          <Button size="sm" className="rounded-full" onClick={() => void download(latest)}>
            <DownloadIcon className="size-4" /> Descargar último
          </Button>
        )}
      </div>
    </section>
  );
}
