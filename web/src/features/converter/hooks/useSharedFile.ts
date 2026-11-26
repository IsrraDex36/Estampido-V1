import { useEffect } from "react";
import { takeSharedFile } from "@/app/sharedFile";
import { notify } from "@/lib/notify";
import { useConverterStore } from "../store/converterStore";

/**
 * Something was shared to Estampido (Android share sheet): load it. A video,
 * GIF or image becomes the clip; an audio (e.g. a WhatsApp voice note)
 * becomes the sticker's sound.
 */
export function useSharedFile() {
  useEffect(() => {
    let alive = true;
    void takeSharedFile().then((file) => {
      if (!alive || !file) return;
      const s = useConverterStore.getState();
      const isAudio = file.type.startsWith("audio/") || /\.(opus|ogg|mp3|m4a|wav)$/i.test(file.name);
      const error = isAudio ? s.selectAudioFile(file) : s.selectFile(file);
      if (error) {
        notify.error(error);
        return;
      }
      if (isAudio) {
        s.setSettingsTab("sound");
        notify.success(s.file ? "Listo: ese audio ahora es el sonido del sticker." : "Audio listo. Ahora elige el video, GIF o foto.");
      } else {
        notify.success("Listo: abrimos lo que compartiste.");
      }
    });
    return () => {
      alive = false;
    };
  }, []);
}
