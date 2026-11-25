/** A lazy route chunk failed to download (offline, new deploy). Reloading fixes it. */
export const isChunkError = (err: unknown): boolean =>
  err instanceof Error && /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError/i.test(err.message);
