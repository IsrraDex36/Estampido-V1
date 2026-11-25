import { CheckCheckIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSoundStickerPreview } from "../hooks/useSoundStickerPreview";
import { Equalizer } from "./Equalizer";

/** Generic chat surface (brand-free) used for the result and its placeholders. */
export function ChatSurface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("chat-wallpaper flex min-h-80 flex-col justify-end gap-2 rounded-2xl border p-4", className)}>
      {children}
    </div>
  );
}

/** Incoming text bubble (left). */
export function IncomingBubble({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[80%] self-start rounded-2xl rounded-tl-sm bg-card px-3 py-2 text-sm shadow-sm">{children}</div>
  );
}

const time = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** The result as it would appear sent in a chat: tap to play, speaker to mute. */
export function ChatStickerPreview({ stickerUrl, audioUrl }: { stickerUrl: string; audioUrl: string | null }) {
  const { imageSrc, playing, muted, hasAudio, play, toggleMute } = useSoundStickerPreview(stickerUrl, audioUrl);

  return (
    <ChatSurface>
      <IncomingBubble>¿Y el sticker con sonido? 👀</IncomingBubble>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="relative self-end"
      >
        <motion.button
          type="button"
          onClick={play}
          whileTap={{ scale: 0.94 }}
          title={hasAudio ? "Toca para reproducir" : "Toca para reiniciar"}
          className="block size-44 sm:size-52 focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <img src={imageSrc} alt="Sticker generado" className="size-full object-contain drop-shadow-md" />
        </motion.button>
        {hasAudio && (
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Activar sonido" : "Silenciar"}
            className="absolute top-1 right-1 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-white backdrop-blur transition hover:bg-black/70"
          >
            {playing ? <Equalizer /> : muted ? <VolumeXIcon className="size-3.5" /> : <Volume2Icon className="size-3.5" />}
          </button>
        )}
        <span className="mt-0.5 flex items-center justify-end gap-1 pr-1 text-[11px] text-muted-foreground">
          {time()}
          <CheckCheckIcon className="size-3.5 text-sky-500" />
        </span>
      </motion.div>
    </ChatSurface>
  );
}
