import { useEffect, useRef } from "react";
import { Loader2Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";

/**
 * End of a paginated list: auto-loads when it scrolls into view
 * (IntersectionObserver, 1200 px early — also when jumping to the page end past the footer) and offers «Cargar más» as the
 * accessible fallback. Shows the end and retries on error.
 */
export function InfiniteFooter({
  hasNext,
  loading,
  error,
  onMore,
  endLabel = "No hay más por ahora.",
}: {
  hasNext: boolean;
  loading: boolean;
  error: boolean;
  onMore: () => void;
  endLabel?: string;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const onMoreRef = useRef(onMore);
  useEffect(() => {
    onMoreRef.current = onMore;
  }, [onMore]);

  const auto = hasNext && !loading && !error;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !auto || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && onMoreRef.current(), {
      rootMargin: "1200px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [auto]);

  return (
    <div ref={sentinel} className="flex min-h-14 items-center justify-center pt-5" aria-live="polite">
      {error ? (
        <Button variant="secondary" size="sm" className="rounded-full" onClick={onMore}>
          No se pudo cargar · Reintentar
        </Button>
      ) : loading ? (
        <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> Cargando…
        </span>
      ) : hasNext ? (
        <Button variant="ghost" size="sm" className="rounded-full" onClick={onMore}>
          Cargar más
        </Button>
      ) : (
        <span className="text-[12px] text-muted-foreground">{endLabel}</span>
      )}
    </div>
  );
}
