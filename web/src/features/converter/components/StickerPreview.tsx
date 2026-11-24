import { Volume2Icon, VolumeXIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSoundStickerPreview } from "../hooks/useSoundStickerPreview";

interface StickerPreviewProps {
  stickerUrl: string;
  audioUrl: string | null;
}

/** WhatsApp-like sound sticker: tap to play, speaker badge to mute. */
export function StickerPreview({ stickerUrl, audioUrl }: StickerPreviewProps) {
  const { imageSrc, playing, muted, hasAudio, play, toggleMute } = useSoundStickerPreview(stickerUrl, audioUrl);

  return (
    <div className="relative mx-auto w-fit">
      <button
        type="button"
        onClick={play}
        title={hasAudio ? "Toca para reproducir" : "Toca para reiniciar"}
        className={cn(
          "checkerboard block size-64 overflow-hidden rounded-xl border transition-transform active:scale-95",
          playing && "ring-2 ring-primary ring-offset-2",
        )}
      >
        <img src={imageSrc} alt="Sticker generado" className="size-full object-contain" />
      </button>
      {hasAudio && (
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Activar sonido" : "Silenciar"}
          className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white backdrop-blur"
        >
          {muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
        </button>
      )}
    </div>
  );
}
