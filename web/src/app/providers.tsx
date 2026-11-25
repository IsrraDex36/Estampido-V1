import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/** App-wide providers: theme (class on <html>), tooltips, motion (respects reduced motion), toasts. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={250}>
          {children}
          <Toaster richColors position="top-center" />
        </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
