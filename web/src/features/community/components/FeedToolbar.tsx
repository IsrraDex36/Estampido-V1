import { SearchIcon, XIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { CATEGORIES, FEED_SORTS, TOP_PERIODS } from "../model";
import { useCommunityStore } from "../store/communityStore";

/** Filter bar: sort (+ period for Top), search, category rail. State in the community store. (The tab bar above is the sticky one.) */
export function FeedToolbar() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <SortTabs />
        <PeriodPicker />
        <SearchBox />
      </div>
      <CategoryRail />
    </div>
  );
}

function SortTabs() {
  const sort = useCommunityStore((s) => s.sort);
  const setSort = useCommunityStore((s) => s.setSort);
  return (
    <div role="tablist" aria-label="Orden" className="inline-flex rounded-full bg-muted/60 p-1">
      {FEED_SORTS.map((s) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={sort === s.id}
          onClick={() => setSort(s.id)}
          className={cn(
            "rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
            sort === s.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function PeriodPicker() {
  const show = useCommunityStore((s) => s.sort === "top");
  const period = useCommunityStore((s) => s.period);
  const setPeriod = useCommunityStore((s) => s.setPeriod);
  if (!show) return null;
  return (
    <div role="radiogroup" aria-label="Periodo" className="inline-flex gap-1">
      {TOP_PERIODS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={period === p.id}
          onClick={() => setPeriod(p.id)}
          className={cn(
            "rounded-full px-3 py-1.5 text-[13px] transition-colors",
            period === p.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function SearchBox() {
  const query = useCommunityStore((s) => s.query);
  const setQuery = useCommunityStore((s) => s.setQuery);
  return (
    <label className="relative ml-auto w-full sm:w-72 xl:w-96">
      <span className="sr-only">Buscar stickers</span>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={query}
        maxLength={80}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar stickers, sonidos, @creadores…"
        className="h-10 w-full rounded-full bg-muted/60 pr-10 pl-10 text-[14px] outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
      />
      {query && (
        <button
          type="button"
          aria-label="Borrar búsqueda"
          onClick={() => setQuery("")}
          className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </label>
  );
}

function CategoryRail() {
  const category = useCommunityStore((s) => s.category);
  const toggle = useCommunityStore((s) => s.toggleCategory);
  return (
    <div className="relative">
      <div
        role="group"
        aria-label="Categorías"
        className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [mask-image:linear-gradient(to_right,transparent,black_20px,black_calc(100%-40px),transparent)] [scrollbar-width:none] sm:-mx-8 sm:px-8 2xl:-mx-12 2xl:px-12"
      >
        {[null, ...CATEGORIES].map((c) => {
          const id = c?.id ?? null;
          const active = category === id;
          return (
            <button
              key={id ?? "all"}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
              )}
            >
              {c && <span aria-hidden>{c.emoji}</span>}
              {c?.label ?? "Todo"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
