import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import { AppFooter } from "@/app/AppFooter";
import { AppHeader } from "@/app/AppHeader";
import { NotFound } from "@/app/NotFound";
import { AdminPage } from "@/features/admin/AdminPage";
import { PrivacyPage } from "@/app/PrivacyPage";
import { Providers } from "@/app/providers";
import { RouteErrorBoundary } from "@/app/RouteErrorBoundary";
import { ROUTES } from "@/app/routes";
import { useCanonicalUrl } from "@/app/useCanonicalUrl";
import { useDocumentMeta } from "@/app/useDocumentMeta";
import { useScrollTopOnNavigate } from "@/app/useScrollTopOnNavigate";
import { PixelBackground } from "@/components/pixel/PixelBackground";
import { CommunitySkeleton } from "@/features/community/components/CommunitySkeleton";
import { loadCommunityPage } from "@/features/community/prefetch";
import { useAccountSync } from "@/features/account/useAccountSync";
import { ConverterPage } from "@/features/converter/ConverterPage";
import { WelcomeTour } from "@/features/onboarding/WelcomeTour";

// Community is a separate chunk: the tool stays as light as before.
// Same loader the nav prefetch uses → one shared chunk.
const CommunityPage = lazy(loadCommunityPage);
const AccountPage = lazy(() => import("@/features/account/AccountPage"));
const CreatorPage = lazy(() => import("@/features/account/CreatorPage"));

function Shell() {
  useCanonicalUrl();
  useDocumentMeta();
  useScrollTopOnNavigate();
  useAccountSync();
  return (
    // isolate: own stacking context so the -z-10 backdrop sits above our bg.
    // flex column + main flex-1: the footer sits at the bottom of the screen on short pages.
    <div className="relative isolate flex min-h-svh flex-col overflow-x-clip bg-background text-foreground">
      <PixelBackground />
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[1760px] flex-1 flex-col px-5 sm:px-8 2xl:px-12">
        <RouteErrorBoundary>
        <Switch>
          <Route path={ROUTES.create} component={ConverterPage} />
          <Route path={ROUTES.community}>
            <Suspense fallback={<CommunitySkeleton />}>
              <CommunityPage />
            </Suspense>
          </Route>
          <Route path={ROUTES.account}>
            <Suspense fallback={null}>
              <AccountPage />
            </Suspense>
          </Route>
          <Route path={ROUTES.creator}>
            <Suspense fallback={null}>
              <CreatorPage />
            </Suspense>
          </Route>
          <Route path={ROUTES.privacy} component={PrivacyPage} />
          <Route path={ROUTES.admin} component={AdminPage} />
          <Route component={NotFound} />
        </Switch>
        </RouteErrorBoundary>
      </main>
      <AppFooter />
      <WelcomeTour />
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
