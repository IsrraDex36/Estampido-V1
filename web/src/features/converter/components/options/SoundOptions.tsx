import { API_LIMITS } from "@contract";
import { type ComponentProps, type DragEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  CheckIcon,
  type IconProps,
  MicIcon,
  SoundLibraryIcon,
  UploadIcon,
  VideoIcon,
  XIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import { notify } from "@/lib/notify";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { recordingLimitFor } from "../../model/recording";
import { selectBusy, useConverterStore } from "../../store/converterStore";
import { useSegment } from "../segment/useSegment";
import { GroupedList, SwitchListRow } from "../ui/GroupedList";
import { type AudioWindowChange, AudioWindowEditor } from "./AudioWindowEditor";
import { CommunitySoundPicker } from "./CommunitySoundPicker";
import { RecordingPanel } from "./VoiceRecorder";

type Source = "voice" | "community" | "file";
const sourceOf = (file: File, community: boolean): Source =>
  community ? "community" : file.name.startsWith("Grabación") ? "voice" : "file";
const SOURCE_ICON: Record<Source, (p: IconProps) => ReactNode> = {
  voice: (p) => <MicIcon {...p} />,
  community: (p) => <SoundLibraryIcon {...p} />,
  file: (p) => <UploadIcon {...p} />,
};

/** «Sonido»: on/off, then pick where the sound comes from and which stretch plays. */
export function SoundOptions() {
  const { includeAudio, audioStartSec, audioDurationSec, durationSec, kind, audioFile, communitySound, disabled, update, selectAudioFile } =
    useConverterStore(
      useShallow((s) => ({
        includeAudio: s.options.includeAudio,
        audioStartSec: s.options.audioStartSec,
        audioDurationSec: s.options.audioDurationSec,
        durationSec: s.options.durationSec,
        kind: s.inputKind,
        audioFile: s.audioFile,
        communitySound: s.communitySound,
        disabled: selectBusy(s),
        update: s.updateOptions,
        selectAudioFile: s.selectAudioFile,
      })),
    );
  const seg = useSegment();

  const chooseAudio = (file: File | null) => {
    const error = selectAudioFile(file);
    if (error) notify.error(error);
  };

  const maxRecordSec = recordingLimitFor(kind, API_LIMITS.maxImageAudioSec);
  const recorder = useVoiceRecorder({
    maxSec: maxRecordSec,
    onDone: (file) => {
      chooseAudio(file);
      notify.success("Grabación lista: será el sonido del sticker.");
    },
  });
  const recording = recorder.state.kind === "recording";
  useEffect(() => {
    if (recorder.state.kind === "error") {
      notify.error(recorder.state.message);
      recorder.reset();
    }
  }, [recorder]);

  // Images: the sound IS the sticker's length (auto = to its end, up to the limit).
  // Videos/GIFs: as long as the clip, or trimmed shorter (audioDurationSec).
  const clipLen = seg.effective ?? seg.requested ?? seg.maxDuration;
  const wanted = seg.isImage
    ? durationSec === undefined
      ? undefined
      : clipLen
    : Math.min(audioDurationSec ?? clipLen, clipLen);
  const maxLen = seg.isImage ? seg.maxDuration : clipLen;
  const onWindow = ({ start, length }: AudioWindowChange) => {
    if (length === undefined) return update({ audioStartSec: start });
    if (seg.isImage) return update({ audioStartSec: start, durationSec: length });
    // Back to the clip's full length → follow the clip again.
    update({ audioStartSec: start, audioDurationSec: length >= clipLen - 0.05 ? undefined : length });
  };

  return (
    <div className="space-y-4">
      <GroupedList>
        <SwitchListRow
          id="audio"
          title="Con sonido"
          detail="Suena al tocar el sticker."
          checked={includeAudio}
          disabled={disabled}
          onCheckedChange={(v) => update({ includeAudio: v })}
        />
      </GroupedList>

      {includeAudio &&
        (audioFile ? (
          <div className="space-y-4 rounded-2xl bg-muted/60 p-4">
            <ChosenSound
              file={audioFile}
              source={sourceOf(audioFile, Boolean(communitySound))}
              communityTitle={communitySound?.title}
              resetLabel={kind === "video" ? "Usar el del video" : "Quitar"}
              disabled={disabled}
              onReset={() => chooseAudio(null)}
            />
            <AudioWindowEditor
              file={audioFile}
              start={audioStartSec}
              wanted={wanted}
              minSec={seg.minDuration}
              maxSec={maxLen}
              disabled={disabled}
              onChange={onWindow}
            />
          </div>
        ) : recording ? (
          <RecordingPanel recorder={recorder} maxSec={maxRecordSec} />
        ) : (
          <SourcePicker
            fromVideo={kind === "video"}
            maxRecordSec={maxRecordSec}
            requesting={recorder.state.kind === "requesting"}
            disabled={disabled}
            onRecord={() => void recorder.start()}
            onFile={chooseAudio}
          />
        ))}
    </div>
  );
}

/** The sound in use: where it comes from, its file, and a way back. */
function ChosenSound({
  file,
  source,
  communityTitle,
  resetLabel,
  disabled,
  onReset,
}: {
  file: File;
  source: Source;
  communityTitle?: string;
  resetLabel: string;
  disabled: boolean;
  onReset: () => void;
}) {
  const Icon = SOURCE_ICON[source];
  const title =
    source === "community" ? `De la comunidad · «${communityTitle ?? ""}»` : source === "voice" ? "Tu grabación" : "Archivo propio";
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sound-soft text-sound">
        <Icon className="size-5" weight="duotone" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] leading-tight font-medium">{title}</span>
        <span className="truncate text-[13px] text-muted-foreground" title={file.name}>
          {file.name} · {formatBytes(file.size)}
        </span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 rounded-full max-sm:size-9 max-sm:px-0"
        disabled={disabled}
        onClick={onReset}
        aria-label={resetLabel}
        title={resetLabel}
      >
        <XIcon data-icon="inline-start" className="max-sm:m-0" />
        <span className="max-sm:sr-only">{resetLabel}</span>
      </Button>
    </div>
  );
}

/** Three big choices (record / community / file); also accepts a dropped audio. */
function SourcePicker({
  fromVideo,
  maxRecordSec,
  requesting,
  disabled,
  onRecord,
  onFile,
}: {
  fromVideo: boolean;
  maxRecordSec: number;
  requesting: boolean;
  disabled: boolean;
  onRecord: () => void;
  onFile: (file: File) => void;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && !disabled) onFile(dropped);
  };

  return (
    <div
      className={cn(
        "space-y-3 rounded-2xl transition-[box-shadow,background-color]",
        dragging && "bg-sound-soft shadow-[0_0_0_2px_var(--sound)]",
      )}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {fromVideo ? (
        <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sound-soft text-sound">
            <VideoIcon className="size-5" weight="duotone" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] leading-tight font-medium">Sonido del video</span>
            <span className="text-[13px] text-muted-foreground">El del mismo tramo. O cámbialo:</span>
          </span>
          <CheckIcon className="size-5 shrink-0 text-sound" aria-label="En uso" />
        </div>
      ) : (
        <p className="px-1 text-[15px] font-medium">
          Elige de dónde sale el sonido <span className="ml-1 inline-block size-1.5 rounded-full bg-sound align-middle" aria-hidden />
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <SourceTile
          icon={<MicIcon weight="duotone" />}
          title={requesting ? "Permiso…" : "Grabar"}
          detail={`Tu voz · ${formatTime(maxRecordSec)}`}
          disabled={disabled || requesting}
          onClick={onRecord}
        />
        <CommunitySoundPicker
          disabled={disabled}
          trigger={<SourceTile icon={<SoundLibraryIcon weight="duotone" />} title="Comunidad" detail="Populares" disabled={disabled} />}
        />
        <SourceTile
          icon={<UploadIcon weight="duotone" />}
          title="Archivo"
          detail="Audio o video"
          disabled={disabled}
          onClick={() => pickerRef.current?.click()}
        />
      </div>
      <p className="hidden px-1 text-center text-[12px] text-muted-foreground sm:block">
        {dragging ? "Suelta el audio aquí." : "También puedes arrastrar un audio aquí."}
      </p>
      <input
        ref={pickerRef}
        type="file"
        accept="audio/*,video/*"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onFile(picked);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Big tappable card: icon bubble, title, one-line hint. Spreads props (works as a Radix trigger). */
function SourceTile({
  icon,
  title,
  detail,
  className,
  ...props
}: { icon: ReactNode; title: string; detail: string } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "group flex min-w-0 flex-col items-center gap-2 rounded-2xl bg-muted/60 px-2 py-4 text-center transition-[background-color,transform] outline-none",
        "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100",
        className,
      )}
      {...props}
    >
      <span className="grid size-11 place-items-center rounded-full bg-background text-sound shadow-sm transition-transform group-hover:scale-105 motion-reduce:group-hover:scale-100 [&_svg]:size-6">
        {icon}
      </span>
      <span className="text-[14px] leading-tight font-medium">{title}</span>
      <span className="w-full truncate text-[11px] leading-tight text-muted-foreground">{detail}</span>
    </button>
  );
}
