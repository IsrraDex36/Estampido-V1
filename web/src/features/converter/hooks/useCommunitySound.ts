import type { CommunitySound } from "@contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSearch } from "wouter";
import { SOUND_PARAM } from "@/app/routes";
import { fetchSound, recordSoundUse, soundAsFile } from "@/features/community/data/api";
import { useConverterStore } from "../store/converterStore";


/**
 * Community sound → the converter's own audio (remix). Counts a «use» for
 * the sound's ranking.
 */
export function useApplyCommunitySound() {
  const selectAudioFile = useConverterStore((s) => s.selectAudioFile);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const apply = useCallback(
    async (sound: Pick<CommunitySound, "id" | "title" | "url">, signal?: AbortSignal) => {
      setLoadingId(sound.id);
      try {
        const file = await soundAsFile(sound, signal);
        const error = selectAudioFile(file, { id: sound.id, title: sound.title });
        if (error) throw new Error(error);
        void recordSoundUse(sound.id);
        const hasClip = useConverterStore.getState().file !== null;
        toast.success(`Sonido «${sound.title}» listo`, {
          description: hasClip ? "Toca «Crear sticker»." : "Ahora elige tu video, GIF, imagen o sticker.",
        });
        return true;
      } catch (err) {
        if (signal?.aborted) return false;
        toast.error(err instanceof Error ? err.message : "No se pudo usar ese sonido.");
        return false;
      } finally {
        setLoadingId(null);
      }
    },
    [selectAudioFile],
  );

  return { apply, loadingId };
}

/** Mount once (ConverterPage): consumes /?sonido=<id> once, then removes it from the URL. */
export function useCommunitySoundLink(): void {
  const { apply } = useApplyCommunitySound();
  const search = useSearch();
  // The download must outlive the URL change it triggers: abort only on unmount.
  const inflight = useRef<AbortController | null>(null);
  useEffect(() => () => inflight.current?.abort(), []);

  useEffect(() => {
    const id = new URLSearchParams(search).get(SOUND_PARAM);
    if (!id) return;
    // Consume the param right away so a reload doesn't re-apply it.
    const rest = new URLSearchParams(search);
    rest.delete(SOUND_PARAM);
    const q = rest.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${q ? `?${q}` : ""}`);

    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    fetchSound(id, controller.signal)
      .then((sound) => apply(sound, controller.signal))
      .catch(() => {
        if (!controller.signal.aborted) toast.error("Ese sonido ya no existe en la comunidad.");
      });
  }, [search, apply]);
}
