/**
 * One command to run Estampido in production on this machine:
 *   npm run start            → build web, API (production mode) + bot, auto-restart
 *   npm run start:public     → same + Cloudflare quick tunnel (public https URL)
 * Flags: --tunnel  --no-bot  --skip-build
 *
 * Each process restarts with backoff (1 s → 30 s) if it crashes; Ctrl+C stops all.
 * On macOS the Mac is kept awake while this runs (caffeinate).
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";

const args = new Set(process.argv.slice(2));
const PORT = process.env.PORT ?? "8787";
const wantTunnel = args.has("--tunnel");
const children = new Set<ChildProcess>();
let stopping = false;

const color = { api: "\x1b[34m", bot: "\x1b[32m", tunnel: "\x1b[35m", reset: "\x1b[0m" };
type Name = keyof Omit<typeof color, "reset">;

function prefix(name: Name, stream: NodeJS.ReadableStream, onLine?: (line: string) => void) {
  createInterface({ input: stream }).on("line", (line) => {
    console.log(`${color[name]}[${name}]${color.reset} ${line}`);
    onLine?.(line);
  });
}

function supervise(
  name: Name,
  cmd: string,
  cmdArgs: string[],
  env: NodeJS.ProcessEnv = {},
  onLine?: (l: string) => void,
) {
  let delay = 1_000;
  const start = () => {
    if (stopping) return;
    const startedAt = Date.now();
    const child = spawn(cmd, cmdArgs, { env: { ...process.env, ...env }, stdio: ["inherit", "pipe", "pipe"] });
    children.add(child);
    if (child.stdout) prefix(name, child.stdout, onLine);
    if (child.stderr) prefix(name, child.stderr, onLine);
    child.on("exit", (code, signal) => {
      children.delete(child);
      if (stopping) return;
      if (Date.now() - startedAt > 60_000) delay = 1_000; // it ran fine for a while → reset backoff
      console.log(`${color[name]}[${name}]${color.reset} terminó (${signal ?? code}); reinicio en ${delay / 1000} s…`);
      setTimeout(start, delay);
      delay = Math.min(delay * 2, 30_000);
    });
  };
  start();
}

const has = (bin: string) => spawnSync("which", [bin], { stdio: "ignore" }).status === 0;

if (!args.has("--skip-build")) {
  console.log("▶ Compilando la web…");
  const build = spawnSync("npm", ["run", "build:web"], { stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

supervise("api", "npx", ["tsx", "src/adapters/http/index.ts"], { SVA_MODE: "production", PORT });

if (!args.has("--no-bot")) {
  supervise("bot", "npx", ["tsx", "--env-file-if-exists=.env", "src/adapters/bot/index.ts"]);
}

if (wantTunnel) {
  if (!has("cloudflared")) {
    console.error(
      "✖ Falta cloudflared. Instálalo con:  brew install cloudflared   y vuelve a ejecutar npm run start:public",
    );
  } else {
    let announced = "";
    supervise(
      "tunnel",
      "cloudflared",
      ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${PORT}`],
      {},
      (line) => {
        const url = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
        if (url && url !== announced) {
          announced = url;
          console.log(`\n🌍  URL pública: ${url}\n    (cambia cada vez que se reinicia el túnel)\n`);
        }
      },
    );
  }
}

if (process.platform === "darwin" && has("caffeinate")) {
  // Keep the Mac awake (display may sleep) while Estampido runs.
  const awake = spawn("caffeinate", ["-ims", "-w", String(process.pid)], { stdio: "ignore" });
  children.add(awake);
}

const stop = () => {
  if (stopping) return;
  stopping = true;
  console.log("\n■ Deteniendo…");
  for (const c of children) c.kill("SIGINT");
  setTimeout(() => process.exit(0), 3_000).unref();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
