import { CircleAlertIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConversionProgress } from "./components/ConversionProgress";
import { ConvertOptionsForm } from "./components/ConvertOptionsForm";
import { StickerResult } from "./components/StickerResult";
import { VideoDropzone } from "./components/VideoDropzone";
import { useConverter } from "./hooks/useConverter";

/** Composition only: state lives in useConverter, visuals in components/. */
export function ConverterPage() {
  const c = useConverter();
  const [currentTime, setCurrentTime] = useState<number>();
  const [sourceDuration, setSourceDuration] = useState<number>();

  const handleSelect = (file: File | null) => {
    setCurrentTime(undefined);
    setSourceDuration(undefined);
    const error = c.selectFile(file);
    if (error) toast.error(error);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>1. Video</CardTitle>
          <CardDescription>Elige el clip y el segmento (máx. 5 s).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <VideoDropzone
            file={c.file}
            previewUrl={c.previewUrl}
            disabled={c.busy}
            onSelect={handleSelect}
            onTimeUpdate={setCurrentTime}
            onDurationChange={setSourceDuration}
          />
          {c.file && (
            <ConvertOptionsForm
              options={c.options}
              disabled={c.busy}
              currentTime={currentTime}
              sourceDuration={sourceDuration}
              audioFile={c.audioFile}
              onChange={c.updateOptions}
              onAudioFileChange={(f) => {
                const error = c.selectAudioFile(f);
                if (error) toast.error(error);
              }}
            />
          )}
          {c.status.kind === "uploading" || c.status.kind === "processing" ? (
            <ConversionProgress status={c.status} onCancel={c.cancel} />
          ) : (
            <Button className="w-full" size="lg" disabled={!c.file} onClick={c.convert}>
              <SparklesIcon data-icon="inline-start" />
              Crear sticker con audio
            </Button>
          )}
          {c.status.kind === "error" && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertDescription>{c.status.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Resultado</CardTitle>
          <CardDescription>Toca el sticker para escucharlo, como en WhatsApp.</CardDescription>
        </CardHeader>
        <CardContent>
          {c.status.kind === "done" ? (
            <StickerResult result={c.status.result} onReset={c.cancel} />
          ) : (
            <div className="checkerboard flex aspect-square max-h-80 w-full items-center justify-center rounded-xl border text-sm text-muted-foreground">
              Aquí aparecerá tu sticker
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
