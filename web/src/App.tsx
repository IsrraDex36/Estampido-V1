import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import { AppFooter } from "@/app/AppFooter";
import { AppHeader } from "@/app/AppHeader";
import { NotFound } from "@/app/NotFound";
import { Providers } from "@/app/providers";
import { ROUTES } from "@/app/routes";
import { useScrollTopOnNavigate } from "@/app/useScrollTopOnNavigate";
import { PixelBackground } from "@/components/pixel/PixelBackground";
import { CommunitySkeleton } from "@/features/community/components/CommunitySkeleton";
import { ConverterPage } from "@/features/converter/ConverterPage";

// Community is a separate chunk: the tool stays as light as before.
const CommunityPage = lazy(() => import("@/features/community/CommunityPage"));

function Shell() {
  useScrollTopOnNavigate();
  return (
    // isolate: own stacking context so the -z-10 backdrop sits above our bg.
    <div className="relative isolate min-h-svh overflow-x-clip bg-background text-foreground">
      <PixelBackground />
      <AppHeader />
      <main className="mx-auto w-full max-w-[1760px] px-5 sm:px-8 2xl:px-12">
        <Switch>
          <Route path={ROUTES.create} component={ConverterPage} />
          <Route path={ROUTES.community}>
            <Suspense fallback={<CommunitySkeleton />}>
              <CommunityPage />
            </Suspense>
          </Route>
          <Route component={NotFound} />
        </Switch>
      </main>
      <AppFooter />
    </div>
  );
}

export default function App() {
  return (
    <Providers>
      <Shell />
    </Providers>
  );
}
