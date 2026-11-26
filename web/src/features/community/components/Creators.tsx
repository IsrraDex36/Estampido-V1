import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { creatorHref, ROUTES } from "@/app/routes";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { creatorQueries } from "@/features/account/api";
import { Avatar } from "@/features/account/Avatar";
import { compactNumber } from "@/lib/format";

/** Creators tab: who the community uses most, as profile cards. */
export function CreatorsTab() {
  const top = useQuery(creatorQueries.top(24));
  const items = top.data ?? [];
  return (
    <Section index="01" title="Creadores">
      <p className="mb-4 text-[13px] text-muted-foreground">
        Quienes más suenan: ordenados por cuánto se usan, guardan y envían sus stickers.
      </p>
      {top.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-3xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-stage px-6 py-10 text-center">
          <p className="max-w-sm text-[14px] text-muted-foreground">
            Aún no hay creadores destacados. Entra con tu WhatsApp, publica un sticker y aparece aquí.
          </p>
          <Button asChild className="rounded-full">
            <Link href={ROUTES.create}>Crear y publicar</Link>
          </Button>
        </div>
      ) : (
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((c, i) => (
            <li key={c.handle} className="min-w-0">
              <Link
                href={creatorHref(c.handle)}
                className="flex h-full min-w-0 items-start gap-3 rounded-3xl bg-muted/40 p-4 ring-1 ring-border/60 transition-colors hover:ring-foreground/20"
              >
                <span className="relative shrink-0">
                  <Avatar avatar={c.avatar} size={52} />
                  <span className="absolute -top-1 -left-1 grid size-5 place-items-center rounded-full bg-foreground font-pixel text-[9px] text-background">
                    {i + 1}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{c.displayName}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">@{c.handle}</span>
                  {c.bio && (
                    <span className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">
                      {c.bio}
                    </span>
                  )}
                  <span className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] tabular-nums">
                    <span>
                      <b>{compactNumber(c.stats.stickers)}</b> <span className="text-muted-foreground">stickers</span>
                    </span>
                    <span>
                      <b>{compactNumber(c.stats.uses)}</b> <span className="text-muted-foreground">usos</span>
                    </span>
                    <span>
                      <b>{compactNumber(c.stats.saves)}</b> <span className="text-muted-foreground">guardados</span>
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
