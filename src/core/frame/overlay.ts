/**
 * Composite a transparent PNG (the meme text, drawn by the client at the
 * sticker's size) over the framed picture. Input 0 is the media, input 1 the
 * overlay; a single still frame is repeated over every video frame.
 *
 * `chain` is the -vf chain for input 0 (it may hold its own labeled pads).
 * Returns a -filter_complex graph whose output pad is OVERLAY_OUT.
 */
export const OVERLAY_OUT = "[sva_out]";

export function overlayGraph(chain: string, size: number): string {
  return [
    `[0:v]${chain}[sva_base]`,
    `[1:v]scale=${size}:${size}:flags=bicubic,format=rgba[sva_ov]`,
    `[sva_base][sva_ov]overlay=0:0:format=auto:eof_action=repeat,format=rgba${OVERLAY_OUT}`,
  ].join(";");
}
