import { z } from "zod";
import { ffprobePath, run } from "../../utils/ffmpeg.js";

export interface MediaInfo {
  /** Container duration in seconds. */
  durationSec: number;
  /** Display width/height after applying rotation metadata. */
  width: number;
  height: number;
  /** Average frame rate (frames/sec); 0 if unknown. */
  fps: number;
  hasVideo: boolean;
  hasAudio: boolean;
  videoCodec?: string;
  audioCodec?: string;
  /** ffprobe container name, e.g. "mov,mp4,…", "gif", "png_pipe". */
  formatName?: string;
}

/**
 * - video: regular video (sticker segment + its own sound)
 * - animated: GIF / animated WebP / APNG (no sound; loops)
 * - image: single still image (static sticker; sound must come from a file)
 */
export type MediaKind = "video" | "animated" | "image";

const ANIMATED_CODECS = new Set(["gif", "webp_anim", "apng"]);

export function classifyMedia(info: Pick<MediaInfo, "videoCodec" | "formatName">): MediaKind {
  const codec = info.videoCodec ?? "";
  const format = info.formatName ?? "";
  if (ANIMATED_CODECS.has(codec) || format === "gif" || format === "webp_anim" || format === "apng") return "animated";
  if (format === "image2" || format.endsWith("_pipe")) return "image";
  return "video";
}

const streamSchema = z.object({
  codec_type: z.string(),
  codec_name: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  avg_frame_rate: z.string().optional(),
  r_frame_rate: z.string().optional(),
  duration: z.string().optional(),
  tags: z.record(z.string(), z.string()).optional(),
  side_data_list: z.array(z.record(z.string(), z.unknown())).optional(),
  disposition: z.record(z.string(), z.number()).optional(),
});

const probeSchema = z.object({
  streams: z.array(streamSchema).default([]),
  format: z.object({ duration: z.string().optional(), format_name: z.string().optional() }).default({}),
});

type Stream = z.infer<typeof streamSchema>;

export function parseFrameRate(rate: string | undefined): number {
  if (!rate) return 0;
  const [num, den] = rate.split("/").map(Number);
  if (num === undefined || !Number.isFinite(num)) return 0;
  if (den === undefined) return num;
  return den > 0 ? num / den : 0;
}

function rotationOf(stream: Stream): number {
  const fromSide = stream.side_data_list?.find((d) => typeof d.rotation === "number")?.rotation;
  const raw = typeof fromSide === "number" ? fromSide : Number(stream.tags?.rotate ?? 0);
  return ((Math.round(raw) % 360) + 360) % 360;
}

export function parseProbeOutput(json: string): MediaInfo {
  const data = probeSchema.parse(JSON.parse(json));
  // Cover art in audio files (mp3/m4a) shows up as a video stream: ignore it.
  const video = data.streams.find((s) => s.codec_type === "video" && s.disposition?.attached_pic !== 1);
  const audio = data.streams.find((s) => s.codec_type === "audio");

  let width = video?.width ?? 0;
  let height = video?.height ?? 0;
  if (video && rotationOf(video) % 180 === 90) [width, height] = [height, width];

  const fps = parseFrameRate(video?.avg_frame_rate) || parseFrameRate(video?.r_frame_rate);
  const durationSec = Number(data.format.duration ?? video?.duration ?? 0) || 0;

  return {
    durationSec,
    width,
    height,
    fps,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    videoCodec: video?.codec_name,
    audioCodec: audio?.codec_name,
    formatName: data.format.format_name,
  };
}

export async function probe(input: string): Promise<MediaInfo> {
  const { stdout } = await run(ffprobePath(), [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    input,
  ]);
  return parseProbeOutput(stdout);
}
