import { Link } from "wouter";
import { Mascot } from "@/components/pixel/Mascot";
import { Button } from "@/components/ui/button";
import { ROUTES } from "./routes";

export function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <Mascot size={110} />
      <p className="font-pixel text-xs text-muted-foreground">ERROR 404 · AQUÍ NO SUENA NADA</p>
      <h1 className="display text-4xl">Página no encontrada</h1>
      <Button asChild className="mt-2 rounded-full">
        <Link href={ROUTES.create}>Ir a crear un sticker</Link>
      </Button>
    </div>
  );
}
