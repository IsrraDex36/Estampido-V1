import { useEffect, useRef } from "react";
import { useSelfStore } from "@/features/self/selfStore";

/**
 * «Entrar / vincular con WhatsApp». Everyone links THEIR OWN WhatsApp now
 * (the owner's bot number is optional), and that link also signs them in.
 * This keeps the old open/onOpenChange API for callers and drives the one
 * global SelfLinkDialog: open → show it; when it closes → report closed.
 */
export function LinkDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const selfOpen = useSelfStore((s) => s.dialog.open);
  const shown = useRef(false);
  useEffect(() => {
    if (open && !shown.current) {
      shown.current = true;
      useSelfStore.getState().openDialog();
    } else if (shown.current && !selfOpen) {
      shown.current = false;
      if (open) onOpenChange(false);
    }
  }, [open, selfOpen, onOpenChange]);
  return null;
}
