import { MediaDropzone } from "../components/MediaDropzone";
import { Section } from "@/components/section";

export function ClipSection({ className }: { className?: string }) {
  return (
    <Section index="01" title="Clip" className={className}>
      <MediaDropzone />
    </Section>
  );
}
