/**
 * Errors caused by user input (bad file, start beyond end, …). The message is
 * user-facing (Spanish) and safe to show; adapters map these to 4xx/replies.
 * Anything else is an internal error and must not leak details.
 */
export class UserInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserInputError";
  }
}

export const formatMB = (bytes: number): string =>
  `${Math.round(bytes / 1024 / 1024)} MB`;
