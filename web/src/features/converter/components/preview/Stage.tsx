import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Neutral square stage where the sticker (or its placeholder) sits. */
export function Stage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative grid aspect-square w-full place-items-center overflow-hidden rounded-3xl bg-stage", className)}>
      {children}
    </div>
  );
}

export function EmptyStage() {
  return (
    <Stage>
      <div className="flex flex-col items-center gap-3 px-8 text-center">
        <span className="grid size-24 place-items-center rounded-[1.75rem] border-2 border-dashed border-foreground/15" aria-hidden>
          <span className="size-10 rounded-xl bg-foreground/10" />
        </span>
        <p className="text-[15px] font-medium">Aquí aparecerá tu sticker</p>
        <p className="max-w-60 text-[13px] text-muted-foreground">Elige un clip y toca «Crear sticker».</p>
      </div>
    </Stage>
  );
}
