import { recordPlay } from "./api/endpoints";

/** Stickers already counted in this page session (the server also dedupes per day). */
const counted = new Set<string>();

/** Count a listen once per page session: cheap on the network, honest for the ranking. */
export function trackPlay(stickerId: string): void {
  if (counted.has(stickerId)) return;
  counted.add(stickerId);
  recordPlay(stickerId);
}
