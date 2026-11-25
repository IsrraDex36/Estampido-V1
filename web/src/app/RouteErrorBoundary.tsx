import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Mascot } from "@/components/pixel/Mascot";
import { Button } from "@/components/ui/button";
import { isChunkError } from "./errors";
import { ROUTES } from "./routes";

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[route]", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkError(error);
    return (
      <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
        <Mascot size={100} />
        <p className="font-pixel text-xs text-muted-foreground">{chunk ? "SIN CONEXIÓN CON LA PÁGINA" : "ALGO SE ROMPIÓ"}</p>
        <h1 className="display text-3xl sm:text-4xl">
          {chunk ? "No se pudo cargar esta sección" : "Esta página tuvo un problema"}
        </h1>
        <p className="max-w-md text-[14px] text-muted-foreground">
          {chunk
            ? "Revisa tu conexión y vuelve a intentarlo."
            : "Tu trabajo en otras secciones está a salvo. Puedes reintentar o volver a crear."}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button
            className="rounded-full"
            onClick={() => (chunk ? window.location.reload() : this.setState({ error: null }))}
          >
            Reintentar
          </Button>
          <Button asChild variant="secondary" className="rounded-full">
            <Link href={ROUTES.create}>Ir a crear</Link>
          </Button>
        </div>
      </div>
    );
  }
}

/** Per-route error boundary: a crash in one page never blanks the app, and navigating clears it. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  // New path → fresh boundary (the routed page remounts anyway).
  return <Boundary key={location}>{children}</Boundary>;
}
