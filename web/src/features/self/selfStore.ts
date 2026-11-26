import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * «Tu propio WhatsApp»: the sealed session lives ONLY in this browser (the
 * server can't use it without this copy, and keeps none). Cleared on unlink
 * or when WhatsApp drops the device.
 */
interface SelfState {
  session: string | null;
  linkedAt: number | null;
  /** The link dialog, opened from any «Enviar» (with what to send after linking). */
  dialog: { open: boolean; after?: () => void };
  setSession: (s: string | null) => void;
  openDialog: (after?: () => void) => void;
  closeDialog: () => void;
}

export const useSelfStore = create<SelfState>()(
  persist(
    (set) => ({
      session: null,
      linkedAt: null,
      dialog: { open: false },
      setSession: (session) => set((s) => ({ session, linkedAt: session ? (s.linkedAt ?? Date.now()) : null })),
      openDialog: (after) => set({ dialog: { open: true, after } }),
      closeDialog: () => set({ dialog: { open: false } }),
    }),
    {
      name: "estampido-wa-self",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ session: s.session, linkedAt: s.linkedAt }),
    },
  ),
);
