import type { ConvertFailure } from "../types";

export type FailureAction = "retry" | "choose_file" | "shorter" | "no_hq" | "feedback" | "signin";
export type FailureTone = "busy" | "file" | "connection" | "error";

export interface FailureView {
  tone: FailureTone;
  title: string;
  /** What happened, in plain words (the server's message when it's the most specific). */
  body: string;
  /** What usually fixes it. */
  tips: string[];
  /** Buttons, most useful first. */
  actions: FailureAction[];
  /** Busy: retry by itself after this many seconds. */
  autoRetrySec?: number;
}

/**
 * A conversion failure → what the card says and offers. Pure (tested).
 * Every code the API can answer has a human explanation and a next step.
 */
export function describeFailure(f: ConvertFailure, opts: { hq?: boolean } = {}): FailureView {
  switch (f.code) {
    case "signin_required":
      return {
        tone: "busy",
        title: "Entra con tu WhatsApp para crear",
        body: f.message,
        tips: ["Es gratis y toma 10 segundos: mandas un código desde tu WhatsApp."],
        actions: ["signin"],
      };
    case "busy":
      return {
        tone: "busy",
        title: "Mucha gente creando stickers ahora",
        body: "La fila está llena por un momento. No hace falta que hagas nada: lo intentamos de nuevo por ti.",
        tips: [],
        actions: ["retry"],
        autoRetrySec: Math.min(60, Math.max(5, f.retryAfterSec ?? 10)),
      };
    case "one_at_a_time":
      return {
        tone: "busy",
        title: "Ya tienes un sticker en proceso",
        body: "Solo se crea uno a la vez por persona (¿quizá en otra pestaña?). Espera a que termine o cancélalo.",
        tips: [],
        actions: ["retry"],
        autoRetrySec: Math.min(60, Math.max(5, f.retryAfterSec ?? 10)),
      };
    case "timeout":
      return {
        tone: "error",
        title: "Tardó demasiado",
        body: f.message,
        tips: ["Usa un tramo más corto (5–10 s es lo ideal).", ...(opts.hq ? ["Desactiva «Calidad alta»."] : [])],
        actions: ["shorter", ...(opts.hq ? (["no_hq"] as const) : []), "retry"],
      };
    case "too_large":
      return {
        tone: "file",
        title: "El archivo es muy pesado",
        body: f.message,
        tips: ["Recorta el video en tu celular antes de subirlo.", "Graba a menor resolución o usa un GIF."],
        actions: ["choose_file"],
      };
    case "bad_type":
    case "invalid_file":
      return {
        tone: "file",
        title: "Ese archivo no se puede usar",
        body: f.message,
        tips: ["Funcionan videos (MP4, MOV, WebM), GIFs, imágenes (JPG, PNG, WebP) y stickers."],
        actions: ["choose_file"],
      };
    case "unprocessable":
      return {
        tone: "file",
        title: "No pudimos leer el archivo",
        body: f.message,
        tips: ["Prueba exportarlo de nuevo desde tu galería o con otra app.", "Si es un video muy largo, recórtalo primero."],
        actions: ["choose_file", "retry"],
      };
    case "unavailable":
      return {
        tone: "connection",
        title: "Estampido se está actualizando",
        body: "No es tu archivo: el servidor se está reiniciando (tarda unos segundos). Lo intentamos de nuevo por ti.",
        tips: [],
        actions: ["retry"],
        autoRetrySec: Math.min(30, Math.max(5, f.retryAfterSec ?? 8)),
      };
    case "network":
    case "upload_failed":
      return {
        tone: "connection",
        title: "Se perdió la conexión",
        body: f.message,
        tips: ["Revisa tu internet (o cambia de Wi-Fi a datos) y vuelve a intentarlo."],
        actions: ["retry"],
      };
    case "expired":
      return {
        tone: "connection",
        title: "Ese proceso ya no existe",
        body: "El servidor se reinició o pasó mucho tiempo. Créalo de nuevo, solo toma unos segundos.",
        tips: [],
        actions: ["retry"],
      };
    case "bad_options":
    case "missing_file":
      return {
        tone: "error",
        title: "Algo no cuadró con los ajustes",
        body: f.message,
        tips: ["Revisa el tramo y el sonido elegidos."],
        actions: ["retry", "feedback"],
      };
    default:
      return {
        tone: "error",
        title: "Algo falló de nuestro lado",
        body: "No es tu archivo: tuvimos un problema al crear el sticker. Inténtalo de nuevo; si se repite, cuéntanos.",
        tips: [],
        actions: ["retry", "feedback"],
      };
  }
}
