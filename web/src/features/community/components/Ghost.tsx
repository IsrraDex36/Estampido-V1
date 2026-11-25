import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Static placeholder block (not a loader: no shimmer — there is no data yet). */
export function GhostBlock({ className }: { className?: string }) {
  return <div className={cn("rounded-full bg-foreground/[0.06]", className)} aria-hidden />;
}

/** «Pronto · fase N» pill. */
export function SoonBadge({ phase, className }: { phase?: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-foreground/20 px-2.5 py-0.5 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-retro-a" aria-hidden />
      Pronto{phase ? ` · fase ${phase}` : ""}
    </span>
  );
}

/** Dashed frame for an area that will hold content. */
export function GhostFrame({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-foreground/15 bg-foreground/[0.02]", className)}>
      {children}
    </div>
  );
}
