import { useState } from "react";
import { Link, useLocation } from "wouter";
import { creatorHref, ROUTES } from "@/app/routes";
import { UserCircleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBotStatus } from "@/features/bot/api";
import { LinkDialog } from "@/features/bot/LinkDialog";
import { FeedbackDialog } from "@/features/feedback/FeedbackDialog";
import { useLogout, useMe } from "./api";
import { Avatar } from "./Avatar";

/** Header: «Entrar» (with WhatsApp) or my avatar → profile, account, sign out. */
export function AccountMenu() {
  const me = useMe();
  const bot = useBotStatus();
  const logout = useLogout();
  const [linkOpen, setLinkOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [, navigate] = useLocation();

  // The dialog lives outside the branches: once the link lands and the session
  // opens, the button turns into the avatar but the dialog stays to confirm.
  const dialog = (
    <>
      <LinkDialog open={linkOpen} onOpenChange={setLinkOpen} />
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );

  if (me.data) {
    const user = me.data;
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Tu cuenta: ${user.displayName}`}
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar avatar={user.avatar} size={32} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-[14px] font-semibold">{user.displayName}</span>
              <span className="block truncate text-[12px] text-muted-foreground">@{user.handle}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate(creatorHref(user.handle))}>Mi perfil público</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate(ROUTES.account)}>Mi cuenta</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setFeedbackOpen(true)}>Enviar comentarios</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={logout.isPending} onSelect={() => logout.mutate()}>
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {dialog}
      </>
    );
  }

  // Signing in needs the bot (it receives the code); hide the button when it can't.
  if (me.isPending || !bot?.connected) return dialog;
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        className="rounded-full max-sm:size-9 max-sm:px-0"
        aria-label="Entrar con WhatsApp"
        onClick={() => setLinkOpen(true)}
      >
        <UserCircleIcon className="size-[18px] sm:hidden" />
        <span className="max-sm:sr-only">Entrar</span>
      </Button>
      {dialog}
    </>
  );
}

/** Small «@handle» link to a creator page. */
export function CreatorLink({ handle, className }: { handle: string; className?: string }) {
  return (
    <Link href={creatorHref(handle)} className={className}>
      @{handle}
    </Link>
  );
}
