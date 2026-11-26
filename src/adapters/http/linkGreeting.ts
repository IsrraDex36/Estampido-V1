/**
 * The text WhatsApp opens pre-typed for linking (the user only taps Send).
 * Many people sending the exact same message to the bot is the pattern an
 * anti-spam system notices, so the greeting varies — chosen from the code
 * itself, so it stays the same while that code is shown. The EST- code is
 * always there; the bot finds it anywhere in the message.
 */
const GREETINGS = [
  "Hola Estampido 👋 mi código: {code}",
  "¡Hola! Vengo de la web, mi código es {code}",
  "Hola 🙂 quiero vincular mi WhatsApp: {code}",
  "Hey Estampido, este es mi código {code}",
  "Buenas 👋 código para vincular: {code}",
  "Hola, aquí va mi código de Estampido: {code}",
] as const;

export function linkGreeting(code: string): string {
  let h = 0;
  for (const ch of code) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return (GREETINGS[h % GREETINGS.length] as string).replace("{code}", code);
}

export const LINK_GREETINGS = GREETINGS;
