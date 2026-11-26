import type { CommunityCategory, CommunitySticker, PublishRequest } from "@contract";
import { ApiError } from "@/lib/api";
import type { CollectionItem } from "./collectionStore";

export type PublishOutcome = { published: number; failed: number; stopped?: string };

/**
 * Publish several stickers from the collection with ONE form (category, tags,
 * audio rights); titles stay empty (the community shows the category). One
 * after another, stopping on errors that would repeat (sign-in, limits).
 * Pure orchestration exported for tests.
 */
export async function publishMany(
  items: readonly CollectionItem[],
  req: { category: CommunityCategory; tags: string[]; ownsAudio: boolean },
  publish: (req: PublishRequest) => Promise<CommunitySticker>,
  onProgress: (done: number) => void,
): Promise<PublishOutcome> {
  let published = 0;
  let failed = 0;
  for (const [i, item] of items.entries()) {
    try {
      await publish({ resultId: item.id, category: req.category, tags: req.tags, ownsAudio: req.ownsAudio, share: "both" });
      published++;
    } catch (err) {
      failed++;
      // Errors every next one would hit too: stop instead of failing N times.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 409 || err.status === 429)) {
        return { published, failed, stopped: err.message };
      }
    }
    onProgress(i + 1);
  }
  return { published, failed };
}

