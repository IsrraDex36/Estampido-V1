import type { CommunitySticker } from "@contract";
import { Loader2Icon, Trash2Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDeleteMySticker } from "@/features/account/api";

/** Owner only: delete one of your published stickers (confirmed; can't be undone). */
export function DeleteStickerDialog({
  sticker,
  open,
  onOpenChange,
}: {
  sticker: CommunitySticker;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const remove = useDeleteMySticker();
  return (
    <Dialog open={open} onOpenChange={(v) => !remove.isPending && onOpenChange(v)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Eliminar este sticker?</DialogTitle>
          <DialogDescription>
            <span className="block truncate font-medium text-foreground">«{sticker.title}»</span>
            Se quita de la comunidad, de tu perfil y de los packs donde esté. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" className="rounded-full" disabled={remove.isPending} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            className="rounded-full"
            disabled={remove.isPending}
            onClick={() => remove.mutate(sticker.id, { onSuccess: () => onOpenChange(false) })}
          >
            {remove.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
            Eliminar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
