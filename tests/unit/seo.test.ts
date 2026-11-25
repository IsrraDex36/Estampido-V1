import { describe, expect, it } from "vitest";
import { SEO_ROUTES, seoHead, sitemapXml, validVerification, withSeo } from "../../src/adapters/http/seo.js";
import { inlineScriptHashes } from "../../src/adapters/http/server.js";

describe("SEO helpers", () => {
  it("escapes values and keeps JSON-LD unable to close its script tag", () => {
    const head = seoHead('https://x.example"><b>', "/");
    expect(head).not.toContain('"><b>');
    expect(head).toContain("&quot;&gt;&lt;b&gt;");
    const ld = head.slice(head.indexOf('<script type="application/ld+json">'));
    expect(ld.indexOf("</script>")).toBe(ld.length - "</script>".length);
  });

  it("only the home page carries JSON-LD; every public route is in the sitemap", () => {
    expect(seoHead("https://e.mx", "/comunidad")).not.toContain("ld+json");
    const xml = sitemapXml("https://e.mx", "2026-11-25");
    expect(xml.match(/<url>/g)?.length).toBe(Object.keys(SEO_ROUTES).length);
    expect(xml).toContain("<lastmod>2026-11-25</lastmod>");
  });

  it("verification tokens are validated", () => {
    expect(validVerification("abcDEF123_-xyz")).toBe("abcDEF123_-xyz");
    expect(validVerification('x" onload="1')).toBeUndefined();
    expect(validVerification("short")).toBeUndefined();
    expect(seoHead("https://e.mx", "/", 'x" onload="1')).not.toContain("google-site-verification");
  });

  it("withSeo swaps only the marked block; without markers it's a no-op", () => {
    expect(withSeo("<head><!--seo:start--><title>a</title><!--seo:end--></head>", "<title>b</title>")).toContain(
      "<title>b</title>",
    );
    expect(withSeo("<head><title>a</title></head>", "<title>b</title>")).toBe("<head><title>a</title></head>");
  });

  it("CSP hashes skip JSON-LD data blocks (they vary per page and never run)", () => {
    const html = '<script>var a=1</script><script type="application/ld+json">{"x":1}</script>';
    expect(inlineScriptHashes(html)).toHaveLength(1);
  });
});
