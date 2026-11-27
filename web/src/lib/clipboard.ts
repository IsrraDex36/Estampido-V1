/**
 * Pasting media into the page: a screenshot, an image copied from a site or a
 * chat, or files copied in the file manager (desktop Chrome/Edge/Safari also
 * hand over videos that way). Pure helpers + one async read for the «Pegar»
 * button (phones have no Ctrl+V).
 */

const MEDIA = /^(image|video)\//;

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** Browsers name every pasted bitmap «image.png»: give it a name people recognise. */
const GENERIC = /^(image|blob|unknown)?(\.\w+)?$/i;

const pad = (n: number) => String(n).padStart(2, "0");

/** «Pegado 14-05.png». Pure. */
export function pastedName(type: string, now = new Date()): string {
  const ext = EXT[type] ?? type.split("/")[1]?.replace(/[^a-z0-9]/gi, "") ?? "bin";
  return `Pegado ${pad(now.getHours())}-${pad(now.getMinutes())}.${ext || "bin"}`;
}

function named(file: File, now: Date): File {
  if (!GENERIC.test(file.name)) return file; // a real file copied from disk keeps its name
  return new File([file], pastedName(file.type, now), { type: file.type, lastModified: file.lastModified });
}

/** Image/video files inside a paste (others ignored). Pure. */
export function mediaFromPaste(data: Pick<DataTransfer, "files" | "items"> | null, now = new Date()): File[] {
  if (!data) return [];
  let files = [...(data.files ?? [])];
  // Some browsers only expose pasted bitmaps as items.
  if (files.length === 0) {
    files = [...(data.items ?? [])]
      .filter((i) => i.kind === "file")
      .map((i) => i.getAsFile())
      .filter((f): f is File => f !== null);
  }
  return files.filter((f) => MEDIA.test(f.type)).map((f) => named(f, now));
}

const isEditable = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && !["button", "checkbox", "radio", "range", "file", "submit", "color"].includes(el.type);
};

/**
 * Should the page take this paste as a clip? Not while a dialog is open, and
 * not when someone pastes text into a field (a title, a phone number). Pure.
 */
export function wantsMediaPaste(
  target: EventTarget | null,
  data: Pick<DataTransfer, "types"> | null,
  doc: Pick<Document, "querySelector"> = document,
): boolean {
  if (!data) return false;
  if (doc.querySelector('[role="dialog"], [role="alertdialog"]')) return false;
  const types = [...(data.types ?? [])];
  if (!types.includes("Files")) return false;
  // Copying from a web page often carries text too: in a field, text wins.
  return !(isEditable(target) && types.includes("text/plain"));
}

/** The browser can read images from the clipboard on a tap (no keyboard needed). */
export const canReadClipboard = (): boolean =>
  typeof navigator !== "undefined" && typeof navigator.clipboard?.read === "function" && globalThis.isSecureContext !== false;

export type ClipboardRead = { files: File[] } | { error: string };

/** «Pegar» button: the first image/video on the clipboard. Asks permission if needed. */
export async function readClipboardMedia(clipboard: Pick<Clipboard, "read"> = navigator.clipboard, now = new Date()): Promise<ClipboardRead> {
  let items: ClipboardItems;
  try {
    items = await clipboard.read();
  } catch (err) {
    if (err instanceof DOMException && err.name === "NotAllowedError")
      return { error: "Permite el acceso al portapapeles para pegar, o usa + para elegir el archivo." };
    return { error: "No se pudo leer el portapapeles. Usa + para elegir el archivo." };
  }
  for (const item of items) {
    // GIF first (keeps the animation when the browser offers it), then any image/video.
    const type = item.types.find((t) => t === "image/gif") ?? item.types.find((t) => MEDIA.test(t));
    if (!type) continue;
    const blob = await item.getType(type);
    return { files: [new File([blob], pastedName(type, now), { type })] };
  }
  return { error: "No hay ninguna imagen copiada. Copia una imagen y vuelve a tocar «Pegar»." };
}
