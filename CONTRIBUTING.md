# Cómo contribuir a Estampido

¡Gracias por tu interés! Los reportes de errores, ideas y mejoras son bienvenidos.

> **Licencia:** Estampido es de **todos los derechos reservados** ([LICENSE](LICENSE)). Al enviar un pull request aceptas ceder tu contribución al proyecto para que pueda incluirse bajo esa misma licencia. Si no estás de acuerdo, abre un _issue_ con tu idea en lugar de un PR.

## Reportar un error o proponer una idea

- **Error:** abre un _issue_ con la plantilla «Reporte de error». Incluye los pasos, qué esperabas, qué pasó, tu navegador o dispositivo y, si puedes, una captura.
- **Idea:** usa la plantilla «Propuesta». Cuenta el problema que resuelve antes que la solución.
- **Vulnerabilidad de seguridad:** **no** abras un issue público; sigue [SECURITY.md](SECURITY.md).

## Entorno de desarrollo

Requisitos: **Node.js ≥ 24** y **FFmpeg ≥ 8** con `libwebp_anim`, `libopus` y `libx264` (en macOS: `brew install ffmpeg-full`).

```bash
npm install && npm --prefix web install
npm run check-deps   # verifica FFmpeg
npm run dev          # API :8787 + web http://localhost:5173
```

> ⚠️ No corras `npm run bot` con un número que ya esté conectado en otro lugar (por ejemplo, producción): las sesiones de WhatsApp se pelean.

## Antes de abrir un pull request

Todo esto debe pasar (es lo mismo que corre la CI):

```bash
npm run lint && npm --prefix web run lint   # Biome + oxlint
npm run typecheck                           # TypeScript estricto
npm test                                    # unitarias + integración con FFmpeg real
npm run test:e2e                            # navegador real (Chrome/Brave)
```

Pautas:

- **Commits** con [Conventional Commits](https://www.conventionalcommits.org/es/): `feat(web): …`, `fix(api): …`, `docs: …`, `chore: …`. El asunto en inglés y en imperativo, como el resto del historial.
- **Cambios pequeños y enfocados.** Un PR por tema.
- **Pruebas:** la lógica pura va en `src/**` o `web/src/**/model` con pruebas en `tests/unit`. Los flujos completos van en `tests/integration` o `e2e`.
- **Textos de la interfaz en español**, claros y sin tecnicismos.
- **Accesibilidad:** controles con nombre accesible, foco visible y uso con teclado.
- **Nada de secretos:** nunca subas `.env`, `.auth/` ni `captures/`.

## Estructura

Consulta la sección [Arquitectura](README.md#️-arquitectura) del README y la carpeta [`docs/`](docs).
