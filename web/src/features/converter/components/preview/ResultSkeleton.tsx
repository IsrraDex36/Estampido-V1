import { cn } from "@/lib/utils";

const Bone = ({ className }: { className?: string }) => <div className={cn("shimmer rounded-full bg-muted", className)} />;

/** Mirrors the result layout (player, actions, details) while working. */
export function ResultSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="flex items-center gap-3">
        <Bone className="size-11" />
        <Bone className="h-1 flex-1" />
        <Bone className="h-3 w-12" />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Bone className="h-12" />
        <Bone className="h-12 w-12" />
      </div>
      <div className="space-y-3 rounded-2xl bg-muted/60 p-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex justify-between">
            <Bone className="h-3 w-20" />
            <Bone className="h-3 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
