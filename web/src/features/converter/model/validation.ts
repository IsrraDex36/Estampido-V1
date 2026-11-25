import { API_LIMITS } from "@contract";

const mb = (bytes: number) => `${bytes / 1024 / 1024} MB`;

/** Client-side checks before upload; returns an error message or null. Pure. */
export function validateFile(file: Pick<File, "type" | "size">): string | null {
  if (!/^(video|image)\//.test(file.type)) return "Sube un video, GIF o imagen.";
  if (file.size > API_LIMITS.maxUploadBytes) return `El archivo supera ${mb(API_LIMITS.maxUploadBytes)}.`;
  return null;
}

/** Replacement sound: any audio, or a video whose sound we reuse. Pure. */
export function validateAudioFile(file: Pick<File, "type" | "size">): string | null {
  if (!/^(audio|video)\//.test(file.type)) return "El archivo de sonido debe ser audio o video.";
  if (file.size > API_LIMITS.maxAudioBytes) return `El audio supera ${mb(API_LIMITS.maxAudioBytes)}.`;
  return null;
}
