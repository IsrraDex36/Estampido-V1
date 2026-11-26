import type { ConvertResponse } from "@contract";
import { lazy, Suspense, useState } from "react";
import { useLocation } from "wouter";
import { ROUTES } from "@/app/routes";
import { CheckIcon, CommunityIcon, Loader2Icon } from "@/components/icons";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ActionTile } from "./ActionTile";

const loadForm = () => import("./PublishForm");
const PublishForm = lazy(() => loadForm().then((m) => ({ default: m.PublishForm })));

/** «Publicar»: share this result with the community (category, title, tags, audio rights). */
export function PublishButton({ result }: { result: ConvertResponse }) {
  const [open, setOpen] = useState(false);
  const [publishedId, setPublishedId] = useState<{ result: string; sticker: string } | null>(null);
  const [, navigate] = useLocation();
  const done = publishedId?.result === result.id;

  if (done) {
    return (
      <ActionTile
        done
        icon={<CheckIcon weight="bold" />}
        title="Publicado"
        hint="Ver"
        onClick={() => navigate(ROUTES.community)}
      />
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <ActionTile
          icon={<CommunityIcon weight="duotone" />}
          title="Publicar"
          hint="Comunidad"
          // Start fetching the form as soon as they reach for it.
          onPointerEnter={loadForm}
          onFocus={loadForm}
        />
      </DialogTrigger>
      <DialogContent>
        {open && (
          <Suspense
            fallback={
              <div className="grid h-64 place-items-center" aria-busy="true">
                <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <PublishForm
              result={result}
              onDone={(stickerId) => {
                setPublishedId({ result: result.id, sticker: stickerId });
                setOpen(false);
              }}
            />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}

