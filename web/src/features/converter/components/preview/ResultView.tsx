import type { ConvertResponse } from "@contract";
import * as m from "motion/react-m";
import { useStickerPlayer } from "../../hooks/useStickerPlayer";
import { PlayerBar } from "./PlayerBar";
import { ResultActions } from "./ResultActions";
import { ResultDetails } from "./ResultDetails";
import { ResultLayout } from "./ResultLayout";
import { ResultNotes } from "./ResultNotes";
import { StickerStage } from "./StickerStage";

/** Finished sticker: stage, player, actions, notes, specs. */
export function ResultView({ result }: { result: ConvertResponse }) {
  const player = useStickerPlayer(result.sticker.url, result.audio?.url ?? null);
  return (
    <ResultLayout stage={<StickerStage player={player} />}>
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05, ease: [0.2, 0, 0, 1] }}
        className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:gap-8 3xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]"
      >
        <div className="space-y-6">
          <PlayerBar player={player} fallbackDuration={result.audio?.durationSec ?? 0} />
          <ResultActions result={result} />
          <ResultNotes warnings={result.warnings} />
        </div>
        <div className="space-y-3">
          <ResultDetails result={result} />
          <p className="text-center text-[12px] text-muted-foreground xl:text-left">
            Disponible hasta las{" "}
            {new Date(result.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </m.div>
    </ResultLayout>
  );
}
