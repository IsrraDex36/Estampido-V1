import { useShallow } from "zustand/react/shallow";
import { deriveSegment, rangeToSegment, round1, type SegmentModel } from "../../model/segment";
import { selectBusy, useConverterStore } from "../../store/converterStore";
import { usePlaybackStore } from "../../store/playbackStore";

/** Store-connected segment model + actions (no playhead: it changes too often). */
export function useSegment(): SegmentModel & {
  disabled: boolean;
  setStart: (sec: number) => void;
  setDuration: (sec: number | undefined) => void;
  setRange: (range: number[]) => void;
} {
  const { options, kind, disabled, update } = useConverterStore(
    useShallow((s) => ({ options: s.options, kind: s.inputKind, disabled: selectBusy(s), update: s.updateOptions })),
  );
  const sourceDuration = usePlaybackStore((s) => s.duration);
  const model = deriveSegment(options, kind ?? "video", sourceDuration);

  return {
    ...model,
    disabled,
    setStart: (sec) => update({ startSec: round1(sec) }),
    setDuration: (d) =>
      update({ durationSec: d === undefined ? undefined : Math.min(model.maxDuration, Math.max(model.minDuration, d)) }),
    setRange: ([s = 0, e = 0]) => update(rangeToSegment([s, e], model.start, model.minDuration, model.maxDuration)),
  };
}
