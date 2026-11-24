# 🔊 Sticker Video Audio

Proyecto para crear **stickers de WhatsApp a partir de video que conservan el audio**, aprovechando el nuevo formato nativo de _sound stickers_ (despliegue limitado desde nov 2026).

> Estado: **prototipo funcional**: video → WebP ≤500 KB + audio Opus, con web de pruebas. Siguiente: probar en WhatsApp real (fase 5). Ver [docs/PLAN.md](docs/PLAN.md) e [INVESTIGACION.md](INVESTIGACION.md).

## Requisitos

- Node.js ≥ 24
- FFmpeg con `libwebp` + `libopus`: `brew install ffmpeg-full`

```bash
npm install
npm run check-deps   # verifica ffmpeg/ffprobe + encoders
npm test

# Web de pruebas (API :8787 + Vite :5173)
npm --prefix web install
npm run dev          # abre http://localhost:5173
```

## Idea

1. El usuario envía un video, una imagen + audio, o una nota de voz.
2. El proyecto genera un **WebP animado** de 512×512, por debajo de 500 KB, con frames uniformes.
3. Recorta y codifica el audio: 5 s desde video y hasta 10 s desde imagen.
4. Envía un **sound sticker nativo** (`audioStickerMessage`, campo 134).
5. **Fallback:** si el receptor o la librería no lo soportan, envía el sticker normal y una nota de voz.

## Alcance inicial (propuesto)

- Comando de bot, p. ej. `/stickeraudio` o `/saudio`, inspirado en bots tipo [Zeus](https://github.com/DavidModzz/zeus).
- Conversión con `ffmpeg`: recorte, escala, fps y WebP animado. Audio en Opus/OGG (por verificar).
- Metadatos EXIF de pack/autor (estilo `wa-sticker-formatter`).
- Transporte: Baileys, con el parche del campo 134 hasta que haya soporte upstream.

## Stack tentativo

- Node.js
- [Baileys](https://github.com/WhiskeySockets/Baileys) (no oficial)
- FFmpeg, sharp

## Riesgos clave

- Formato no documentado por Meta: puede cambiar sin aviso.
- Las librerías no oficiales arriesgan el baneo del número.
- Rollout parcial: algunos receptores verán un mensaje vacío o sin audio.
- Copyright del audio de terceros.

## Próximos pasos

1. Capturar un sound sticker real con WhatsApp Web y decodificar su protobuf: códec, campos y upload.
2. Prototipo del conversor video → WebP + audio.
3. Prueba de envío entre dos dispositivos reales.
4. Definir la estrategia de fallback.

## Estructura

Plan por fases y arquitectura: [docs/PLAN.md](docs/PLAN.md).

```
sticker-video-audio/
├── src/
│   ├── core/{probe,video,audio,optimize,metadata}
│   ├── pipeline/
│   ├── adapters/{cli,bot}
│   ├── config/
│   └── utils/
├── tests/{unit,integration,fixtures}
├── samples/{input,output}
├── scripts/
├── docs/PLAN.md
├── README.md
└── INVESTIGACION.md
```
