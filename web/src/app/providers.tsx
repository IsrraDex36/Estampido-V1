import { IconContext } from "@phosphor-icons/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { lazy, type ReactNode, Suspense } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createQueryClient } from "@/lib/query/client";

/** Stable object: a new one each render would re-render every icon. */
const ICONS = { weight: "bold", mirrored: false } as const;

/** One client for the app's lifetime (server-state cache + global error toasts). */
const queryClient = createQueryClient();

/** Devtools only in development, in their own lazy chunk (never in the production bundle). */
const QueryDevtools = import.meta.env.DEV
  ? lazy(() => import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools })))
  : null;

/**
 * App-wide providers: server state (TanStack Query), theme, icons (Phosphor
 * default weight), motion (lazy feature bundle; respects reduced motion),
 * tooltips, and the single global <Toaster /> used by lib/notify.
 */
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
      {QueryDevtools && (
        <Suspense fallback={null}>
          <QueryDevtools buttonPosition="bottom-left" />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
