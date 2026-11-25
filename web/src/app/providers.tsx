import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { IconContext } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * App-wide providers: theme, icons (Phosphor default weight), motion (lazy
 * feature bundle; respects reduced motion), tooltips, toasts.
 */
/** Stable object: a new one each render would re-render every icon. */
const ICONS = { weight: "bold", mirrored: false } as const;

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <IconContext.Provider value={ICONS}>
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={250}>
            {children}
            <Toaster position="top-center" />
          </TooltipProvider>
        </MotionConfig>
      </LazyMotion>
      </IconContext.Provider>
    </ThemeProvider>
  );
}
