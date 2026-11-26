import type { ConvertResponse } from "@contract";
import type { ReactNode } from "react";
import { formatBytes } from "@/lib/format";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const KIND = { video: "Video", animated: "GIF / animado", image: "Imagen" } as const;

/** Spec sheet (Apple-like): label left, value right, hairlines. */
export function ResultDetails({ result }: { result: ConvertResponse }) {
  const { sticker, audio, source, segment, kind } = result;
  const usage = sticker.bytes / sticker.maxBytes;
  return (
    <dl className="divide-y divide-border rounded-2xl bg-muted/60 px-4 text-[13px]">
      <Spec label="Tamaño">
        <span className={cn(!sticker.withinLimit && "text-destructive")}>
          {formatBytes(sticker.bytes)} <span className="text-muted-foreground">de {formatBytes(sticker.maxBytes)}</span>
        </span>
        <span className="mt-1.5 block h-1 w-28 overflow-hidden rounded-full bg-foreground/10">
          <span
            className={cn("block h-full origin-left rounded-full", sticker.withinLimit ? "bg-foreground" : "bg-destructive")}
            style={{ transform: `scaleX(${Math.min(1, usage)})` }}
          />
        </span>
      </Spec>
      <Spec label="Imagen">
        {sticker.animated ? `${sticker.fps} fps · ${sticker.frames} frames` : "Estática"}
        <span className="text-muted-foreground">
          {" "}
          · calidad {sticker.quality}
          {sticker.detail && sticker.detail < 512 ? ` · nitidez ${sticker.detail} px` : ""}
        </span>
      </Spec>
      <Spec label="Sonido">
        {audio ? (
          <>
            {formatTime(audio.durationSec)}
            <span className="text-muted-foreground">
              {" "}
              · {formatBytes(audio.bytes)}
              {audio.gainDb ? ` · +${audio.gainDb} dB` : ""}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Sin sonido</span>
        )}
      </Spec>
      <Spec label="Origen">
        {KIND[kind]} {source.width}×{source.height}
        {kind === "video" && (
          <span className="text-muted-foreground">
            {" "}
            · {formatTime(segment.startSec)}–{formatTime(segment.startSec + segment.durationSec)}
          </span>
        )}
      </Spec>
    </dl>
  );
}

function Spec({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}
