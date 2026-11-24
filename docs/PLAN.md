# Plan de trabajo — Sticker Video Audio

Objetivo del prototipo: **video → sticker WebP animado + pista de audio**, listo para enviarse como _sound sticker_ de WhatsApp. El MVP es una CLI local. El bot de WhatsApp llega después.

---

## 1. Tecnologías recomendadas

| Capa         | Elección                                                                    | Por qué                                                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime      | **Node.js 24** (ya instalado)                                               | Mismo ecosistema que Baileys/bots de WhatsApp                                                                                                                                   |
| Lenguaje     | **TypeScript** (ESM)                                                        | Tipos para opciones, límites y resultados del pipeline                                                                                                                          |
| Ejecutar TS  | **tsx** (dev) + `tsc` (build)                                               | Cero config, rápido                                                                                                                                                             |
| Video/audio  | **FFmpeg** (`brew install ffmpeg-full`), invocado con `child_process.spawn` | Estándar de la industria. `ffmpeg-full` incluye `libwebp` + `libopus` (el formula `ffmpeg` normal NO trae `libwebp`). _No_ usar `fluent-ffmpeg` (archivado y sin mantenimiento) |
| Metadata     | **ffprobe** (JSON)                                                          | Duración, fps, resolución, si hay pista de audio                                                                                                                                |
| WebP extra   | `webpmux` (ya instalado)                                                    | Inyectar el EXIF de pack/autor y verificar frames                                                                                                                               |
| Imágenes     | **sharp** (fase 4)                                                          | Stickers desde imagen estática + audio                                                                                                                                          |
| Validación   | **zod**                                                                     | Validar opciones de CLI y config                                                                                                                                                |
| CLI          | **commander**                                                               | Comandos y flags simples                                                                                                                                                        |
| Tests        | **vitest**                                                                  | Rápido y nativo con TS/ESM                                                                                                                                                      |
| Lint/format  | **Biome**                                                                   | Una sola herramienta en lugar de eslint + prettier                                                                                                                              |
| Bot (fase 5) | **Baileys** + parche del campo 134                                          | Único camino viable hoy para `audioStickerMessage`                                                                                                                              |

**Alternativa descartada:** `ffmpeg-static` (npm). Es portable, pero no garantiza `libwebp` ni `libopus` en todas las plataformas. Se podría evaluar más adelante para Docker.

---

## 2. Arquitectura

```
entrada (video) ──► probe ──► plan de recorte ──┬─► video encoder ──► optimize (≤500 KB) ──► metadata EXIF ──► sticker.webp
                                                └─► audio encoder ──────────────────────────────────────────► audio.ogg (opus)
                                                                     │
                                                                     ▼
                                                    resultado { webp, audio, stats }
                                                                     │
                                                 ┌───────────────────┴───────────────────┐
                                                 ▼                                       ▼
                                          adapters/cli                            adapters/bot (Baileys)
```

**Principios:**

- `core/` contiene funciones puras + FFmpeg, sin conocer WhatsApp ni la CLI.
- `pipeline/` orquesta los pasos y devuelve un resultado tipado.
- `adapters/` son las entradas y salidas (CLI ahora, bot después) y pueden cambiarse sin tocar el core.
- `config/` centraliza los límites de WhatsApp (tamaño, dimensiones, duración, fps) en un solo lugar, porque el formato no es oficial y puede cambiar.

```
sticker-video-audio/
├── src/
│   ├── core/
│   │   ├── probe/       # ffprobe → metadata tipada
│   │   ├── video/       # video → WebP animado 512×512
│   │   ├── audio/       # extraer + recortar → Opus/OGG
│   │   ├── optimize/    # bajar calidad/fps hasta cumplir el tamaño
│   │   └── metadata/    # EXIF de pack/autor en el WebP
│   ├── pipeline/        # orquestador: convertVideoToSoundSticker()
│   ├── adapters/
│   │   ├── cli/         # comando `sva convert <video>`
│   │   └── bot/         # (fase 5) envío vía Baileys
│   ├── config/          # límites WA + esquema zod
│   └── utils/           # spawn ffmpeg, temp files, logger
├── tests/{unit,integration,fixtures}
├── samples/{input,output}   # videos de prueba (git-ignored)
├── scripts/             # check-deps, generar fixtures
└── docs/                # PLAN.md, decisiones
```

---

## 3. Fases

### Fase 0 — Setup ✅

- [x] Esqueleto de carpetas
- [x] `brew install ffmpeg-full` (keg-only; `ffmpeg` normal no trae `libwebp`) — `libwebp_anim` + `libopus` OK
- [x] `package.json`, `tsconfig.json`, Biome, vitest, `.gitignore`
- [x] `scripts/check-deps`: verifica ffmpeg, ffprobe y sus encoders
- [x] `git init`

**Criterio de salida:** `npm test` corre (vacío) y `check-deps` pasa.

### Fase 1 — Video → WebP animado (sin audio) ✅ (falta validación manual en WhatsApp)

- [x] `utils/ffmpeg`: wrapper de spawn con timeout y errores legibles
- [x] `core/probe`: duración, fps, w/h, `hasAudio`
- [x] `core/video`: recorte (inicio + duración ≤5 s), escala a 512 con padding transparente, fps fijo (15), `-loop 0`, frames uniformes
- [x] Test con un video fixture generado por FFmpeg (`testsrc`)
- [x] `core/webp/inspect`: parser RIFF puro en TS (canvas, frames, duración, alpha, loop) para verificar la salida
- [x] ~~`scripts/try-video.ts`~~ → reemplazado por la CLI `sva convert` (fase 3)
- [ ] Validación manual: enviar `samples/output/*.webp` a WhatsApp

> Nota: a calidad 75 y 15 fps, el contenido con mucho detalle supera 500 KB (testsrc2: 538 KB, mandelbrot: 1030 KB). Lo resuelve el optimizador de la fase 3.

**Criterio de salida:** el WebP abre en el navegador, mide 512×512 y WhatsApp lo acepta como sticker animado (enviado manualmente).

### Fase 2 — Audio ✅ (núcleo)

- [x] `core/audio`: extraer el mismo segmento → Opus/OGG mono 48 kHz. Si el video no tiene audio, devolver un aviso, no un crash
- [x] Sincronía: mismo `start`/`duration` que el video
- [x] Audio propio en todos los adaptadores: CLI `-a/--audio <archivo> --audio-start`, web (selector de archivo + inicio), bot (`/saudio voz` → siguiente nota de voz). También `--no-audio`

**Criterio de salida:** `sticker.webp` + `audio.ogg` con la misma duración (±50 ms).

### Fase 3 — Optimización + metadata + CLI (optimizador ✅ adelantado)

- [x] `core/optimize`: loop de calidad 80→30 y fps 15→10 hasta quedar en ≤500 KB
- [ ] `core/metadata`: EXIF de pack/autor (formato `sticker-pack-id`, compatible con WhatsApp)
- [x] `adapters/cli`: `sva convert <video> [-s] [-d] [--crop] [-a archivo] [--no-audio] [-o] [-n] [--json]` + `sva doctor`. Códigos de salida: 0 ok, 1 interno, 2 entrada inválida
- [x] Reporte final: tamaño, fps, calidad usada, duración y origen del audio

**Criterio de salida:** un comando produce un sticker válido por debajo del límite, con stats.

### Fase 3b — Web de pruebas ✅

- [x] `adapters/http`: API Hono (`POST /api/convert`, `GET /api/results/:id/:file`), con zod, límite de 50 MB, tipos de archivo permitidos, cola (2 conversiones a la vez) y borrado de resultados tras 30 min
- [x] `contract.ts`: tipos compartidos entre API y web (solo tipos, alias `@contract`)
- [x] `web/`: Vite + React 19 + Tailwind v4 + shadcn (Nova)
  - Lógica: `lib/api.ts` (XHR con progreso de subida), `hooks/useConverter.ts` (máquina de estados)
  - UX: `hooks/useSoundStickerPreview.ts` (tocar → reproduce; mute como en WhatsApp)
  - UI: `components/*` presentacionales + `ConverterPage.tsx` (solo compone)

### Fase 4 — Entradas extra

- [ ] Imagen + audio (≤10 s) usando sharp
- [ ] GIF → sticker
- [ ] Recorte cuadrado inteligente (crop centrado vs. padding)

### Fase 5 — Envío por WhatsApp (experimental) 🚧

- [x] Herramienta de captura: hook sobre `proto.Message.decode` + decoder protobuf sin esquema + extractor genérico de media (`npm run bot:capture`), ver `docs/PROTOCOLO.md`
- [ ] **Capturar un sound sticker real** (requiere que el usuario escanee el QR y envíe uno)
- [ ] Confirmar el códec real del audio y ajustar la fase 2 si hace falta
- [x] `adapters/bot`: conexión Baileys 7.0.0-rc14 (QR, reconexión)
- [ ] Envío nativo `audioStickerMessage` (campo 134): depende de la captura
- [x] Fallback: sticker + nota de voz (`/saudio`, con control de acceso `SVA_ALLOWED`)
- [x] Límite de descarga en el bot: 50 MB para video y 20 MB para audio. Se rechaza antes de descargar por `fileLength` y se corta en pleno stream si el tamaño declarado no coincide
- [x] Errores de usuario tipados (`UserInputError`) con mensajes claros en API (422), bot y CLI (exit 2). Los errores internos no filtran detalles
- [ ] Comandos desde la propia cuenta del bot (`messages.upsert` de tipo `append`)
- [ ] Prueba entre 2 dispositivos

> ⚠️ Usar un **número secundario** para las pruebas: Baileys es no oficial y hay riesgo de baneo.

### Fase 6 — Pulido

- [ ] Dockerfile con FFmpeg
- [ ] Procesamiento en cola (concurrencia limitada)
- [ ] Docs + ejemplos

---

## 4. Decisiones

1. ✅ Encuadre: **padding transparente** por defecto (flag `--crop` opcional) — decidido 2026-11-24.
2. ✅ Duración por defecto: **5 s** — decidido 2026-11-24. Validar aceptación real en WhatsApp en fase 1.
3. ⏳ Códec audio: se asume Opus/OGG hasta verificar en fase 5.
4. ✅ FFmpeg: `ffmpeg-full` (Homebrew, keg-only). Ruta resuelta en `src/utils/ffmpeg.ts`; override con `FFMPEG_PATH`/`FFPROBE_PATH`.
