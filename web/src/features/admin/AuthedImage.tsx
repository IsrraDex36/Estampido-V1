import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * <img> for files only the admin may see (hidden stickers answer 404 to the
 * public): fetched with the admin password, shown from a blob URL.
 */
export function AuthedImage({ src, token, className }: { src: string; token: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    const ctrl = new AbortController();
    fetch(src, { headers: { authorization: `Bearer ${token}` }, signal: ctrl.signal })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!b || revoked) return;
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      revoked = true;
      ctrl.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, token]);
  return url ? (
    <img src={url} alt="" className={className} />
  ) : (
    <span className={cn("block animate-pulse bg-muted", className)} aria-hidden />
  );
}
