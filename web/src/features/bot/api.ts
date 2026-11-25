import type { SendToWhatsAppResponse } from "@contract";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { getWhatsAppStatus, sendToWhatsApp } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

export const BOT_POLL_MS = 10_000;

/**
 * Bot status, polled every 10 s while the tab is visible (TanStack pauses the
 * interval in the background). One cache entry shared by header, footer,
 * result and collection — no matter how many components read it, one request.
 * Never errors (an unreachable bot is "off"), so no global toast.
 */
export const botStatusOptions = () =>
  queryOptions({
    queryKey: queryKeys.bot.status,
    queryFn: ({ signal }) => getWhatsAppStatus(signal),
    refetchInterval: BOT_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
    retry: false,
    meta: { errorMessage: false },
  });

/** `undefined` while the first check runs. */
export function useBotStatus() {
  return useQuery(botStatusOptions()).data;
}

/** Re-check the bot now (e.g. after a failed send). */
export function useRefreshBot() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: queryKeys.bot.status }), [qc]);
}

/**
 * Send a result to my own chat. Errors toast globally (ApiError message);
 * any failure re-checks the bot so the UI reflects reality.
 */
export function useSendToWhatsApp() {
  const qc = useQueryClient();
  return useMutation<SendToWhatsAppResponse, Error, string>({
    mutationKey: ["whatsapp", "send"],
    mutationFn: (resultId) => sendToWhatsApp(resultId),
    onError: () => qc.invalidateQueries({ queryKey: queryKeys.bot.status }),
  });
}
