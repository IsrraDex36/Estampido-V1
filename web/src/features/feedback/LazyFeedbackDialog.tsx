import { lazy, Suspense, useState } from "react";

const Real = lazy(() => import("./FeedbackDialog").then((m) => ({ default: m.FeedbackDialog })));

/**
 * Same API as FeedbackDialog, but its form code loads only the first time
 * it opens (then stays mounted so open/close animate normally).
 */
export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [used, setUsed] = useState(open);
  if (open && !used) setUsed(true);
  if (!used) return null;
  return (
    <Suspense fallback={null}>
      <Real open={open} onOpenChange={onOpenChange} />
    </Suspense>
  );
}
