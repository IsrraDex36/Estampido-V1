import { Section } from "@/components/section";
import { UseSoundIcon, XIcon } from "@/components/icons";
import { MediaDropzone } from "../components/MediaDropzone";
import { selectBusy, useConverterStore } from "../store/converterStore";

export function ClipSection({ className }: { className?: string }) {
  return (
    <Section index="01" title="Clip" className={className} aside={<CommunitySoundBadge />}>
      <MediaDropzone />
    </Section>
  );
}

/** Remix in progress: the sound is already chosen, the clip is next. */
function CommunitySoundBadge() {
  const sound = useConverterStore((s) => (s.audioFile ? s.communitySound : null));
  const busy = useConverterStore(selectBusy);
  const clear = useConverterStore((s) => s.selectAudioFile);
  if (!sound) return null;
  return (
    <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-sound/15 py-1 pr-1 pl-3 text-[12px] text-foreground">
      <UseSoundIcon className="size-3.5 shrink-0 text-sound" weight="duotone" />
      <span className="truncate">
        Sonido: <span className="font-medium">«{sound.title}»</span>
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => clear(null)}
        aria-label="Quitar sonido de la comunidad"
        className="grid size-6 shrink-0 place-items-center rounded-full hover:bg-foreground/10"
      >
        <XIcon className="size-3" />
      </button>
    </span>
  );
}
