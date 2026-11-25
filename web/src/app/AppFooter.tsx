import { ArrowUpIcon, AudioWaveformIcon, GitHubIcon, StarIcon } from "@/components/icons";
import { useState } from "react";
import { Link } from "wouter";
import { ROUTES } from "./routes";
import { Button } from "@/components/ui/button";
import { BotStatus } from "@/features/bot/BotStatus";

const AUTHOR = { handle: "IsrraDex36", url: "https://github.com/IsrraDex36" } as const;
const REPO_URL = "https://github.com/IsrraDex36/Estampido-V1";
const YEAR = new Date().getFullYear();

/** Simple, useful footer: brand, live bot status, privacy note, back-to-top, author. */
export function AppFooter() {
  return (
    <footer className="mx-auto mt-auto w-full max-w-[1760px] shrink-0 px-5 pt-12 pb-10 sm:px-8 2xl:px-12">
      <StarCta />
      <div className="surface flex flex-col gap-6 p-5 sm:p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground" aria-hidden>
            <AudioWaveformIcon className="size-5" />
          </span>
          <div className="leading-tight">
            <p className="font-semibold tracking-tight">Estampido</p>
            <p className="text-[13px] text-muted-foreground">Haz ruido en el chat.</p>
          </div>
        </div>

        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
          <li>
            <BotStatus />
          </li>
          <li>Tus archivos se borran a los 30 min.</li>
          <li className="font-mono tabular-nums">v{__APP_VERSION__}</li>
        </ul>

        <Button
          variant="secondary"
          size="sm"
          className="self-start rounded-full md:self-auto"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <ArrowUpIcon data-icon="inline-start" />
          Volver arriba
        </Button>
      </div>

      <div className="mt-6 flex flex-col items-center justify-between gap-3 text-[13px] text-muted-foreground sm:flex-row">
        <p>
          © {YEAR} Estampido ·{" "}
          <Link href={ROUTES.privacy} className="underline-offset-4 hover:text-foreground hover:underline">
            Privacidad y términos
          </Link>
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

/** Friendly ask for a GitHub star (the project is open source). */
function StarCta() {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noreferrer"
      className="group mb-4 flex flex-col gap-4 rounded-3xl border border-dashed border-border p-5 transition-colors hover:border-foreground/30 hover:bg-muted/40 sm:flex-row sm:items-center sm:p-6"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#ffd23f]/15 text-[#e0a800] transition-transform group-hover:rotate-12 group-hover:scale-110 motion-reduce:group-hover:transform-none dark:text-[#ffd23f]">
        <StarIcon className="size-7" weight="fill" />
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block text-[15px] font-semibold tracking-tight">¿Te gustó Estampido? Déjale una estrella ⭐</span>
        <span className="block text-[13px] leading-snug text-muted-foreground">
          Es un proyecto abierto y hecho con cariño. Una estrella en GitHub ayuda a que más gente lo encuentre. ¡Se agradece
          muchísimo!
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold text-background sm:self-auto">
        <GitHubIcon className="size-4" weight="fill" />
        Dar estrella
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
