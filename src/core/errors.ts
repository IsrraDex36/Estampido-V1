/**
 * Errors caused by user input (bad file, start beyond end, …). The message is
 * user-facing (Spanish) and safe to show; adapters map these to 4xx/replies.
 * Anything else is an internal error and must not leak details.
 */
export class UserInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserInputError";
  }
}

export const formatMB = (bytes: number): string => `${Math.round(bytes / 1024 / 1024)} MB`;

/** The caller cancelled (client disconnected, /cancelar…). Not an error to report. */
export class CancelledError extends Error {
  constructor(message = "Cancelado.") {
    super(message);
    this.name = "CancelledError";
  }
}

/** Throw CancelledError if the signal already fired (cheap checkpoint between steps). */
export function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new CancelledError();
}
