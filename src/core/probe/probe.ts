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
});

const probeSchema = z.object({
  streams: z.array(streamSchema).default([]),
  format: z.object({ duration: z.string().optional() }).default({}),
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
  const fromSide = stream.side_data_list?.find(
    (d) => typeof d.rotation === "number",
  )?.rotation;
  const raw =
    typeof fromSide === "number" ? fromSide : Number(stream.tags?.rotate ?? 0);
  return ((Math.round(raw) % 360) + 360) % 360;
}

export function parseProbeOutput(json: string): MediaInfo {
  const data = probeSchema.parse(JSON.parse(json));
  const video = data.streams.find((s) => s.codec_type === "video");
  const audio = data.streams.find((s) => s.codec_type === "audio");

  let width = video?.width ?? 0;
  let height = video?.height ?? 0;
  if (video && rotationOf(video) % 180 === 90)
    [width, height] = [height, width];

  const fps =
    parseFrameRate(video?.avg_frame_rate) ||
    parseFrameRate(video?.r_frame_rate);
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
