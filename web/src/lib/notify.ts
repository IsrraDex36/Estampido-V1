import { type ExternalToast, toast } from "sonner";
import { ApiError } from "./api";

/**
 * The app's ONLY door to toasts (Sonner, mounted once in app/providers).
 * Components never import "sonner" directly: one place to change the
 * library, consistent wording, and de-duplication (same id → one toast).
 */

const FALLBACK = "Algo salió mal. Inténtalo de nuevo.";

/** User-facing message for any thrown value. Pure. */
export function errorMessage(err: unknown, fallback = FALLBACK): string {
  if (err instanceof ApiError) {
    if (err.status === 0 || err.code === "network") return "No hay conexión con el servidor.";
    return err.message || fallback;
  }
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) return "No hay conexión con el servidor.";
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}

/** Ignore user cancellations (AbortController). Pure. */
export const isAbort = (err: unknown): boolean =>
  (err instanceof DOMException && err.name === "AbortError") || (err instanceof ApiError && err.code === "aborted");

type Options = Pick<ExternalToast, "description" | "action" | "duration" | "id">;

export const notify = {
  success: (message: string, opts?: Options) => toast.success(message, opts),
  info: (message: string, opts?: Options) => toast.info(message, opts),
  /** A spinner toast that later turns into success/warning/error with the same id. */
  loading: (message: string, opts?: Options) => toast.loading(message, opts),
  warning: (message: string, opts?: Options) => toast.warning(message, opts),
  /** Accepts an error or a message. Same message → same toast (no stacking). */
  error: (errOrMessage: unknown, opts?: Options & { fallback?: string }) => {
    if (isAbort(errOrMessage)) return undefined;
    const message = typeof errOrMessage === "string" ? errOrMessage : errorMessage(errOrMessage, opts?.fallback);
    return toast.error(message, { id: opts?.id ?? `error:${message}`, ...opts });
  },
  /** Loading → success/error for one promise (returns the promise's value). */
  promise: <T>(promise: Promise<T>, msgs: { loading: string; success: string | ((v: T) => string); error?: string }) => {
    toast.promise(promise, {
      loading: msgs.loading,
      success: msgs.success,
      error: (err: unknown) => msgs.error ?? errorMessage(err),
    });
    return promise;
  },
  dismiss: (id?: string | number) => toast.dismiss(id),
};

export type Notifier = Pick<typeof notify, "success" | "error">;
