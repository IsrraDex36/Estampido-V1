import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * App-wide providers: theme, motion (lazy feature bundle; respects reduced
 * motion), tooltips, toasts.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={250}>
            {children}
            <Toaster position="top-center" />
          </TooltipProvider>
        </MotionConfig>
      </LazyMotion>
    </ThemeProvider>
  );
}
