import type { Me } from "@contract";
import { clientHeaders, readJson } from "@/lib/api";
import { useSelfStore } from "./selfStore";

const json = () => ({ ...clientHeaders(), "content-type": "application/json" });

export type LinkStatus =
  | { state: "waiting" }
  | { state: "qr"; qrSvg: string }
  | { state: "code"; code: string }
  /** The phone accepted; finishing (seconds). */
  | { state: "pairing"; step: "connecting" | "preparing" }
  /** `me`: linking also signs you in (null if the account is blocked). */
  | { state: "linked"; session: string; me?: Me | null }
  | { state: "failed"; reason: string };

export async function startLink(phone?: string): Promise<string> {
  const r = await readJson<{ id: string }>(
    await fetch("/api/self/link", { method: "POST", headers: json(), body: JSON.stringify(phone ? { phone } : {}) }),
  );
  return r.id;
}

export async function linkStatus(id: string): Promise<LinkStatus> {
  return readJson(await fetch(`/api/self/link/${encodeURIComponent(id)}`, { cache: "no-store", headers: clientHeaders() }));
}

/** Send to your own chat. The refreshed sealed session replaces the stored one. */
export async function sendToSelf(what: { results?: string[]; community?: string[]; pack?: string }): Promise<{ sent: number }> {
  const session = useSelfStore.getState().session;
  if (!session) throw new Error("not_linked");
  const r = await readJson<{ sent: number; session: string }>(
    await fetch("/api/self/send", { method: "POST", headers: json(), body: JSON.stringify({ session, ...what }) }),
  );
  useSelfStore.getState().setSession(r.session);
  return { sent: r.sent };
}

/** Remove this device from your WhatsApp and forget the session here. */
export async function unlinkSelf(): Promise<void> {
  const session = useSelfStore.getState().session;
  useSelfStore.getState().setSession(null);
  if (!session) return;
  await fetch("/api/self/logout", { method: "POST", headers: json(), body: JSON.stringify({ session }) }).catch(() => {});
}

/** Signed out but this browser is linked: sign in again with the sealed session (no WhatsApp connection). */
export async function signInWithSelf(): Promise<Me> {
  const session = useSelfStore.getState().session;
  if (!session) throw new Error("not_linked");
  return (
    await readJson<{ me: Me }>(
      await fetch("/api/self/signin", { method: "POST", headers: json(), body: JSON.stringify({ session }) }),
    )
  ).me;
}
