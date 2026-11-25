import { notify } from "@/lib/notify";

/** Native share sheet on phones; copy the link elsewhere. */
export async function shareLink(title: string, path: string): Promise<void> {
  const url = new URL(path, window.location.origin).href;
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    notify.success("Enlace copiado");
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return; // user closed the sheet
    notify.error("No se pudo compartir.");
  }
}
