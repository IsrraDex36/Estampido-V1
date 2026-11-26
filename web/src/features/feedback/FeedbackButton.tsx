import { useState } from "react";
import { cn } from "@/lib/utils";
import { FeedbackDialog } from "./FeedbackDialog";

/** Text button that opens the feedback box (footer and menus). */
export function FeedbackButton({ className, children = "Enviar comentarios" }: { className?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("underline-offset-4 hover:text-foreground hover:underline", className)}>
        {children}
      </button>
      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
