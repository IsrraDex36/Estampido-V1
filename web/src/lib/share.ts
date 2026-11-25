import { notify } from "./notify";

/** Phones: native share sheet with a .webp (e.g. straight into WhatsApp). */
export function canShareFiles(): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [new File([""], "x.webp", { type: "image/webp" })] })
    );
  } catch {
    return false;
  }
}

export async function shareSticker(url: string): Promise<void> {
  try {
    const blob = await (await fetch(url)).blob();
    await navigator.share({ files: [new File([blob], "estampido.webp", { type: "image/webp" })], title: "Sticker de Estampido" });
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "AbortError")) {
      notify.error("No se pudo compartir. Descárgalo y envíalo desde WhatsApp.");
    }
  }
}
