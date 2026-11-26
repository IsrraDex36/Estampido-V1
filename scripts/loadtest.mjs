#!/usr/bin/env node
import { randomUUID } from "node:crypto";
/**
 * Real load test: N people create a sticker at the same time against a
 * running Estampido (async API, retrying on 503/429 like the web does),
 * while a probe keeps hitting /api/health to see if the site stays snappy.
 *
 *   node scripts/loadtest.mjs --url http://127.0.0.1:8787 --users 20 --clip clip.mp4 [--duration 3]
 *
 * Never point it at someone else's server.
 */
import { readFile } from "node:fs/promises";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const URL_ = arg("url", "http://127.0.0.1:8787");
const USERS = Number(arg("users", 10));
const CLIP = arg("clip");
const DURATION = arg("duration", "3");
const MAX_RETRIES = Number(arg("retries", 30));
if (!CLIP) {
  console.error("Falta --clip <video>");
  process.exit(1);
}
const bytes = await readFile(CLIP);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (xs, p) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

// Health probe: is the site still responsive while converting?
const health = [];
let probing = true;
const probe = (async () => {
  while (probing) {
    const t = performance.now();
    try {
      await fetch(`${URL_}/api/health`);
      health.push(performance.now() - t);
    } catch {
      health.push(10_000);
    }
    await sleep(200);
  }
})();

async function user(i) {
  const client = randomUUID();
  const t0 = performance.now();
  let retries = 0;
  for (;;) {
    // 1. Ask for a place BEFORE uploading (like the web): refusals are tiny.
    let r;
    try {
      r = await fetch(`${URL_}/api/convert/slot`, { method: "POST", headers: { "x-estampido-client": client } });
    } catch {
      r = null;
    }
    if (!r || r.status === 503 || r.status === 429) {
      if (++retries > MAX_RETRIES) return { i, ok: false, code: "gave_up", retries, totalMs: performance.now() - t0 };
      const wait = Number(r?.headers.get("retry-after") ?? 5) * 1000;
      await sleep(wait * (0.8 + Math.random() * 0.4)); // jitter, like the web
      continue;
    }
    if (r.status !== 200) return { i, ok: false, code: `slot_${r.status}`, retries, totalMs: performance.now() - t0 };
    const { slot } = await r.json();
    // 2. Upload with the slot.
    const fd = new FormData();
    fd.set("media", new Blob([bytes], { type: "video/mp4" }), "clip.mp4");
    fd.set("durationSec", DURATION);
    r = await fetch(`${URL_}/api/convert?async=1`, {
      method: "POST",
      body: fd,
      headers: { "x-estampido-client": client, "x-estampido-slot": slot },
    });
    if (r.status !== 202) return { i, ok: false, code: `http_${r.status}`, retries, totalMs: performance.now() - t0 };
    const { jobId } = await r.json();
    const accepted = performance.now();
    let startedAt = null;
    for (;;) {
      await sleep(400);
      const s = await (await fetch(`${URL_}/api/jobs/${jobId}`, { headers: { "x-estampido-client": client } })).json();
      if (s.state === "running" && startedAt === null) startedAt = performance.now();
      if (s.state === "done") {
        const end = performance.now();
        return {
          i,
          ok: true,
          retries,
          totalMs: end - t0,
          waitMs: (startedAt ?? end) - accepted,
          convertMs: s.result.elapsedMs,
          fps: s.result.sticker.fps,
          kb: Math.round(s.result.sticker.bytes / 1024),
        };
      }
      if (s.state === "failed" || s.state === "cancelled") {
        return { i, ok: false, code: s.error?.code ?? s.state, retries, totalMs: performance.now() - t0 };
      }
    }
  }
}

console.log(`Carga: ${USERS} personas a la vez contra ${URL_} (clip ${DURATION} s)…`);
const t = performance.now();
const results = await Promise.all(Array.from({ length: USERS }, (_, i) => user(i)));
probing = false;
await probe;
const ok = results.filter((r) => r.ok);
const bad = results.filter((r) => !r.ok);
const s = (ms) => `${(ms / 1000).toFixed(1)} s`;
console.log(
  `\nTerminaron ${ok.length}/${USERS} en ${s(performance.now() - t)} · fallos: ${bad.length}${bad.length ? ` (${[...new Set(bad.map((b) => b.code))].join(", ")})` : ""}`,
);
console.log(
  `Tiempo total por persona   p50 ${s(
    pct(
      ok.map((r) => r.totalMs),
      50,
    ),
  )} · p95 ${s(
    pct(
      ok.map((r) => r.totalMs),
      95,
    ),
  )} · máx ${s(Math.max(0, ...ok.map((r) => r.totalMs)))}`,
);
console.log(
  `Espera en la fila          p50 ${s(
    pct(
      ok.map((r) => r.waitMs),
      50,
    ),
  )} · p95 ${s(
    pct(
      ok.map((r) => r.waitMs),
      95,
    ),
  )}`,
);
console.log(
  `Conversión (servidor)      p50 ${s(
    pct(
      ok.map((r) => r.convertMs),
      50,
    ),
  )} · p95 ${s(
    pct(
      ok.map((r) => r.convertMs),
      95,
    ),
  )}`,
);
console.log(
  `Reintentos por «ocupado»   total ${results.reduce((n, r) => n + r.retries, 0)} · máx por persona ${Math.max(0, ...results.map((r) => r.retries))}`,
);
console.log(
  `Calidad                    fps ${[...new Set(ok.map((r) => r.fps))].join("/")} · peso p95 ${pct(
    ok.map((r) => r.kb),
    95,
  )} KB`,
);
console.log(
  `Respuesta de la web        /api/health p50 ${pct(health, 50).toFixed(0)} ms · p95 ${pct(health, 95).toFixed(0)} ms · máx ${Math.max(0, ...health).toFixed(0)} ms`,
);
process.exit(bad.length ? 1 : 0);
