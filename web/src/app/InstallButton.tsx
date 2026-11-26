import { DownloadIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useInstallPrompt } from "./useInstallPrompt";

/**
 * «Instalar» next to the main nav, only when the browser offers it. Installed,
 * Estampido shows up in Android's share sheet («Compartir» → Estampido).
 */
export function InstallButton({ className }: { className?: string }) {
  const { canInstall, install } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <button
      type="button"
      onClick={() => void install()}
      title="Instala Estampido: comparte videos directo desde WhatsApp o tu galería"
      aria-label="Instalar app"
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-sound/15 px-2.5 text-[13px] font-medium text-sound transition-colors hover:bg-sound/25 sm:px-3",
        className,
      )}
    >
      <DownloadIcon className="size-4" />
      <span className="hidden min-[400px]:inline">Instalar</span>
    </button>
  );
}
