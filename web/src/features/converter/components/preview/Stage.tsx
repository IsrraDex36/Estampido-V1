import { Mascot } from "@/components/pixel/Mascot";
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
      <div className="flex flex-col items-center gap-4 px-8 text-center">
        <Mascot size={120} interactive />
        <p className="font-pixel text-xs text-muted-foreground">PUM ESPERA TU CLIP</p>
        <p className="max-w-60 text-[13px] text-muted-foreground">Elige un clip y toca «Crear sticker».</p>
      </div>
    </Stage>
  );
}
