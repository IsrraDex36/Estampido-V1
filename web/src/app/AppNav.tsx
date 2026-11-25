import { Link, useRoute } from "wouter";
import { cn } from "@/lib/utils";
import { ROUTES } from "./routes";

const ITEMS = [
  { href: ROUTES.create, label: "Crear" },
  { href: ROUTES.community, label: "Comunidad" },
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

function NavItem({ href, label }: { href: string; label: string }) {
  const [active] = useRoute(href);
  return (
    <Link
      href={href}
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
