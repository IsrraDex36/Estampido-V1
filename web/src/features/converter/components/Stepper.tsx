import { CheckIcon } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const STEPS = ["Archivo", "Ajustes", "Resultado"] as const;

/** 0 = choose file, 1 = adjust, 2 = result. */
export function Stepper({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className="flex items-center gap-2 text-xs font-medium" aria-label="Progreso">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border transition-colors",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary text-primary ring-4 ring-primary/15",
                !done && !active && "text-muted-foreground",
              )}
            >
              {done ? <CheckIcon className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("hidden sm:inline", !active && !done && "text-muted-foreground")}>{label}</span>
            {i < STEPS.length - 1 && (
              <span className="relative h-px flex-1 overflow-hidden bg-border">
                <motion.span
                  className="absolute inset-y-0 left-0 bg-primary"
                  initial={false}
                  animate={{ width: done ? "100%" : "0%" }}
                  transition={{ duration: 0.35 }}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
