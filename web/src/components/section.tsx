import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Numbered surface: "01 · Clip". */
export function Section({
  index,
  title,
  children,
  className,
  aside,
}: {
  index: string;
  title: string;
  children: ReactNode;
  className?: string;
  aside?: ReactNode;
}) {
  return (
    <section className={cn("surface min-w-0 p-5 sm:p-6 2xl:p-7", className)} aria-labelledby={`sec-${index}`}>
      <header className="mb-5 flex items-center justify-between gap-3">
        <h2 id={`sec-${index}`} className="flex items-baseline gap-3">
          <span className="font-pixel text-xs text-muted-foreground">{index}</span>
          <span className="text-xl font-semibold tracking-tight 3xl:text-2xl">{title}</span>
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}
