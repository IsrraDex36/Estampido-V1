import type { ConvertResponse } from "@contract";
import * as m from "motion/react-m";
import { useStickerPlayer } from "../../hooks/useStickerPlayer";
import { PlayerBar } from "./PlayerBar";
import { ResultActions } from "./ResultActions";
import { ResultDetails } from "./ResultDetails";
import { ResultNotes } from "./ResultNotes";
import { StickerStage } from "./StickerStage";

/** Finished sticker: stage, player, actions, notes, specs. */
export function ResultView({ result }: { result: ConvertResponse }) {
  const player = useStickerPlayer(result.sticker.url, result.audio?.url ?? null);
  return (
    <div className="space-y-6">
      <StickerStage player={player} />
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05, ease: [0.2, 0, 0, 1] }}
        className="space-y-6"
      >
        <PlayerBar player={player} fallbackDuration={result.audio?.durationSec ?? 0} />
        <ResultActions result={result} />
        <ResultNotes warnings={result.warnings} />
        <ResultDetails result={result} />
        <p className="text-center text-[12px] text-muted-foreground">
          Disponible hasta las {new Date(result.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </m.div>
    </div>
  );
}
