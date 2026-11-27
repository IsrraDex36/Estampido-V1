import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { ROUTES } from "@/app/routes";
import { Mascot } from "@/components/pixel/Mascot";
import { Share2Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InfiniteFooter } from "@/features/community/components/InfiniteFooter";
import { StickerCard } from "@/features/community/components/StickerCard";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/notify";
import { compactNumber } from "@/lib/format";
import { FollowButton } from "@/features/social/FollowButton";
import { PackCard } from "@/features/social/PackCard";
import { socialQueries } from "@/features/social/api";
import { creatorQueries, useMe } from "./api";
import { ProfileHeader } from "./ProfileHeader";

const joined = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
const n = (v: number) => compactNumber(v);

/** Public creator page: who they are, their numbers and their stickers. */
export default function CreatorPage() {
  const { handle = "" } = useParams<{ handle: string }>();
  const key = handle.toLowerCase();
  const profile = useQuery(creatorQueries.profile(key));
  const stickers = useInfiniteQuery({ ...creatorQueries.stickers(key), enabled: profile.isSuccess });
  const me = useMe().data;
  const isMe = me?.handle === key;

  useEffect(() => {
    if (profile.data) document.title = `${profile.data.displayName} (@${profile.data.handle}) · Estampido`;
  }, [profile.data]);

  if (profile.error instanceof ApiError && profile.error.status === 404) {
    return (
      <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 py-20 text-center">
        <Mascot size={88} />
        <h1 className="display text-3xl">Ese creador no existe</h1>
        <p className="text-[14px] text-muted-foreground">Quizá cambió su nombre de usuario.</p>
        <Button asChild className="rounded-full">
          <Link href={ROUTES.community}>Ir a la comunidad</Link>
        </Button>
      </div>
    );
  }

  const p = profile.data;
  const items = stickers.data?.pages.flatMap((pg) => pg.items) ?? [];
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: p ? `${p.displayName} en Estampido` : "Estampido", url });
      else {
        await navigator.clipboard.writeText(url);
        notify.success("Enlace copiado");
      }
    } catch {
      // share sheet closed
    }
  };

  return (
    <div className="py-6 sm:py-10">
      {p ? (
        <ProfileHeader
          displayName={p.displayName}
          handle={p.handle}
          bio={p.bio}
          avatar={p.avatar}
          since={`desde ${joined(p.createdAt)}`}
          actions={
            <>
              {!isMe && <FollowButton profile={p} />}
              {isMe && (
                <Button asChild variant="secondary" className="rounded-full">
                  <Link href={ROUTES.account}>Editar perfil</Link>
                </Button>
              )}
              <Button variant="secondary" className="rounded-full" onClick={share}>
                <Share2Icon /> Compartir
              </Button>
            </>
          }
        />
      ) : (
        <Skeleton className="h-64 rounded-3xl" />
      )}

      {/* The numbers people understand (same words as the cards). */}
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 lg:max-w-3xl">
        {(
          [
            ["Seguidores", p?.followers],
            ["Stickers", p?.stats.stickers],
            ["Descargas", p?.stats.sends],
            ["Favoritos", p?.stats.saves],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-2xl bg-muted/50 px-3 py-3 text-center ring-1 ring-border/50">
            <dd className="text-2xl font-semibold tabular-nums">{value === undefined ? "–" : n(value)}</dd>
            <dt className="truncate text-[12px] text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>

      {p && <CreatorPacks handle={p.handle} />}

      <section aria-label="Stickers publicados" className="mt-10">
        <h2 className="mb-3 text-[17px] font-semibold tracking-tight">
          Stickers {p ? <span className="text-muted-foreground">· {n(p.stats.stickers)}</span> : null}
        </h2>
        {stickers.isPending && profile.isSuccess ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 3xl:grid-cols-6 4xl:grid-cols-7">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-3xl" />
            ))}
          </div>
        ) : items.length === 0 && profile.isSuccess ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-stage px-6 py-12 text-center">
            <Mascot size={72} />
            <p className="text-[14px] text-muted-foreground">
              {isMe ? "Aún no publicas nada. Crea un sticker y publícalo en la comunidad." : "Aún no ha publicado stickers."}
            </p>
            {isMe && (
              <Button asChild className="rounded-full">
                <Link href={ROUTES.create}>Crear un sticker</Link>
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 3xl:grid-cols-6 4xl:grid-cols-7">
              {items.map((s) => (
                <StickerCard key={s.id} sticker={s} />
              ))}
            </div>
            <InfiniteFooter
              hasNext={Boolean(stickers.hasNextPage)}
              loading={stickers.isFetchingNextPage}
              error={stickers.isError}
              onMore={() => void stickers.fetchNextPage()}
              endLabel="Eso es todo."
            />
          </>
        )}
      </section>
    </div>
  );
}

/** The creator's packs (only non-empty ones are public). */
function CreatorPacks({ handle }: { handle: string }) {
  const packs = useQuery(socialQueries.creatorPacks(handle));
  if (!packs.data || packs.data.length === 0) return null;
  return (
    <section aria-label="Packs" className="mt-8 space-y-3">
      <h2 className="text-[17px] font-semibold tracking-tight">Packs</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 3xl:grid-cols-6 4xl:grid-cols-7">
        {packs.data.map((pk) => (
          <PackCard key={pk.id} pack={pk} showOwner={false} />
        ))}
      </div>
    </section>
  );
}
