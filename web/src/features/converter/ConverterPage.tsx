import { API_LIMITS, type WhatsAppStatus } from "@contract";
import { CircleAlertIcon, SparklesIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ConversionProgress } from "./components/ConversionProgress";
import { MediaDropzone } from "./components/MediaDropzone";
import { OptionsTabs } from "./components/OptionsTabs";
import { EmptyResult, ProcessingResult, ResultPanel } from "./components/ResultPanel";
import { Stepper } from "./components/Stepper";
import { useConverter } from "./hooks/useConverter";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Composition only: state in useConverter/useBotStatus, visuals in components/. */
export function ConverterPage({ bot, onRefreshBot }: { bot: WhatsAppStatus | null; onRefreshBot: () => void }) {
  const c = useConverter();
  const [currentTime, setCurrentTime] = useState<number>();
  const [sourceDuration, setSourceDuration] = useState<number>();
  const resultRef = useRef<HTMLDivElement>(null);

  const step: 0 | 1 | 2 = c.status.kind === "done" ? 2 : c.file ? 1 : 0;

  const handleSelect = (file: File | null) => {
    setCurrentTime(undefined);
    setSourceDuration(undefined);
    const error = c.selectFile(file);
    if (error) toast.error(error);
  };

  // On small screens, bring the result into view when it's ready.
  useEffect(() => {
    if (c.status.kind === "done" && window.matchMedia("(max-width: 1023px)").matches) {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [c.status.kind]);

  // Ctrl/⌘ + Enter converts.
  const { file, busy, convert } = c;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && file && !busy) {
        e.preventDefault();
        void convert();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, busy, convert]);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Convierte cualquier clip en un sticker que suena
          </h1>
          <p className="max-w-2xl text-sm text-pretty text-muted-foreground sm:text-base">
            Video de hasta {API_LIMITS.maxDurationSec / 60} min, GIF o imagen con tu voz. Se optimiza solo para entrar en el
            límite de WhatsApp.
          </p>
        </div>
        <Stepper current={step} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_25rem]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Tu archivo</CardTitle>
            <CardDescription>Elige el clip y ajusta tiempo, sonido y estilo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <MediaDropzone
              file={c.file}
              previewUrl={c.previewUrl}
              disabled={c.busy}
              onSelect={handleSelect}
              onTimeUpdate={setCurrentTime}
              onDurationChange={setSourceDuration}
              seekTo={c.options.startSec}
            />

            <AnimatePresence initial={false}>
              {c.file && c.inputKind && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-5 overflow-hidden"
                >
                  <Separator />
                  <OptionsTabs
                    options={c.options}
                    inputKind={c.inputKind}
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
                </motion.div>
              )}
            </AnimatePresence>

            {c.status.kind === "uploading" || c.status.kind === "processing" ? (
              <ConversionProgress status={c.status} onCancel={c.cancel} />
            ) : (
              <Button className="h-12 w-full text-base shadow-md shadow-primary/20" disabled={!c.file} onClick={c.convert}>
                <SparklesIcon data-icon="inline-start" />
                Crear sticker con sonido
                <kbd className="ml-2 hidden rounded border border-primary-foreground/30 px-1.5 font-mono text-[11px] opacity-80 sm:inline">
                  {isMac ? "⌘" : "Ctrl"} ↵
                </kbd>
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

        <aside ref={resultRef} className="scroll-mt-20 lg:sticky lg:top-20">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Vista previa</CardTitle>
              <CardDescription>Toca el sticker para escucharlo.</CardDescription>
            </CardHeader>
            <CardContent>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={c.status.kind === "done" ? c.status.result.id : c.busy ? "busy" : "empty"}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {c.status.kind === "done" ? (
                    <ResultPanel result={c.status.result} bot={bot} onRefreshBot={onRefreshBot} onReset={c.cancel} />
                  ) : c.busy ? (
                    <ProcessingResult
                      label={c.status.kind === "uploading" ? "Subiendo tu archivo… ⏳" : "Preparando tu sticker… 🎛️"}
                    />
                  ) : (
                    <EmptyResult />
                  )}
                </motion.div>
              </AnimatePresence>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
