import { useState } from "react";
import { Mascot } from "@/components/pixel/Mascot";
import { cn } from "@/lib/utils";
import { MY_SPACE_TABS } from "../model";

/** The signed-in user's corner: published, saved, voted. */
export function MySpace() {
  const [tab, setTab] = useState<(typeof MY_SPACE_TABS)[number]["id"]>("published");
  const current = MY_SPACE_TABS.find((t) => t.id === tab) ?? MY_SPACE_TABS[0];
  return (
    <div>
      <div role="tablist" aria-label="Tu espacio" className="inline-flex rounded-full bg-muted/60 p-1">
        {MY_SPACE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
              tab === t.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-5 flex flex-col items-center gap-3 rounded-3xl bg-stage px-6 py-10 text-center">
        <Mascot size={72} />
        <p className="font-pixel text-[11px] text-muted-foreground">AÚN NADA POR AQUÍ</p>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          {current.empty} Necesitarás una cuenta cuando abramos la comunidad.
        </p>
      </div>
    </div>
  );
}
