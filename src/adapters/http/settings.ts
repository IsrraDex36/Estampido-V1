import type { CommunityRepo } from "./community/repo.js";
import { HANDLE_RE } from "./contract.js";

/**
 * Owner settings stored in the database (edited from /admin, survive deploys).
 * Today: the handles with no per-account publishing quota (the owner).
 */
const UNLIMITED_KEY = "unlimited_handles";
export const MAX_UNLIMITED = 20;

/** «@Isrra », «isrra» → «isrra»; null if it can't be a handle. Pure. */
export function normalizeHandle(raw: string): string | null {
  const h = raw.trim().replace(/^@+/, "").toLowerCase();
  return HANDLE_RE.test(h) ? h : null;
}

export class SettingsRepo {
  private cache: Set<string> | null = null;

  constructor(private readonly community: CommunityRepo) {}

  async unlimitedHandles(): Promise<string[]> {
    if (this.cache) return [...this.cache];
    const db = await this.community.connection();
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(UNLIMITED_KEY) as
      | { value: string }
      | undefined;
    let list: string[] = [];
    try {
      const parsed = row ? (JSON.parse(row.value) as unknown) : [];
      if (Array.isArray(parsed)) list = parsed.filter((h): h is string => typeof h === "string" && HANDLE_RE.test(h));
    } catch {
      list = [];
    }
    this.cache = new Set(list);
    return list;
  }

  async isUnlimited(handle: string): Promise<boolean> {
    if (!this.cache) await this.unlimitedHandles();
    return this.cache?.has(handle) ?? false;
  }

  /** Replace the list (normalized, deduplicated, capped). Returns what was saved. */
  async setUnlimitedHandles(handles: string[]): Promise<string[]> {
    const list = [...new Set(handles.map(normalizeHandle).filter((h): h is string => h !== null))].slice(
      0,
      MAX_UNLIMITED,
    );
    const db = await this.community.connection();
    db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    ).run(UNLIMITED_KEY, JSON.stringify(list));
    this.cache = new Set(list);
    return list;
  }
}
