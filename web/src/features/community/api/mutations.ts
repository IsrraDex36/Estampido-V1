import type { CommunitySound, CommunitySticker, PublishRequest } from "@contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { publishSticker, recordSoundUse } from "./endpoints";

/**
 * Publish a result. On success everything community-related is invalidated
 * (feed, ranking, sounds, stats). Errors: global toast with the API message.
 */
export function usePublish() {
  const qc = useQueryClient();
  return useMutation<CommunitySticker, Error, PublishRequest>({
    mutationKey: ["community", "publish"],
    mutationFn: publishSticker,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.community.all }),
  });
}

/**
 * +1 use of a sound (someone picked it). Fire-and-forget: silent on error
 * (it's a counter, the remix itself already worked). Bumps the cached count
 * optimistically, then lets the server's numbers win.
 */
export function useRecordSoundUse() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationKey: ["community", "sound-use"],
    mutationFn: recordSoundUse,
    meta: { errorMessage: false },
    onMutate: (id) => {
      qc.setQueryData<CommunitySound>(queryKeys.community.sound(id), (s) => (s ? { ...s, uses: s.uses + 1 } : s));
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["community", "sounds"] }),
        qc.invalidateQueries({ queryKey: queryKeys.community.stats }),
      ]),
  });
}
