import type { CommunityFilters } from "@/features/community/store/filters";

/**
 * Hierarchical query keys (single source). Invalidating a prefix refreshes
 * everything under it: ["community"] → feed, sounds, ranking, stats.
 * Keys contain every variable their query function uses.
 */
export const queryKeys = {
  bot: { status: ["bot", "status"] as const, link: ["bot", "link"] as const },
  account: {
    all: ["account"] as const,
    me: ["account", "me"] as const,
    stickers: ["account", "stickers"] as const,
  },
  creators: {
    all: ["creators"] as const,
    top: ["creators", "top"] as const,
    profile: (handle: string) => ["creators", handle] as const,
    stickers: (handle: string) => ["creators", handle, "stickers"] as const,
  },
  community: {
    all: ["community"] as const,
    feed: (f: CommunityFilters) => ["community", "feed", f] as const,
    ranking: (period: string) => ["community", "ranking", period] as const,
    sounds: (p: { sort: string; q: string; limit?: number }) => ["community", "sounds", p] as const,
    sound: (id: string) => ["community", "sound", id] as const,
    stats: ["community", "stats"] as const,
  },
};
