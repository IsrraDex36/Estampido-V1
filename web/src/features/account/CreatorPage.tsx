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
import { Avatar } from "./Avatar";

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
    <div className="py-8 sm:py-10">
      <header className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-end sm:text-left">
        {p ? <Avatar avatar={p.avatar} size={96} label={`Avatar de ${p.displayName}`} /> : <Skeleton className="size-24 rounded-full" />}
        <div className="min-w-0 flex-1 space-y-1.5">
          {p ? (
            <>
              <h1 className="display text-3xl break-words sm:text-4xl">{p.displayName}</h1>
              <p className="text-[14px] text-muted-foreground">
                @{p.handle} · desde {joined(p.createdAt)}
              </p>
              {p.bio && <p className="max-w-prose text-[15px] whitespace-pre-line text-pretty">{p.bio}</p>}
            </>
          ) : (
            <div className="space-y-2">
              <Skeleton className="mx-auto h-8 w-48 sm:mx-0" />
              <Skeleton className="mx-auto h-4 w-32 sm:mx-0" />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {p && !isMe && <FollowButton profile={p} />}
          {isMe && (
            <Button asChild variant="secondary" className="rounded-full">
              <Link href={ROUTES.account}>Editar perfil</Link>
            </Button>
          )}
          <Button variant="secondary" size="icon" className="rounded-full" aria-label="Compartir perfil" onClick={share}>
            <Share2Icon />
          </Button>
        </div>
      </header>

      <dl className="mt-6 grid grid-cols-3 gap-2 sm:max-w-2xl sm:grid-cols-5">
        {(
          [
            ["Seguidores", p?.followers],
            ["Stickers", p?.stats.stickers],
            ["Usos", p?.stats.uses],
            ["Favoritos", p?.stats.saves],
            ["Envíos", p?.stats.sends],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-2xl bg-muted/50 px-1.5 py-2.5 text-center sm:px-3">
            <dd className="font-mono text-lg font-semibold tabular-nums">{value === undefined ? "–" : n(value)}</dd>
            <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>

      {p && <CreatorPacks handle={p.handle} />}

      <section aria-label="Stickers publicados" className="mt-8">
        {stickers.isPending && profile.isSuccess ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
      <h2 className="text-[15px] font-semibold">Packs</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {packs.data.map((pk) => (
          <PackCard key={pk.id} pack={pk} showOwner={false} />
        ))}
      </div>
    </section>
  );
}
