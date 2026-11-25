import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { prefetchCommunity } from "@/features/community/prefetch";
import { cn } from "@/lib/utils";
import { ROUTES } from "./routes";

const ITEMS = [
  { href: ROUTES.create, label: "Crear", prefetch: null },
  { href: ROUTES.community, label: "Comunidad", prefetch: prefetchCommunity },
] as const;

/** Primary navigation: the tool and the community. */
export function AppNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Principal" className={cn("inline-flex rounded-full bg-muted/60 p-1", className)}>
      {ITEMS.map((item) => (
        <NavItem key={item.href} {...item} />
      ))}
    </nav>
  );
}

function NavItem({
  href,
  label,
  prefetch,
}: {
  href: string;
  label: string;
  prefetch: ((qc: QueryClient) => void) | null;
}) {
  const [active] = useRoute(href);
  const qc = useQueryClient();
  // Prefetch on intent: by the time the click lands, code + data are warm.
  const warm = prefetch && !active ? () => prefetch(qc) : undefined;
  return (
    <Link
      href={href}
      onMouseEnter={warm}
      onFocus={warm}
      onTouchStart={warm}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full px-3.5 py-1 text-[13px] font-medium transition-colors sm:px-4",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
