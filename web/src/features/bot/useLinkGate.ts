import { useCallback, useEffect, useRef, useState } from "react";
import { useBotStatus, useLink } from "./api";

/**
 * «Send needs a linked WhatsApp». gate(action): runs it now if linked,
 * otherwise opens the link dialog and runs it as soon as the link lands
 * (the user sent the code from WhatsApp). Closing the dialog drops it.
 */
export function useLinkGate() {
  const link = useLink();
  // Owner's local mode: no link needed, the API sends to the bot's own chat.
  const selfSend = useBotStatus()?.selfSend === true;
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const linked = link.data?.state === "linked";

  const gate = useCallback(
    (action: () => void) => {
      if (linked || selfSend) return action();
      pending.current = action;
      setOpen(true);
    },
    [linked, selfSend],
  );

  useEffect(() => {
    if (!linked || !pending.current) return;
    const action = pending.current;
    pending.current = null;
    setOpen(false);
    action();
  }, [linked]);

  const onOpenChange = useCallback((v: boolean) => {
    setOpen(v);
    if (!v) pending.current = null;
  }, []);

  return { gate, linked, phone: link.data?.state === "linked" ? link.data.phone : null, dialog: { open, onOpenChange } };
}
