# Changelog

Cambios notables de Estampido. Formato inspirado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Sin publicar]

### Corregido

- **Sincronía imagen–sonido en WhatsApp:** un GIF o WebP animado con un sonido más largo ahora se estira (repitiéndose sin saltos) hasta durar lo mismo que el sonido, en lugar de desfasarse en cada vuelta. Hasta 10 s.
- `/saudio` sin duración toma los primeros **10 s** (lo que WhatsApp anima), no 3 minutos.
- La duración de los WebP animados se mide desde sus cuadros (ffprobe informa 0 s).
- En la web, imagen y audio van juntos al reproducir, pausar y continuar (Comunidad y Resultado).

### Agregado

- **Estándar de 14–15 fps** en los stickers animados: para entrar en 500 KB, el optimizador baja primero la calidad y luego la nitidez (imagen interna de 448–256 px sobre el lienzo de 512×512, casi invisible al tamaño del chat) y solo al final los fps. Un clip pesado de 10 s pasa de 12 a 14 fps; uno de 8 s se queda en 15. Si un clip es demasiado largo y baja de 14 fps, se avisa. La nitidez usada aparece en los detalles del resultado.

- Chequeo de **compatibilidad con WhatsApp** en cada resultado (animación > 10 s, sonido más largo que la animación, peso > 500 KB): aviso antes de enviar, en la pestaña Tiempo y en la respuesta del bot.
- **Moderación en `/admin`:** ver todos los stickers de la Comunidad (incluidos «solo sonido»), buscarlos, borrar uno (dos toques) o todos (escribiendo «BORRAR TODO»).
- Enviar stickers de la Comunidad a tu WhatsApp; elegir qué publicar (sticker con sonido, solo sticker o solo sonido).

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
