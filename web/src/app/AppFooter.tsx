import { ArrowUpIcon, AudioWaveformIcon, GitHubIcon, StarIcon } from "@/components/icons";
import { useState } from "react";
import { Link } from "wouter";
import { ROUTES } from "./routes";
import { Button } from "@/components/ui/button";
import { BotStatus } from "@/features/bot/BotStatus";
import { FeedbackButton } from "@/features/feedback/FeedbackButton";
import { ThemeToggle } from "@/components/theme-toggle";
import { TourButton } from "@/features/onboarding/TourButton";

const AUTHOR = { handle: "IsrraDex36", url: "https://github.com/IsrraDex36" } as const;
const REPO_URL = "https://github.com/IsrraDex36/Estampido-V1";
const YEAR = new Date().getFullYear();

/** Simple, useful footer: star ask, brand, live bot status, privacy note, back-to-top, author. */
export function AppFooter() {
  return (
    <footer className="mx-auto mt-auto w-full max-w-[1760px] shrink-0 px-4 pt-10 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:pt-12 sm:pb-10 2xl:px-12">
      <StarCta />
      <div className="surface flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-center md:justify-between md:gap-6">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground" aria-hidden>
            <AudioWaveformIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="font-semibold tracking-tight">Estampido</p>
            <p className="text-[13px] text-muted-foreground">Haz ruido en el chat.</p>
          </div>
          {/* Phones: the guide and the theme switch (not in the header there) and back-to-top, next to the brand. */}
          <span className="flex items-center gap-1 sm:hidden">
            <TourButton />
            <ThemeToggle />
          </span>
          <Button
            variant="secondary"
            size="icon"
            className="shrink-0 rounded-full md:hidden"
            aria-label="Volver arriba"
            onClick={toTop}
          >
            <ArrowUpIcon />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-4 text-[12.5px] text-muted-foreground sm:text-[13px] md:border-0 md:pt-0">
          <div className="flex min-w-0 max-w-full items-center gap-3 max-md:w-full max-md:justify-between md:contents">
            <BotStatus alwaysLabel />
            <span className="font-mono tabular-nums md:order-last">v{__APP_VERSION__}</span>
          </div>
          <p>Tus archivos se borran a los 30 min.</p>
        </div>

        <Button variant="secondary" size="sm" className="hidden rounded-full md:inline-flex" onClick={toTop}>
          <ArrowUpIcon data-icon="inline-start" />
          Volver arriba
        </Button>
      </div>

      <div className="mt-5 flex flex-col items-center justify-between gap-2 text-center text-[12.5px] text-muted-foreground sm:mt-6 sm:flex-row sm:gap-3 sm:text-left sm:text-[13px]">
        <p>
          © {YEAR} Estampido ·{" "}
          <Link href={ROUTES.privacy} className="underline-offset-4 hover:text-foreground hover:underline">
            Privacidad y términos
          </Link>{" "}
          · <FeedbackButton>Enviar comentarios</FeedbackButton>
        </p>
        <a
          href={AUTHOR.url}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-center gap-2.5 rounded-full py-1 pr-3 pl-1 transition-colors hover:bg-muted"
        >
          <Avatar />
          <span>
            Desarrollado por <span className="font-medium text-foreground group-hover:underline">@{AUTHOR.handle}</span>
          </span>
        </a>
      </div>
    </footer>
  );
}

const toTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

/** Friendly ask for a GitHub star. Phones: icon + text in one row, full-width button below. */
function StarCta() {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noreferrer"
      className="group mb-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3.5 rounded-3xl border border-dashed border-border p-4 transition-colors hover:border-foreground/30 hover:bg-muted/40 sm:mb-4 sm:flex sm:gap-4 sm:p-6"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#ffd23f]/15 text-[#e0a800] transition-transform group-hover:rotate-12 group-hover:scale-110 motion-reduce:group-hover:transform-none sm:size-12 dark:text-[#ffd23f]">
        <StarIcon className="size-6 sm:size-7" weight="fill" />
      </span>
      <span className="min-w-0 space-y-0.5 sm:flex-1">
        <span className="block text-[15px] font-semibold leading-snug tracking-tight text-balance">
          ¿Te gustó Estampido?<span className="hidden sm:inline"> Déjale una estrella ⭐</span>
        </span>
        <span className="block text-[13px] leading-snug text-muted-foreground text-pretty">
          <span className="sm:hidden">Una estrella en GitHub ayuda a que más gente lo encuentre.</span>
          <span className="hidden sm:inline">
            Es un proyecto abierto y hecho con cariño. Una estrella en GitHub ayuda a que más gente lo encuentre. ¡Se
            agradece muchísimo!
          </span>
        </span>
      </span>
      <span className="col-span-2 inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background sm:h-auto sm:py-2">
        <GitHubIcon className="size-4" weight="fill" />
        Dar estrella en GitHub
      </span>
    </a>
  );
}

/** GitHub avatar with an initials fallback if it can't load (offline, blocked). */
function Avatar() {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="grid size-7 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
        ID
      </span>
    );
  }
  return (
    <img
      src={`${AUTHOR.url}.png?size=64`}
      alt={`Foto de perfil de ${AUTHOR.handle}`}
      width={28}
      height={28}
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-7 rounded-full ring-1 ring-border"
    />
  );
}
