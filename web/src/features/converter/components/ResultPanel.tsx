import type { ConvertResponse, WhatsAppStatus } from "@contract";
import {
  AudioLinesIcon,
  CircleGaugeIcon,
  ClockIcon,
  DownloadIcon,
  FilmIcon,
  ImageIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadUrl } from "@/lib/api";
import { formatBytes, formatSeconds } from "@/lib/format";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { ChatStickerPreview, ChatSurface, IncomingBubble } from "./ChatPreview";
import { SendToWhatsAppButton } from "./SendToWhatsAppButton";

const KIND = { video: "Video", animated: "GIF / animado", image: "Imagen" } as const;

export function ResultPanel({
  result,
  bot,
  onRefreshBot,
  onReset,
}: {
  result: ConvertResponse;
  bot: WhatsAppStatus | null;
  onRefreshBot: () => void;
  onReset: () => void;
}) {
  const { sticker, audio, source, segment, kind } = result;
  const usage = Math.min(100, Math.round((sticker.bytes / sticker.maxBytes) * 100));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <ChatStickerPreview key={sticker.url} stickerUrl={sticker.url} audioUrl={audio?.url ?? null} />

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{sticker.animated ? "Animado" : "Estático"}</Badge>
        <Badge variant={audio ? "default" : "outline"}>{audio ? `🔊 ${formatTime(audio.durationSec)}` : "Sin sonido"}</Badge>
        <Badge variant={sticker.withinLimit ? "outline" : "destructive"}>
          {formatBytes(sticker.bytes)} / {formatBytes(sticker.maxBytes)}
        </Badge>
      </div>

      {result.warnings.length > 0 && (
        <Alert className="border-amber-500/30 bg-amber-500/5">
          <TriangleAlertIcon className="text-amber-600 dark:text-amber-400" />
          <AlertDescription>
            <ul className="space-y-1">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <SendToWhatsAppButton resultId={result.id} hasAudio={Boolean(audio)} bot={bot} onRefreshBot={onRefreshBot} />

      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="outline">
          <a href={downloadUrl(sticker.url)}>
            <DownloadIcon data-icon="inline-start" />
            Sticker .webp
          </a>
        </Button>
        <Button asChild variant="outline" disabled={!audio} className={cn(!audio && "pointer-events-none opacity-50")}>
          <a href={audio ? downloadUrl(audio.url) : undefined} aria-disabled={!audio}>
            <DownloadIcon data-icon="inline-start" />
            Audio .ogg
          </a>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat icon={<CircleGaugeIcon />} label="Tamaño">
          <span>{usage}% del límite</span>
          <Progress value={usage} className={cn("mt-1.5 h-1", !sticker.withinLimit && "[&>*]:bg-destructive")} />
        </Stat>
        <Stat icon={sticker.animated ? <FilmIcon /> : <ImageIcon />} label="Imagen">
          {sticker.animated ? `${sticker.fps} fps · ${sticker.frames} frames` : "Estática"}
          <span className="block text-muted-foreground">calidad {sticker.quality}</span>
        </Stat>
        <Stat icon={<AudioLinesIcon />} label="Sonido">
          {audio ? (
            <>
              {formatTime(audio.durationSec)} · {formatBytes(audio.bytes)}
              {audio.gainDb ? <span className="block text-muted-foreground">volumen +{audio.gainDb} dB</span> : null}
            </>
          ) : (
            "—"
          )}
        </Stat>
        <Stat icon={<ClockIcon />} label="Fuente">
          {KIND[kind]} · {source.width}×{source.height}
          <span className="block text-muted-foreground">
            {kind === "video"
              ? `${formatTime(segment.startSec)} → ${formatTime(segment.startSec + segment.durationSec)}`
              : `listo en ${formatSeconds(result.elapsedMs / 1000, 1)}`}
          </span>
        </Stat>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Se borra a las {new Date(result.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcwIcon data-icon="inline-start" />
          Ajustar y repetir
        </Button>
      </div>
    </motion.div>
  );
}

function Stat({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-3 text-sm">
      <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </p>
      <div className="font-medium tabular-nums">{children}</div>
    </div>
  );
}

/** Before any conversion: what the result will look like. */
export function EmptyResult() {
  return (
    <ChatSurface>
      <IncomingBubble>Sube un video, GIF o imagen y aquí verás tu sticker con sonido 👇</IncomingBubble>
      <div className="grid size-44 place-items-center self-end rounded-2xl border-2 border-dashed border-muted-foreground/25 text-xs text-muted-foreground sm:size-52">
        Tu sticker
      </div>
    </ChatSurface>
  );
}

/** While uploading/encoding. */
export function ProcessingResult({ label }: { label: string }) {
  return (
    <ChatSurface>
      <IncomingBubble>{label}</IncomingBubble>
      <Skeleton className="size-44 self-end rounded-2xl sm:size-52" />
    </ChatSurface>
  );
}
