import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { creatorHref } from "@/app/routes";
import { creatorQueries } from "@/features/account/api";
import { Avatar } from "@/features/account/Avatar";
import { GhostBlock, GhostFrame } from "./Ghost";

const n = (v: number) => new Intl.NumberFormat("es-MX", { notation: "compact" }).format(v);

/** Featured creators: whose stickers the community uses, saves and sends the most. */
export function CreatorsList() {
  const top = useQuery(creatorQueries.top());
  if (top.isPending) {
    return (
      <ul className="space-y-1" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex items-center gap-3 rounded-xl px-2 py-2">
            <GhostFrame className="size-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <GhostBlock className="h-2.5 w-24" />
              <GhostBlock className="h-2 w-16" />
            </div>
          </li>
        ))}
      </ul>
    );
  }
  const items = top.data ?? [];
  if (items.length === 0) {
    return (
      <p className="rounded-2xl bg-stage px-4 py-6 text-center text-[13px] text-muted-foreground">
        Aún no hay creadores destacados. Entra con tu WhatsApp, publica y aparece aquí.
      </p>
    );
  }
  return (
    <ol className="space-y-0.5">
      {items.map((c, i) => (
        <li key={c.handle}>
          <Link href={creatorHref(c.handle)} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/50">
            <span className="w-4 shrink-0 font-pixel text-[11px] text-muted-foreground">{i + 1}</span>
            <Avatar avatar={c.avatar} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{c.displayName}</span>
              <span className="block truncate text-[12px] text-muted-foreground">
                @{c.handle} · {n(c.stats.stickers)} stickers · {n(c.stats.uses)} usos
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
