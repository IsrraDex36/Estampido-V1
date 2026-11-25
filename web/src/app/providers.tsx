import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { IconContext } from "@phosphor-icons/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

/** Server data cache (community). Local API: short stale time, no focus refetch storms. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}
