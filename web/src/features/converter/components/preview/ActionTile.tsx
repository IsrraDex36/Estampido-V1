import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Secondary result action: icon bubble + title + hint, equal-width tiles.
 * Spreads props, so it works as a Radix trigger (asChild).
 */
export function ActionTile({
  icon,
  title,
  hint,
  done = false,
  className,
  ...props
}: { icon: ReactNode; title: ReactNode; hint: ReactNode; done?: boolean } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "group flex min-w-0 flex-col items-center gap-1.5 rounded-2xl bg-muted/60 px-2 py-3.5 text-center outline-none transition-[background-color,transform]",
        "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "grid size-10 place-items-center rounded-full shadow-sm transition-transform group-hover:scale-105 motion-reduce:group-hover:scale-100 [&_svg]:size-5",
          done ? "bg-sound text-background" : "bg-background text-foreground",
        )}
      >
        {icon}
      </span>
      <span className="text-[13px] leading-tight font-semibold">{title}</span>
      <span className="w-full truncate text-[11px] leading-tight text-muted-foreground">{hint}</span>
    </button>
  );
}
