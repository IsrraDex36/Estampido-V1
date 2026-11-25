import { cn } from "@/lib/utils";
import { CATEGORIES, FEED_SORTS, type FeedSort, TOP_PERIODS, type TopPeriod } from "../model";

/** Sort tabs (+ period for Top) and category chips. Works now; filters real data later. */
export function FeedToolbar({
  sort,
  period,
  category,
  onSort,
  onPeriod,
  onCategory,
}: {
  sort: FeedSort;
  period: TopPeriod;
  category: string | null;
  onSort: (s: FeedSort) => void;
  onPeriod: (p: TopPeriod) => void;
  onCategory: (c: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Orden" className="inline-flex rounded-full bg-muted/60 p-1">
          {FEED_SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={sort === s.id}
              onClick={() => onSort(s.id)}
              className={cn(
                "rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
                sort === s.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        {sort === "top" && (
          <div role="radiogroup" aria-label="Periodo" className="inline-flex gap-1">
            {TOP_PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={period === p.id}
                onClick={() => onPeriod(p.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[13px] transition-colors",
                  period === p.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {[null, ...CATEGORIES].map((c) => (
          <button
            key={c ?? "all"}
            type="button"
            aria-pressed={category === c}
            onClick={() => onCategory(c)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors",
              category === c
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
            )}
          >
            {c ?? "Todo"}
          </button>
        ))}
      </div>
    </div>
  );
}
