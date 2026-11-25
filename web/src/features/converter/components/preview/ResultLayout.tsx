import type { ReactNode } from "react";

/**
 * Wide result row: stage on the left, everything else on the right.
 * Stacks on phones; the stage keeps a sensible size on big monitors.
 */
export function ResultLayout({
  stage,
  children,
  stretch = false,
}: {
  stage: ReactNode;
  children: ReactNode;
  /** Right side fills the stage height (empty state). */
  stretch?: boolean;
}) {
  return (
    <div className={`grid grid-cols-1 ${stretch ? "items-stretch" : "items-start"} gap-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] 2xl:gap-10 3xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]`}>
      <div className="mx-auto w-full max-w-sm md:max-w-none">{stage}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
