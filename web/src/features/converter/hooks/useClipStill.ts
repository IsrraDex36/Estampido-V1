import { useConverterStore } from "../store/converterStore";
import { usePlaybackStore } from "../store/playbackStore";
import { useFilmstrip } from "./useFilmstrip";

/** One still of the clip for small previews (style, pack): the image itself, or a video frame. */
export function useClipStill(): string | null {
  const previewUrl = useConverterStore((s) => s.previewUrl);
  const kind = useConverterStore((s) => s.inputKind);
  const duration = usePlaybackStore((s) => s.duration);
  const [frame] = useFilmstrip(kind === "video" ? previewUrl : null, duration, 1);
  return kind === "video" ? (frame ?? null) : previewUrl;
}
