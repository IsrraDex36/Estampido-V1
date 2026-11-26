import type { ReactNode } from "react";
import { FrameIcon, PackIcon, TextIcon, TimerIcon, Volume2Icon } from "@/components/icons";

import type { SettingsTabId } from "../store/converterStore";

export type TabId = SettingsTabId;

export const SETTINGS_TABS: { value: TabId; label: string; icon: ReactNode }[] = [
  { value: "time", label: "Tiempo", icon: <TimerIcon /> },
  { value: "sound", label: "Sonido", icon: <Volume2Icon /> },
  { value: "style", label: "Estilo", icon: <FrameIcon /> },
  { value: "text", label: "Texto", icon: <TextIcon /> },
  { value: "pack", label: "Pack", icon: <PackIcon /> },
];
