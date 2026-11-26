import { useEffect } from "react";
import { useLocation } from "wouter";
import { ROUTES } from "./routes";

/**
 * Title + description per page while navigating inside the app. The server
 * writes the same tags into the HTML for crawlers and link previews
 * (src/adapters/http/seo.ts — keep the texts in sync).
 */
const META: Record<string, { title: string; description: string }> = {
  [ROUTES.create]: {
    title: "Estampido · Stickers de WhatsApp con sonido",
    description:
      "Convierte tus videos, GIFs e imágenes en stickers de WhatsApp que suenan al tocarlos. Recorta el tramo, elige el sonido, el encuadre y el fondo, y mándalo a tu WhatsApp. Gratis.",
  },
  [ROUTES.community]: {
    title: "Comunidad · Sonidos y stickers con sonido · Estampido",
    description:
      "Escucha los stickers con sonido más usados, busca sonidos virales y úsalos en tus propios clips para WhatsApp.",
  },
  [ROUTES.account]: {
    title: "Mi cuenta · Estampido",
    description: "Tu perfil, tus stickers publicados y tu sesión en Estampido.",
  },
  [ROUTES.privacy]: {
    title: "Privacidad · Estampido",
    description:
      "Qué guarda Estampido y por cuánto tiempo: tus archivos se borran a los 30 minutos y solo se publica lo que tú decides.",
  },
};

export function useDocumentMeta(): void {
  const [pathname] = useLocation();
  useEffect(() => {
    if (pathname.startsWith("/u/")) return; // the creator page sets its own (needs the profile)
    const meta = META[pathname] ?? { title: "Página no encontrada · Estampido", description: "" };
    document.title = meta.title;
    if (meta.description) document.querySelector('meta[name="description"]')?.setAttribute("content", meta.description);
  }, [pathname]);
}
