# Changelog

Cambios notables de Estampido. Formato inspirado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [0.1.0] — 2026-11-25

Primera versión pública.

### Editor web

- Recortador de video estilo WhatsApp/Instagram: tira de fotogramas, bordes arrastrables y reproducción en bucle del tramo.
- Pestaña **Tiempo** con cuadros de inicio y fin, ajuste fino de ±0.1 s, duraciones rápidas y medidor de fluidez.
- Pestaña **Sonido**: el del video, grabar tu voz, un archivo propio o un sonido de la comunidad; recorte sobre la forma de onda y escucha previa.
- Pestaña **Estilo**: «Llenar» con encuadre libre (arrastrar y zoom 1–4×) o «Completo» con fondo transparente, desenfocado o de color; vista previa en vivo.
- Pestaña **Pack**: nombre y autor, con vista de «información del sticker».

### Entrega

- **Envío nativo de stickers con sonido** (`audioStickerMessage`, campo 134), con plan B de sticker + nota de voz.
- Vinculación de WhatsApp por código desde la web; cualquier persona recibe en su propio chat.
- **«Crearlo tú en WhatsApp»**: MP4 (H.264 + AAC, ≤ 5/10 s) para el creador oficial de stickers con sonido.
- Compartir y descargar (`.webp`, `.ogg`, `.mp4`); colección de la sesión con envío por lotes.

### Comunidad

- Publicar stickers con sonido, feed paginado (Tendencias, Nuevos, Top), 17 categorías, búsqueda, favoritos, sonidos virales y remezclas.

### Calidad y conversión

- Optimizador que prioriza los fps dentro de 500 KB; modo «Calidad alta» experimental (5 MB).
- Audio robusto: selección de pista, recorte de silencios, nivelación y sincronía.
- Entradas: video, GIF, WebP animado e imagen + audio; hasta 3 min.

### Bot, CLI y API

- Bot de WhatsApp (`/saudio`, `/cancelar`, `/ayuda`) con cola, progreso y límites por persona.
- CLI `sva` (`convert`, `doctor`) y API HTTP documentada.

### Producción

- Imagen Docker única (web + API + bot) con volumen `/data`; despliegue en Railway.
- Seguridad: CSP con hash, HSTS, límites por IP, `/admin` con token.
- Vigilante del bot con auto-reconexión y alertas (ntfy, Discord, WhatsApp).
- SEO: metadatos por ruta, Open Graph, `sitemap.xml`, `robots.txt`, datos estructurados; PWA instalable con ícono propio.

### Experiencia

- Tour de bienvenida con Pum, la mascota en pixel art, y sonidos sintetizados libres de derechos.
- Tema claro y oscuro, diseño responsive, atajos de teclado y cancelación real de la conversión.
