import { Button } from "@/components/ui/button";
import { GhostBlock, GhostFrame } from "./Ghost";

/** Featured creators. */
export function CreatorsList() {
  return (
    <ul className="space-y-1">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-3 rounded-xl px-2 py-2">
          <GhostFrame className="size-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <GhostBlock className="h-2.5 w-24" />
            <GhostBlock className="h-2 w-16" />
          </div>
          <Button disabled size="sm" variant="ghost" className="rounded-full" title="Pronto">
            Seguir
          </Button>
        </li>
      ))}
    </ul>
  );
}
