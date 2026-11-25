import { useConverterStore } from "../store/converterStore";

/** Big statement when empty; steps aside once a clip is chosen. */
export function Hero() {
  const hasFile = useConverterStore((s) => Boolean(s.file));
  return (
    <div className="py-10 sm:py-14 2xl:py-16">
      <h1
        className={
          hasFile
            ? "display text-4xl sm:text-5xl"
            : "display text-5xl sm:text-7xl 2xl:text-8xl 3xl:text-[7.5rem]"
        }
      >
        Stickers que suenan.
      </h1>
      <p className="mt-4 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg 3xl:max-w-2xl 3xl:text-xl">
        Convierte un video, un GIF o una foto en un sticker de WhatsApp con sonido. Lo ajustamos para que entre en el
        límite.
      </p>
    </div>
  );
}
