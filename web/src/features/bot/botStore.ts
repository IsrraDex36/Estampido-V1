import type { WhatsAppStatus } from "@contract";
import { useEffect } from "react";
import { create } from "zustand";
import { getWhatsAppStatus } from "@/lib/api";

interface BotState {
  /** null = still checking. */
  status: WhatsAppStatus | null;
  refresh: () => Promise<WhatsAppStatus>;
}

export const useBotStore = create<BotState>()((set) => ({
  status: null,
  refresh: async () => {
    const status = await getWhatsAppStatus();
    set({ status });
    return status;
  },
}));

const POLL_MS = 10_000;

/** Mount once (app shell): polls the bot while the tab is visible. */
export function useBotPolling(): void {
  useEffect(() => {
    const { refresh } = useBotStore.getState();
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
}
