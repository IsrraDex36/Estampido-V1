import "vitest";

/** Values provided by e2e/global-setup.ts (inject("webUrl"), inject("clip")). */
declare module "vitest" {
  export interface ProvidedContext {
    webUrl: string;
    clip: string;
  }
}
