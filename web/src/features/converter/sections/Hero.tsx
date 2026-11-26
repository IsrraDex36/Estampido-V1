import { useInstallPrompt } from "@/app/useInstallPrompt";
import { DownloadIcon } from "@/components/icons";
import { Mascot } from "@/components/pixel/Mascot";
import { useConverterStore } from "../store/converterStore";

/** Big statement + Pum singing. */
export function Hero() {
  const hasFile = useConverterStore((s) => Boolean(s.file));
  const { canInstall, install } = useInstallPrompt();
  return (
    <div className="relative isolate">
      <div className="flex items-end justify-between gap-6 py-10 sm:py-14 2xl:py-16">
        <div className="min-w-0">
          <p className="font-pixel mb-4 inline-flex items-center gap-2 rounded-md bg-foreground px-2.5 py-1 text-[11px] text-background">
            INSERT CLIP <span className="pixel-blink">▶</span>
          </p>
          <h1
            className={
              hasFile ? "display text-4xl sm:text-5xl" : "display text-5xl sm:text-7xl 2xl:text-8xl 3xl:text-[7.5rem]"
            }
          >
            Haz ruido en el chat.
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg 3xl:max-w-2xl 3xl:text-xl">
            Convierte cualquier video, GIF o foto en un sticker de WhatsApp que suena al tocarlo. Tú eliges el momento;
            Estampido lo deja listo para enviar.
          </p>
          {canInstall && (
            <button
              type="button"
              onClick={() => void install()}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-muted px-3.5 py-2 text-[13px] font-medium transition-colors hover:bg-muted/70"
            >
              <DownloadIcon className="size-4" />
              Instalar app
              <span className="font-normal text-muted-foreground">· comparte videos directo desde WhatsApp</span>
            </button>
          )}
        </div>
        <Mascot
          mood="singing"
          interactive
          size={hasFile ? 104 : 180}
          className="hidden shrink-0 sm:inline-block 3xl:scale-125"
        />
      </div>
    </div>
  );
}
