import { useState } from "react";
import { Link } from "wouter";
import { ROUTES } from "@/app/routes";
import { useMe, useMyStickers } from "@/features/account/api";
import { LinkDialog } from "@/features/bot/LinkDialog";
import { Mascot } from "@/components/pixel/Mascot";
import { cn } from "@/lib/utils";
import { MY_SPACE_TABS } from "../model";
import { useFavorites } from "../store/favoritesStore";
import { SoundRow } from "./SoundRow";
import { StickerCard } from "./StickerCard";

type Tab = (typeof MY_SPACE_TABS)[number]["id"];

/**
 * Saved stickers, saved sounds and what I published. Signed in: synced with
 * the account (published = my account's stickers). Signed out: this device.
 */
export function MySpace() {
  const [tab, setTab] = useState<Tab>("saved");
  const [linkOpen, setLinkOpen] = useState(false);
  const me = useMe().data;
  const stickers = useFavorites((s) => s.stickers);
  const sounds = useFavorites((s) => s.sounds);
  const devicePublished = useFavorites((s) => s.published);
  const mine = useMyStickers(Boolean(me));
  const published = me
    ? Object.fromEntries((mine.data?.pages[0]?.items ?? []).map((s) => [s.id, s]))
    : devicePublished;
  const counts: Record<Tab, number> = {
    saved: Object.keys(stickers).length,
    sounds: Object.keys(sounds).length,
    published: Object.keys(published).length,
  };
  const current = MY_SPACE_TABS.find((t) => t.id === tab) ?? MY_SPACE_TABS[0];

  return (
    <div>
      <div role="tablist" aria-label="Tu espacio" className="inline-flex max-w-full overflow-x-auto rounded-full bg-muted/60 p-1">
        {MY_SPACE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
              tab === t.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {counts[t.id] > 0 && <span className="font-mono text-[11px] opacity-70 tabular-nums">{counts[t.id]}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-5">
        {counts[tab] === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-stage px-6 py-10 text-center">
            <Mascot size={72} />
            <p className="font-pixel text-[11px] text-muted-foreground">AÚN NADA POR AQUÍ</p>
            <p className="max-w-sm text-[13px] text-muted-foreground">{current.empty}</p>
          </div>
        ) : tab === "sounds" ? (
          <ul className="space-y-0.5">
            {Object.values(sounds).map((s) => (
              <SoundRow key={s.id} sound={s} />
            ))}
          </ul>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {Object.values(tab === "saved" ? stickers : published).map((s) => (
              <StickerCard key={s.id} sticker={s} />
            ))}
          </div>
        )}
        {me ? (
          <p className="mt-3 text-[12px] text-muted-foreground">
            Sincronizado con tu cuenta{" "}
            <Link href={ROUTES.account} className="font-medium text-foreground underline-offset-4 hover:underline">
              @{me.handle}
            </Link>
            : lo ves igual en todos tus dispositivos.
          </p>
        ) : (
          <p className="mt-3 text-[12px] text-muted-foreground">
            Se guarda en este dispositivo.{" "}
            <button type="button" onClick={() => setLinkOpen(true)} className="font-medium text-foreground underline underline-offset-4">
              Entra con tu WhatsApp
            </button>{" "}
            para tenerlo en todos tus dispositivos.
          </p>
        )}
        <LinkDialog open={linkOpen} onOpenChange={setLinkOpen} />
      </div>
    </div>
  );
}
