const KEY = "estampido-client";
let memory: string | null = null;

/**
 * Random id for this browser (not personal data): links it to the user's
 * WhatsApp chat. The API hashes it before it reaches the bot or the disk.
 * Falls back to memory when storage is blocked (private mode).
 */
export function getClientId(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    memory ??= crypto.randomUUID();
    return memory;
  }
}
