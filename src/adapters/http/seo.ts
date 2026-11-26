import type { Context } from "hono";

/**
 * Search-engine and link-preview metadata for the SPA. The server owns it
 * because crawlers and chat previews (WhatsApp, Telegram, X…) read the HTML
 * before any JS runs, and absolute URLs need the real public origin — which
 * changes between Railway, Hetzner, a custom domain…
 */

export interface RouteSeo {
  title: string;
  description: string;
  /** Sitemap hints. */
  changefreq: "daily" | "weekly" | "monthly";
  priority: number;
}

const BRAND = "Estampido";

/** Public, indexable pages (keep in sync with web/src/app/routes.ts). */
export const SEO_ROUTES: Record<string, RouteSeo> = {
  "/": {
    title: `${BRAND} · Stickers de WhatsApp con sonido`,
    description:
      "Convierte tus videos, GIFs e imágenes en stickers de WhatsApp que suenan al tocarlos. Recorta el tramo, elige el sonido, el encuadre y el fondo, y mándalo a tu WhatsApp. Gratis.",
    changefreq: "weekly",
    priority: 1,
  },
  "/comunidad": {
    title: `Comunidad · Sonidos y stickers con sonido · ${BRAND}`,
    description:
      "Escucha los stickers con sonido más usados, busca sonidos virales y úsalos en tus propios clips para WhatsApp.",
    changefreq: "daily",
    priority: 0.8,
  },
  "/privacidad": {
    title: `Privacidad · ${BRAND}`,
    description:
      "Qué guarda Estampido y por cuánto tiempo: tus archivos se borran a los 30 minutos y solo se publica lo que tú decides.",
    changefreq: "monthly",
    priority: 0.3,
  },
};

const NOT_FOUND: Pick<RouteSeo, "title" | "description"> = {
  title: `Página no encontrada · ${BRAND}`,
  description: SEO_ROUTES["/"]?.description ?? "",
};

const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/**
 * Public origin: SVA_PUBLIC_URL when set (canonical, recommended), else the
 * request's own host — behind a trusted proxy, its X-Forwarded-* headers.
 * Hosts are validated so a forged Host can't inject markup.
 */
export function siteOrigin(c: Context, { publicUrl, trustProxy }: { publicUrl?: string; trustProxy: boolean }): string {
  if (publicUrl) {
    try {
      const u = new URL(publicUrl);
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch {
      // fall through to the request
    }
  }
  const forwardedHost = trustProxy ? c.req.header("x-forwarded-host")?.split(",")[0]?.trim() : undefined;
  const reqUrl = new URL(c.req.url);
  const host = forwardedHost && HOST_RE.test(forwardedHost) ? forwardedHost : reqUrl.host;
  const proto =
    trustProxy && c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() === "https"
      ? "https"
      : reqUrl.protocol.replace(":", "");
  return `${proto}://${HOST_RE.test(host) ? host : "localhost"}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Google Search Console token (letters, digits, - and _ only). */
export const validVerification = (token: string | undefined): string | undefined =>
  token && /^[A-Za-z0-9_-]{10,100}$/.test(token) ? token : undefined;

/** Pages that exist but must not be indexed (private). */
const PRIVATE_TITLES: Record<string, string> = {
  "/cuenta": `Mi cuenta · ${BRAND}`,
  "/admin": `Administración · ${BRAND}`,
};

/** Per-request page info (e.g. a creator profile) resolved by the server. */
export interface DynamicSeo {
  title: string;
  description: string;
}

/** The <head> block for one path. Unknown and private paths get noindex. Pure. */
export function seoHead(
  origin: string,
  path: string,
  googleVerification?: string,
  dynamic?: DynamicSeo | null,
): string {
  const route: Pick<RouteSeo, "title" | "description"> | undefined = dynamic ?? SEO_ROUTES[path];
  const privateTitle = PRIVATE_TITLES[path];
  const meta = route ?? (privateTitle ? { ...NOT_FOUND, title: privateTitle } : NOT_FOUND);
  const url = `${origin}${path}`;
  const image = `${origin}/og-image.png`;
  const lines = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    route ? `<link rel="canonical" href="${esc(url)}" />` : `<meta name="robots" content="noindex" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    ...(route ? [`<meta property="og:url" content="${esc(url)}" />`] : []),
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Estampido: stickers de WhatsApp con sonido" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ];
  const token = validVerification(googleVerification);
  if (token) lines.push(`<meta name="google-site-verification" content="${token}" />`);
  if (path === "/") {
    const ld = {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: BRAND,
      url: `${origin}/`,
      description: SEO_ROUTES["/"]?.description,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web, Android, iOS",
      inLanguage: "es",
      image,
      offers: { "@type": "Offer", price: "0", priceCurrency: "MXN" },
    };
    // `<` escaped so the JSON can never close the script tag.
    lines.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`);
  }
  return lines.join("\n    ");
}

const START = "<!--seo:start-->";
const END = "<!--seo:end-->";

/** Swap the default block in index.html (between the seo markers). Pure. */
export function withSeo(html: string, head: string): string {
  const a = html.indexOf(START);
  const b = html.indexOf(END);
  if (a < 0 || b < a) return html;
  return `${html.slice(0, a + START.length)}\n    ${head}\n    ${html.slice(b)}`;
}

/** sitemap.xml for the public pages. Pure. */
export function sitemapXml(origin: string, lastmod: string): string {
  const urls = Object.entries(SEO_ROUTES).map(
    ([path, r]) =>
      `  <url>\n    <loc>${esc(origin + path)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${r.changefreq}</changefreq>\n    <priority>${r.priority.toFixed(1)}</priority>\n  </url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

/** robots.txt: everything public, never the API or the owner page. Pure. */
export function robotsTxt(origin: string): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\n\nSitemap: ${origin}/sitemap.xml\n`;
}
