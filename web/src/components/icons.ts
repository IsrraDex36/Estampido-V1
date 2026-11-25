/**
 * The app's icon set (Phosphor). Components import icons only from here, by
 * meaning (SendIcon, MicIcon…), so the library can change in one place.
 *
 * Default weight comes from <IconContext> in app/providers ("bold" reads like
 * a 2px stroke at 16 px). Use weight to signal state, not decoration:
 *   - fill: active/on (playing, saved, voted, recording stop)
 *   - duotone: large illustrative icons (empty states, tiles, badges)
 */
export type { IconProps, IconWeight } from "@phosphor-icons/react";
export {
  ArrowFatUpIcon as VoteIcon,
  ArrowLineRightIcon as ArrowRightToLineIcon,
  ArrowUpIcon,
  BookmarkSimpleIcon as BookmarkIcon,
  CalendarDotsIcon as CalendarClockIcon,
  CaretDownIcon as ChevronDownIcon,
  CaretRightIcon as ChevronRightIcon,
  CaretUpIcon as ChevronUpIcon,
  CheckCircleIcon as CircleCheckIcon,
  CheckIcon,
  CircleNotchIcon as Loader2Icon,
  DotsThreeIcon as MoreHorizontalIcon,
  DownloadSimpleIcon as DownloadIcon,
  InfoIcon,
  LaptopIcon,
  MagnifyingGlassIcon as SearchIcon,
  MicrophoneIcon as MicIcon,
  MoonIcon,
  PaperPlaneTiltIcon as SendIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  ShareNetworkIcon as Share2Icon,
  SparkleIcon as SparklesIcon,
  SpeakerHighIcon as Volume2Icon,
  SpeakerSlashIcon as VolumeXIcon,
  StopIcon as SquareIcon,
  SunIcon,
  TimerIcon,
  TrashIcon as Trash2Icon,
  TrophyIcon,
  UploadSimpleIcon as UploadIcon,
  WarningCircleIcon as CircleAlertIcon,
  WarningIcon as TriangleAlertIcon,
  WaveformIcon as AudioWaveformIcon,
  XCircleIcon as OctagonXIcon,
  XIcon,
} from "@phosphor-icons/react";
