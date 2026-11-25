import { StickerCardSkeleton } from "./StickerCard";

const Bone = ({ className }: { className: string }) => <div className={`shimmer rounded-full bg-muted ${className}`} />;

/** Route fallback while the community chunk loads: mirrors the real layout. */
export function CommunitySkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando comunidad">
      <div className="grid gap-8 pt-10 pb-6 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-end 2xl:pt-16">
        <div className="space-y-4">
          <Bone className="h-6 w-40" />
          <Bone className="h-14 w-full max-w-xl" />
          <Bone className="h-4 w-full max-w-md" />
          <div className="flex gap-2 pt-2">
            <Bone className="h-11 w-32" />
            <Bone className="h-11 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {["a", "b", "c"].map((k) => (
            <div key={k} className="shimmer h-24 rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
      <div className="flex gap-3 py-3">
        <Bone className="h-10 w-64" />
        <Bone className="ml-auto h-10 w-72" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="surface grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 sm:p-6 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => `s${i}`).map((k) => (
            <StickerCardSkeleton key={k} />
          ))}
        </div>
        <div className="surface hidden h-[36rem] lg:block" />
      </div>
    </div>
  );
}
