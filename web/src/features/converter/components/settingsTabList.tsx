import type { ReactNode } from "react";
import { FrameIcon, PackIcon, TextIcon, TimerIcon, Volume2Icon } from "@/components/icons";

export type TabId = "time" | "sound" | "style" | "text" | "pack";

export const SETTINGS_TABS: { value: TabId; label: string; icon: ReactNode }[] = [
  { value: "time", label: "Tiempo", icon: <TimerIcon /> },
  { value: "sound", label: "Sonido", icon: <Volume2Icon /> },
  { value: "style", label: "Estilo", icon: <FrameIcon /> },
  { value: "text", label: "Texto", icon: <TextIcon /> },
  { value: "pack", label: "Pack", icon: <PackIcon /> },
];
