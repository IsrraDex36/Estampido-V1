import type { ConvertResponse } from "@contract";
import { CircleCheckIcon, DownloadIcon, RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { downloadUrl } from "@/lib/api";
import { formatBytes, formatSeconds } from "@/lib/format";
import { StickerPreview } from "./StickerPreview";

interface StickerResultProps {
  result: ConvertResponse;
  onReset: () => void;
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

export function StickerResult({ result, onReset }: StickerResultProps) {
  const { sticker, audio, source, segment, kind } = result;
  const kindLabel = { video: "Video", animated: "GIF / animado", image: "Imagen" }[kind];
  const percent = Math.round((sticker.bytes / sticker.maxBytes) * 100);

  return (
    <div className="space-y-6">
      <StickerPreview key={sticker.url} stickerUrl={sticker.url} audioUrl={audio?.url ?? null} />

      <div className="flex flex-wrap justify-center gap-2">
        <Badge variant={sticker.withinLimit ? "secondary" : "destructive"}>
          {sticker.withinLimit ? <CircleCheckIcon /> : <TriangleAlertIcon />}
          {formatBytes(sticker.bytes)} / {formatBytes(sticker.maxBytes)} ({percent}%)
        </Badge>
        <Badge variant="outline">{sticker.animated ? "Animado" : "Estático"}</Badge>
        <Badge variant="outline">
          {audio ? `Audio: ${audio.origin === "file" ? "archivo propio" : "del video"}` : "Sin audio"}
        </Badge>
      </div>

      {result.warnings.length > 0 && (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>Avisos</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <dl className="space-y-1.5">
        <Stat label="Sticker">
          {sticker.animated
            ? `${sticker.frames} frames · ${sticker.fps} fps · calidad ${sticker.quality}`
            : `estático · calidad ${sticker.quality}`}
        </Stat>
        {sticker.animated && <Stat label="Duración">{formatSeconds(sticker.durationMs / 1000, 2)}</Stat>}
        <Stat label="Intentos de optimización">{sticker.attempts}</Stat>
        <Stat label="Pack">
          {sticker.metadata
            ? `${sticker.metadata.packName} · ${sticker.metadata.publisher}${sticker.metadata.emojis.length ? ` · ${sticker.metadata.emojis.join(" ")}` : ""}`
            : "Sin metadatos"}
        </Stat>
        {audio && (
          <Stat label="Audio">
            Opus · {formatSeconds(audio.durationSec, 2)} · {formatBytes(audio.bytes)}
          </Stat>
        )}
        <Separator className="my-2" />
        <Stat label="Fuente">
          {kindLabel} · {source.width}×{source.height}
          {kind !== "image" && ` · ${source.fps.toFixed(0)} fps · ${formatSeconds(source.durationSec)}`}
        </Stat>
        {kind === "video" && (
          <Stat label="Segmento">
            {formatSeconds(segment.startSec)} → {formatSeconds(segment.startSec + segment.durationSec)}
          </Stat>
        )}
        <Stat label="Tiempo de proceso">{formatSeconds(result.elapsedMs / 1000, 2)}</Stat>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <a href={downloadUrl(sticker.url)}>
            <DownloadIcon data-icon="inline-start" />
            Sticker .webp
          </a>
        </Button>
        {audio && (
          <Button asChild variant="outline">
            <a href={downloadUrl(audio.url)}>
              <DownloadIcon data-icon="inline-start" />
              Audio .ogg
            </a>
          </Button>
        )}
        <Button variant="ghost" className="ml-auto" onClick={onReset}>
          <RotateCcwIcon data-icon="inline-start" />
          Otro ajuste
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Los archivos se borran a las {new Date(result.expiresAt).toLocaleTimeString()}.
      </p>
    </div>
  );
}
