import { Mascot } from "@/components/pixel/Mascot";
import { PixelStage } from "@/components/pixel/PixelStage";
import { useConverterStore } from "../store/converterStore";

/** Big statement + Pum performing on an 8-bit VU-meter stage. */
export function Hero() {
  const hasFile = useConverterStore((s) => Boolean(s.file));
  return (
    <div className="relative isolate">
      <PixelStage className="inset-x-auto left-1/2 w-screen -translate-x-1/2" />
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
            Stickers que suenan.
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg 3xl:max-w-2xl 3xl:text-xl">
            Convierte un video, un GIF o una foto en un sticker de WhatsApp con sonido. Lo ajustamos para que entre en
            el límite.
          </p>
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
