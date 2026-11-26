import type { CreatorProfile } from "@contract";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/account/api";
import { LinkDialog } from "@/features/bot/LinkDialog";
import { cn } from "@/lib/utils";
import { useFollow } from "./api";

/** «Seguir» / «Siguiendo» on a creator. Signed out → sign in first. Hidden on your own profile. */
export function FollowButton({ profile, className }: { profile: CreatorProfile; className?: string }) {
  const me = useMe().data;
  const follow = useFollow(profile.handle);
  const [linkOpen, setLinkOpen] = useState(false);
  if (me?.handle === profile.handle) return null;
  const following = profile.followedByMe === true;
  return (
    <>
      <Button
        variant={following ? "secondary" : "default"}
        className={cn("group/f rounded-full", className)}
        disabled={follow.isPending}
        aria-pressed={following}
        onClick={() => (me ? follow.mutate(!following) : setLinkOpen(true))}
      >
        {following ? (
          // «Dejar de seguir» only on real hover (mouse); touch keeps «Siguiendo».
          <span className="relative">
            <span className="group-hover/f:invisible">Siguiendo</span>
            <span className="invisible absolute inset-0 grid place-items-center whitespace-nowrap group-hover/f:visible">
              Dejar de seguir
            </span>
          </span>
        ) : (
          "Seguir"
        )}
      </Button>
      {!me && <LinkDialog open={linkOpen} onOpenChange={setLinkOpen} />}
    </>
  );
}
