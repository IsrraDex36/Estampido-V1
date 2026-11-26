import { useCallback, useEffect, useRef, useState } from "react";
import { useMe } from "@/features/account/api";
import { useBotStatus, useLink } from "./api";

/**
 * «Send needs a linked WhatsApp» (or, with needsAccount, «publish needs to be
 * signed in» — signing in happens right after linking). gate(action): runs it
 * now if ready, otherwise opens the link dialog and runs it as soon as it is
 * (the user sent the code from WhatsApp). Closing the dialog drops it.
 */
export function useLinkGate({ needsAccount = false }: { needsAccount?: boolean } = {}) {
  const link = useLink();
  // Owner's local mode: no link needed, the API sends to the bot's own chat.
  const selfSend = useBotStatus()?.selfSend === true;
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const linked = link.data?.state === "linked";
  const signedIn = useMe().data != null;
  const ready = needsAccount ? signedIn : linked;

  const gate = useCallback(
    (action: () => void) => {
      if (ready || (selfSend && !needsAccount)) return action();
      pending.current = action;
      setOpen(true);
    },
    [ready, selfSend, needsAccount],
  );

  useEffect(() => {
    if (!ready || !pending.current) return;
    const action = pending.current;
    pending.current = null;
    setOpen(false);
    action();
  }, [ready]);

  const onOpenChange = useCallback((v: boolean) => {
    setOpen(v);
    if (!v) pending.current = null;
  }, []);

  return { gate, linked, phone: link.data?.state === "linked" ? link.data.phone : null, dialog: { open, onOpenChange } };
}
