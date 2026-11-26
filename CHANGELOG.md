# Changelog

Cambios notables de Estampido. Formato inspirado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Sin publicar]

### Corregido

- **Sincronía imagen–sonido en WhatsApp:** un GIF o WebP animado con un sonido más largo ahora se estira (repitiéndose sin saltos) hasta durar lo mismo que el sonido, en lugar de desfasarse en cada vuelta. Hasta 10 s.
- `/saudio` sin duración toma los primeros **10 s** (lo que WhatsApp anima), no 3 minutos.
- La duración de los WebP animados se mide desde sus cuadros (ffprobe informa 0 s).
- En la web, imagen y audio van juntos al reproducir, pausar y continuar (Comunidad y Resultado).

### Agregado

- **Escuchar el efecto de voz antes de crear**: botón «Escuchar» en Sonido (Web Audio en el navegador, hasta 6 s, aproximado); al tocar otro efecto mientras suena cambia al instante.

- **Vista previa al compartir**: los enlaces de packs (`/p/:id`) y perfiles (`/u/:handle`) en WhatsApp/redes muestran su propio título, descripción e imagen con sus stickers (1200×630, generada una vez y cacheada).

- **Monitoreo**: con `SVA_ALERT_WEBHOOK`, la web avisa (ntfy/Discord) si el bot se cae o WhatsApp queda desconectado más de 5 min, y cuando vuelve; el contenedor tiene `HEALTHCHECK` para que Coolify lo reinicie si la web deja de responder. Guía de monitor externo en `docs/DEPLOY-RAILWAY.md`.
- **Desvincular bot desde /admin** (para cambiar de número sin tocar el teléfono viejo): confirmación escrita, cierra la sesión en WhatsApp y muestra el QR nuevo.

- **Info del sticker que invita**: al tocar un sticker en WhatsApp ahora dice «Busca o crea más en • estampido.isrradev.com» (en vez de «Estampido • estampido») cuando dejas el pack vacío.
- **Duración guiada**: 3/5/10 s arriba (10 s es lo máximo que anima WhatsApp); 30 s–3 min aparte como «Más largo · solo para descargar».

### Cambiado

- **Calidad alta** ahora llega hasta 1 MB (antes 5 MB) y se presenta como «para descargar»: por encima de 500 KB WhatsApp suele trabar o congelar el sticker. El medidor de fluidez ya no empuja a Calidad alta.

### Corregido

- Con el sonido apagado se enviaba igual la duración del audio y podía hacer fallar la conversión.

- **Texto estilo CapCut**: 8 tipografías (Clásica, Impacto, Cómic, Gordita, Póster, Plumón, Cursiva, Pixel; se cargan solo al abrir la pestaña), 4 estilos (Contorno, Sombra, Caja, Neón) y cualquier color (8 rápidos + selector libre) con contorno automático por contraste.
- **Más efectos de voz**: Robot, Radio, Alien y Cueva (8 en total), todos conservan la duración exacta.
- **Estilo**: filtros de color (B/N, Vivo, Retro, Frío, Cálido) con miniaturas en vivo y **Espejo**; la vista previa (también el encuadre arrastrable) refleja ambos.
- **Resultado**: chips de lo aplicado (texto, voz, filtro, espejo) y «Ajusta y vuelve a crear» que abre directo la pestaña Texto, Voz, Estilo o Tramo.
- **Archivo subido**: tarjeta con tipo, peso y «Cambiar clip»; arrastrar otro archivo encima lo reemplaza.
- **Entrar con WhatsApp** rediseñado: mascota, beneficios, código en casillas grandes, barra de caducidad, pasos numerados y botón verde de WhatsApp; si falla, «Reintentar» en vez de error suelto.

### Corregido

- Si pedir el código de vinculación fallaba, el diálogo lo reintentaba en bucle sin pausa (justo cuando el servidor estaba ocupado). Ahora pide una vez y ofrece «Reintentar».
- Códigos de vinculación bajo tráfico: tope de 5000 en espera (antes 500; al llenarse se descarta el más viejo en vez de rechazar), búsquedas O(1), códigos de 5 caracteres (28 M combinaciones) y límite por IP de 30/10 min para redes móviles compartidas.

- **Eliminar tus stickers**: en el menú ⋯ de un sticker tuyo aparece «Eliminar» (con confirmación) en vez de «Reportar»; funciona en Tu espacio → Publicados, tu perfil, packs y el feed. Solo su dueño puede borrarlo (el servidor responde 404 a cualquier otro).

- **Editor de texto (pestaña «Texto»)**: texto de meme arriba y/o abajo, tamaño, letra (Clásica/Pixel), 6 colores con contorno automático y MAYÚSCULAS; se ajusta solo a 3 líneas. La vista previa es el mismo dibujo que se sube (PNG transparente) y el servidor lo funde con ffmpeg en video, GIF e imagen.
- **Efectos de voz**: Ardilla, Monstruo, Eco y Reversa en la pestaña Sonido; mantienen la duración exacta del sonido (sincronizado con la imagen).

- **Seguir creadores**: botón Seguir en los perfiles, contador de seguidores, orden **«Siguiendo»** en Stickers (lo nuevo de quienes sigues) y «Siguiendo» en Tu espacio.
- **Packs**: arma packs de hasta 30 stickers (como en WhatsApp) desde el menú ⋯ de cualquier sticker; página pública `/p/:id` con **«Enviar los N a mi WhatsApp»** (con progreso y detener), compartir, renombrar, quitar y borrar; packs en tu espacio y en tu perfil.
- **Etiquetas**: sugerencias automáticas al publicar (palabras del título, populares en la categoría y en general) y fila de **#etiquetas populares** que filtra el feed con un toque.

- **Comunidad por pestañas**: encabezado compacto (qué es, contadores abreviados con ícono, «cómo funciona» en 3 pasos y **Reglas de la comunidad**) y cuatro pestañas fijas — Stickers (feed + Top de la semana), Sonidos (lista completa con orden, búsqueda y paginación), Creadores (tarjetas con perfil y cifras) y Tu espacio. La pestaña vive en la URL (`?tab=sonidos`): se comparte y el botón atrás funciona. En celular la página pasó de ~8 000 px de alto a secciones cortas.
- **Nada se rompe con datos extremos**: cifras abreviadas en todos lados (`370 k`, `1.2 M`, sin decimales desde 100 k, con espacio no separable y el número exacto al pasar el mouse), títulos/nombres/categorías truncados, biografías con cortes de palabra largos, buscador acotado.

### Quitado

- Las secciones de prueba «Reto semanal» y «Packs de la comunidad» («Pronto · fase 4») hasta que existan de verdad.

- **Cola de conversiones para mucha gente a la vez** (`http/jobs/`): pedir lugar antes de subir (un «ocupado» no gasta datos ni corta subidas), un sticker a la vez por persona, fila con tope que cuenta las subidas en curso, rechazo con `Retry-After` cuando la espera estimada es larga, tiempo estimado con promedio móvil, tope de 180 s por sticker, cancelación que libera el lugar y FFmpeg con prioridad baja para que la web siga rápida. Trabajos en segundo plano (`202` + seguimiento) en vez de conexiones abiertas minutos.
- **Tarjetas de error que explican y ofrecen el siguiente paso** (ocupado con reintento automático y cuenta regresiva, archivo pesado o no compatible, tardó demasiado → «Probar con 5 s», conexión, error nuestro → «Contarnos qué pasó»), con el código HTTP para soporte. Vista «En la fila · #N · espera aprox.», barra de avance aproximada y aviso previo «Hay fila».
- `npm run loadtest`: prueba de carga real (N personas a la vez, reintentos como la web, tiempos p50/p95 y respuesta de la web durante la carga).

- **Calentamiento de número nuevo** (`bot/volume.ts`): el bot recuerda desde cuándo usa cada número (`/data/bot-age.json`) y empieza con límites bajos (6/min y 40/h el día 1) que suben durante un mes (40/min y 600/h). El ritmo se alarga solo cuando sube el volumen y, en un límite, espera en vez de mandar en ráfaga. `/admin` muestra mensajes enviados (1 h / 24 h) y el día de calentamiento.
- **Menos mensajes de estado**: las ediciones de `/saudio` se agrupan (mínimo 2.5 s entre ediciones; solo sale el texto más reciente) y, con carga, se omiten las intermedias (cola, «creando…»); el primero y el final siempre llegan. Las alertas al dueño también comparten el ritmo.

- **Bot con ritmo humano** (`bot/humanize.ts`): marca como leído, muestra «escribiendo…» un tiempo proporcional al texto (con variación) y responde; separación aleatoria entre cualquier par de envíos (texto, stickers, notas de voz, ediciones de estado), sin intervalos fijos. Respuestas con **variantes redactadas a mano** (`bot/phrases.ts`) que no se repiten seguidas en un chat; el mensaje pre-escrito para vincular también varía por código. Sin caracteres aleatorios ni invisibles (rompen copiar/pegar y lectores de pantalla y parecen spam). `SVA_HUMANIZE=0` lo desactiva (pruebas).
- **Ajustes en celular**: pestañas con ícono arriba (más aire para el texto), cambiar de pestaña deslizando el panel (con una vibración mínima donde se soporta; nunca sobre el recortador, el encuadre ni los sliders), pista «desliza» que se va tras usarla, y duraciones en una sola fila deslizable.

- **Caja de comentarios**: «Enviar comentarios» en el footer y en el menú de cuenta (idea, problema u otro; contacto opcional; se adjunta la página y el dispositivo). Anti-spam con campo trampa, 5 por persona por hora y límite por IP. En `/admin`, buzón con filtros (nuevos, leídos, hechos), marcar y borrar.
- **Tarjetas de la Comunidad más limpias en celular**: sin botón encima del sticker; una sola píldora en la esquina (▶ + duración corta, verde con ecualizador mientras suena); toda la imagen sigue siendo el área para tocar.
- La guía («¿Cómo funciona?») vuelve al encabezado en celular; el cambio de tema pasa al footer ahí.

- **Tendencias con puntaje combinado**: usos ×3, guardados ×2, envíos ×1.5 y escuchas ×0.2 (una por persona al día), con caída por antigüedad en «Tendencias» y suma en «Top». Triggers SQL mantienen el puntaje en cada cambio; el Top de la semana y los creadores destacados usan la misma fórmula.
- **Moderación**: reportar desde el menú ⋯ de cada sticker (motivo + nota); con 3 reportes distintos se oculta del feed, los sonidos, el perfil, los favoritos, WhatsApp y sus archivos (su dueño lo ve «En revisión»). En `/admin`, cola de reportes: mantener, borrar o bloquear al creador (sesiones cerradas, no puede entrar ni publicar, perfil y stickers ocultos; desbloquear lo revierte).

- **Cuentas con WhatsApp** (sin contraseñas): al vincular tu WhatsApp quedas dentro. Perfiles de creador públicos en `/u/usuario` (avatar emoji + color, nombre, descripción, cifras, stickers, SEO propio), «Mi cuenta» (editar perfil, mis stickers con borrado, cerrar sesión, borrar cuenta con todo lo publicado), favoritos sincronizados entre dispositivos (se importan los del navegador al entrar), contador de guardados, creadores destacados en la Comunidad y el creador en cada sticker. Publicar en el servidor público requiere cuenta.
- Seguridad: el bot entrega una clave HMAC por número (nunca el número), sesiones de 90 días deslizantes guardadas con hash, cookie `__Host-` HttpOnly/Secure/SameSite=Lax, chequeo de origen en escrituras con cookie, límites por IP para cuenta y favoritos, usuarios reservados, validación estricta con Zod.
- Encabezado compacto en celular (la guía y el estado del bot pasan al footer).

- **Comunidad en SQLite** (`node:sqlite`, sin dependencias ni servicios nuevos): `community.db` junto a los archivos en `/data/community`. El `index.json` anterior se importa solo al arrancar y se guarda como `index.json.migrated`. Ranking, filtros, búsqueda y paginación en SQL con índices de cobertura; contadores atómicos (antes cada uso reescribía todo el JSON). Con 20 000 stickers: Nuevos 0.05 ms (antes 2.9), Tendencias 1.0 ms (antes 3.5), Top 0.2 ms, búsqueda 3.3 ms (antes 5.9).

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
