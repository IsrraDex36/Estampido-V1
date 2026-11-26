import type { SendToWhatsAppResponse, WhatsAppLink } from "@contract";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  ApiError,
  createWhatsAppLink,
  deleteWhatsAppLink,
  getWhatsAppLink,
  getWhatsAppStatus,
  sendCommunityToWhatsApp,
  sendToWhatsApp,
} from "@/lib/api";
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
 * Send something to my own chat: a fresh result («result») or a community
 * sticker («community»). Errors toast globally (ApiError message); any failure
 * re-checks the bot so the UI reflects reality.
 */
export function useSendToWhatsApp(target: "result" | "community" = "result") {
  const qc = useQueryClient();
  return useMutation<SendToWhatsAppResponse, Error, string>({
    mutationKey: ["whatsapp", "send", target],
    mutationFn: (id) => (target === "community" ? sendCommunityToWhatsApp(id) : sendToWhatsApp(id)),
    onError: (err) => {
      void qc.invalidateQueries({ queryKey: queryKeys.bot.status });
      // Link removed elsewhere (other tab, bot number changed): refresh so the UI asks to link again.
      if (err instanceof ApiError && err.code === "not_linked") void qc.invalidateQueries({ queryKey: queryKeys.bot.link });
    },
  });
}

export const LINK_POLL_MS = 2_000;

/**
 * This browser's WhatsApp link. While a code is pending it polls every 2 s
 * (the user is sending it from WhatsApp) and stops as soon as it's linked.
 * Only runs when the bot is connected (otherwise there is nothing to ask).
 */
export const linkOptions = (enabled = true) =>
  queryOptions({
    queryKey: queryKeys.bot.link,
    queryFn: ({ signal }) => getWhatsAppLink(signal),
    enabled,
    staleTime: 10_000,
    retry: false,
    meta: { errorMessage: false },
    refetchInterval: (q) => (q.state.data?.state === "pending" ? LINK_POLL_MS : false),
  });

export function useLink() {
  const connected = useBotStatus()?.connected === true;
  return useQuery(linkOptions(connected));
}

export function useCreateLink() {
  const qc = useQueryClient();
  return useMutation<WhatsAppLink, Error, void>({
    mutationKey: ["whatsapp", "link"],
    mutationFn: () => createWhatsAppLink(),
    onSuccess: (link) => qc.setQueryData(queryKeys.bot.link, link),
  });
}

export function useUnlink() {
  const qc = useQueryClient();
  return useMutation<WhatsAppLink, Error, void>({
    mutationKey: ["whatsapp", "unlink"],
    mutationFn: () => deleteWhatsAppLink(),
    meta: { successMessage: "WhatsApp desvinculado de este navegador." },
    onSuccess: (link) => qc.setQueryData(queryKeys.bot.link, link),
  });
}
