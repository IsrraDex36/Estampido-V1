import { Volume2Icon, VolumeXIcon } from "@/components/icons";
import * as m from "motion/react-m";
import { cn } from "@/lib/utils";
import type { StickerPlayer } from "../../hooks/useStickerPlayer";
import { SyncedSticker } from "@/components/SyncedSticker";
import { Stage } from "./Stage";

/** The sticker, big and centered; tap to play like in a chat. */
export function StickerStage({ player, stickerUrl }: { player: StickerPlayer; stickerUrl: string }) {
  return (
    <Stage>
      <m.button
        type="button"
        onClick={player.toggle}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: player.playing ? 1.03 : 1 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        title={player.hasAudio ? (player.playing ? "Toca para pausar" : "Toca para escuchar") : "Sticker sin sonido"}
        aria-label={player.hasAudio ? (player.playing ? "Pausar el sticker" : player.status === "paused" ? "Continuar el sticker" : "Reproducir el sticker") : "Sticker generado"}
        className="size-[72%] rounded-2xl focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none"
      >
        <SyncedSticker
          src={stickerUrl}
          alt="Sticker generado"
          mode={player.status}
          getTime={player.getTime}
          eager
          className="size-full object-contain drop-shadow-[0_8px_24px_rgb(0_0_0/0.12)]"
        />
      </m.button>
      {player.hasAudio && (
        <button
          type="button"
          onClick={player.toggleMute}
          aria-label={player.muted ? "Activar sonido" : "Silenciar"}
          className={cn(
            "absolute top-4 right-4 grid size-9 place-items-center rounded-full bg-card/90 shadow-sm backdrop-blur transition-colors",
            player.muted ? "text-muted-foreground" : "text-sound",
          )}
        >
          {player.muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
        </button>
      )}
    </Stage>
  );
}
