# Changelog

Cambios notables de Estampido. Formato inspirado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Sin publicar]

### Corregido

- **Cerrar sesión de verdad y volver a entrar sin trucos**:
  - Al cerrar sesión, el servidor «revoca» las vinculaciones de ese navegador emitidas hasta ese momento (solo guarda huella de la cuenta + navegador + fecha, nada de la sesión): otra pestaña abierta o una copia guardada ya no pueden volver a meterte. Vincular otra vez funciona y conserva tu misma cuenta.
  - Borrar la cuenta revoca **todos** los navegadores: antes, un navegador vinculado la recreaba al instante.
  - «Cerrar sesión» es inmediato: quitar el dispositivo de WhatsApp sigue en segundo plano (antes podía tardar más de 25 s).
  - Las pestañas se sincronizan: si cierras sesión en una, las demás también.
  - No queda nada de la cuenta anterior en caché (seguidos, feed, packs, mis stickers) si entra otra cuenta en el mismo navegador.
  - Una vinculación revocada o inválida se olvida sola; si el servidor solo está ocupado, se conserva.
  - Defensa: una respuesta sin fecha de sellado (o con un valor no numérico) nunca inicia sesión.

- **Vincular con código nunca funcionaba (solo QR)**, por dos motivos: (1) el código se pedía para «52 + 10 dígitos», pero WhatsApp identifica los celulares de México como «521 + 10» (Argentina «549»), así que el aviso nunca llegaba a tu cuenta; ahora se convierte solo. (2) Nos presentábamos como un navegador inventado, que WhatsApp rechaza para códigos; ahora como Chrome (en Dispositivos vinculados aparece «Chrome (Mac OS)», y el diálogo lo avisa). Además la vinculación propia renueva el QR cuando WhatsApp lo pide (antes el teléfono decía «No se pudo vincular»).
- **Muchas personas a la vez**: la versión de WhatsApp Web se consulta una vez y se comparte (antes, una consulta por cada vinculación y cada envío). Pruebas de carga: 60 envíos simultáneos con máximo 4 conexiones y cada sticker en el chat de su dueño, ráfagas que exceden la fila reciben «ocupado» al instante, la misma cuenta en 5 pestañas nunca abre dos conexiones, 30 vinculaciones simultáneas aisladas por navegador, 40 envíos web en paralelo sin mezclar sesiones.

- **«Vinculado» pero al enviar pedía vincular otra vez**: se exigía `creds.registered`, que Baileys solo marca al vincular con código (con QR nunca), así que la sesión parecía inválida y se borraba. Ahora se valida lo que ambos caminos sí dejan (tu identidad y la firma del dispositivo); una vinculación sin ellas se reporta como fallida, nunca como «vinculado». Además, errores de formato, tiempos de espera o saturación ya no borran la sesión (solo «quitado del teléfono», «vencida» o «inválida»), ni tampoco un reingreso a la cuenta fallido. Los rechazos se registran como `[self] send rechazado: <código>` (sin datos).

- **El bot reintentaba cada 2 s cuando WhatsApp rechazaba su número (403)**: martilleaba a WhatsApp desde la IP del servidor (la misma que usan las vinculaciones de cada usuario). Ahora espera 15 → 30 → 60 min ante un 403 y crece de 2 s a 5 min ante otros cierres; `/admin` muestra «WhatsApp rechazó el número del bot» con qué revisar y cómo desvincularlo.
- Vincular tu WhatsApp: si el código vence (408) se dice claro («pide otro y escríbelo enseguida»), con cuenta regresiva de 2 min en pantalla.

- **«Tu WhatsApp quitó este dispositivo» aparecía aunque no fuera eso**: ahora cada causa tiene su mensaje (quitado desde el teléfono, vencido, o vinculación anterior a la actualización de seguridad).
- Vincular tu WhatsApp: se espera a que WhatsApp termine el primer inicio (pre-llaves y notificaciones pendientes) antes de guardar la sesión, y las llaves restauradas conservan su tipo correcto (`Buffer`); los cierres de WhatsApp se registran con su código (sin datos) para diagnosticar.

- La fila de **Filtro** se salía del panel de ajustes en escritorio; ahora se queda dentro, se desliza y se desvanece a la derecha.

### Cambiado

- **Tendencias por categoría**: en vez de una cuadrícula enorme con todo junto, «Tendencias» (sin filtros) muestra «Lo más sonado ahora» con ranking y luego una fila por categoría, de la más activa a la menos, con 10 stickers cada una: se desliza en el celular, flechas en escritorio y «Ver todo» abre la categoría completa. Primero 4 categorías y «Ver más categorías». Tarjetas compactas en las filas (título, creador y acciones en íconos). Todo llega en una sola petición (`GET /api/community/trending`, caché de 30 s que se renueva al publicar). En el celular, «Top de la semana» vive en la pestaña «Top» en lugar de una lista más al final.

- **Encabezado móvil sin amontonarse**: en el celular quedan logo, menú, instalar, WhatsApp y tu perfil; «¿Cómo funciona?» pasa al pie, junto al cambio de tema (revisado a 360 y 390 px, con y sin sesión).

- **Estado de WhatsApp en el celular**: el encabezado móvil muestra un ícono de WhatsApp con punto de estado (verde vinculado, morado parpadeando «vincular», gris en pausa). Al tocarlo vincula, o explica el estado (en móvil no hay tooltips).

- **Vincular ya no parece trabado**: en cuanto el teléfono acepta el código o el QR, la pantalla cambia a «Vinculando tu WhatsApp…» con progreso real (aceptó → conectando de forma segura → preparando tu cuenta y tu chat «Tú») y barra; si tarda más de 12 s avisa «Casi listo». Al terminar, «¡Listo, WhatsApp vinculado! Entraste como @usuario» un momento y luego se manda lo que estaba pendiente. Mientras llega el código: «Pidiendo tu código a WhatsApp…».

- **Número por país (LatAm + España + EE. UU.)**: selector de país con su lada y cuántos dígitos lleva (22 países), adivinado por el idioma y la zona horaria del navegador (Lima → Perú) y recordado. Valida en vivo («Faltan 3 dígitos (Perú: 9)»), acepta el número pegado con `+51`/`0051`, quita prefijos locales (0 inicial, 044/045 y «1» en México, «9» y «0 … 15» en Argentina) y muestra exactamente para qué número se pedirá el código.

- **Ya no hace falta el número del bot del admin**: vincular tu propio WhatsApp (código o QR) es también **entrar a tu cuenta** (perfil, favoritos, publicar). Misma cuenta que antes para quien ya entraba con el código EST- (la huella cifrada del número es la misma). Si la cookie vence, el navegador vinculado vuelve a entrar solo, sin conectarse a WhatsApp. «Cerrar sesión» también quita el dispositivo.
- El bot del admin queda **apagado por defecto** (`SVA_ADMIN_BOT=1` para encenderlo): sin conexión, sin reintentos, sin riesgo para ningún número; `/admin` lo explica. El indicador del encabezado ahora dice «Vincular WhatsApp» / «WhatsApp vinculado».

- **Vincular tu WhatsApp, más claro**: pasos numerados para código (celular) y QR (computadora), botón «Copiar código», aviso de que el código vence y «Pedir otro código / cambiar de método».

- **Card de sticker de la comunidad pulida**: el sticker ocupa todo el cuadro (sin hueco abajo), la duración va como etiqueta arriba a la izquierda y ▶ es un botón redondo discreto abajo a la derecha (verde mientras suena); texto en 3 líneas (título · @creador y categoría · cifras), acciones alineadas; con el bot en pausa el botón dice «Envío en pausa».

- **Publicar sin la casilla de derechos del audio**: solo categoría, título, etiquetas y publicar (en uno y en varios). El servidor ya no la exige.

- Con texto + audio + archivo al límite, la subida podía rebasar el tope por no contar la capa de texto.
- Dependencias de la web: `npm audit` en 0.

- **Seguridad**: la IP del visitante se podía falsificar con el encabezado `CF-Connecting-IP` y así saltarse todos los límites. Ahora solo se cree con `SVA_BEHIND_CLOUDFLARE=1` y si la petición viene de un rango oficial de Cloudflare.

- **Con el envío directo en pausa**, el botón principal ya no comparte una imagen sin sonido: ahora es «Crear con sonido en WhatsApp» (MP4 listo + pasos para el creador de stickers de WhatsApp, Android con WhatsApp Beta). Compartir como imagen queda como opción secundaria, marcada «sin sonido».

- **«Compartir» volvió a estar visible** en el resultado (quedaba escondido cuando el bot estaba conectado y en computadora). En celular abre el menú de compartir con el sticker; en computadora lo descarga y explica cómo mandarlo por WhatsApp Web.

- Prueba de rendimiento de SQLite intermitente en CI (una sola medición): ahora toma la mejor de 5 tras calentar.

- **Sincronía imagen–sonido en WhatsApp:** un GIF o WebP animado con un sonido más largo ahora se estira (repitiéndose sin saltos) hasta durar lo mismo que el sonido, en lugar de desfasarse en cada vuelta. Hasta 10 s.
- `/saudio` sin duración toma los primeros **10 s** (lo que WhatsApp anima), no 3 minutos.
- La duración de los WebP animados se mide desde sus cuadros (ffprobe informa 0 s).
- En la web, imagen y audio van juntos al reproducir, pausar y continuar (Comunidad y Resultado).

### Agregado

- **«Tu propio WhatsApp» blindado**: la sesión queda atada al navegador que la vinculó (copiarla a otro no sirve), caduca a los 180 días sin uso, se pueden revocar todas con `SVA_SELF_EPOCH`, máximo 3 códigos de vinculación por número por hora (contra acoso), una vinculación en curso solo la ve su navegador, candado por cuenta (nunca dos conexiones del mismo WhatsApp), fila acotada y tiempo máximo por operación, respuestas `no-store` y errores sin datos de la sesión.

### Corregido

- La fila de espera de envíos podía atorarse si alguien se cansaba de esperar; una conexión vieja quedaba abierta al reconectar durante la vinculación; algunos errores escapaban como excepción en vez de respuesta.

- **«Enviar a mi WhatsApp» con tu propio WhatsApp**: cada persona vincula su WhatsApp como dispositivo (código con su número o QR) y el sticker llega **a su propio chat «Tú»** con sonido. Ya no hay un número de Estampido escribiéndole a muchas personas (lo que provoca baneos). La sesión queda **cifrada solo en el navegador** (el servidor no guarda ninguna), la conexión dura segundos, no se lee ni guarda nada de los chats. Packs y colección se envían en una sola conexión. «Desvincular mi WhatsApp» en cualquier momento. Privacidad actualizada.

- **Modo defensa** en `/admin`: durante un ataque, crear stickers queda solo para cuentas vinculadas con WhatsApp; los demás ven «Entra con tu WhatsApp para crear».
- **Más blindaje**: ffmpeg/ffprobe solo abren archivos locales de formatos reales (lista blanca de protocolos y formatos), tope de 8 192 px por lado contra imágenes «bomba», guarda de disco/memoria que pausa conversiones nuevas antes de que el servidor se caiga, tope de 256 KB para formularios, límite propio para pedir lugar en la fila, y salida de ffmpeg acotada.

- **Escudo contra ataques para tirar la página**: tope global de peticiones en curso (503 instantáneo en vez de ahogarse), tope por IP de simultáneas y de ritmo (incluye páginas y archivos), bloqueo automático de 15 min a quien insiste, tiempos de espera contra conexiones lentas, y aviso en los logs. Guía `docs/SEGURIDAD.md` (Cloudflare + firewall de Hetzner).

- **«Sin límite de publicaciones» en /admin**: escribe tu @ (o el de alguien de confianza) y esa cuenta ya no tiene el límite de 30/h y 150/día. Se guarda en la base (sobrevive a los despliegues).

- **Respaldos diarios de la base** (`/data/backups`, 7 diarios + 4 semanales, copia consistente con `VACUUM INTO` y comprimida); en `/admin`: «Respaldar ahora» y «Descargar último».
- **Guía de despliegue actual** (`docs/DEPLOY-COOLIFY.md`) y README al día con todo lo nuevo.

- **Varios archivos a la vez** (hasta 5, sin anunciarlo): el primero queda como clip y los demás se crean solos, uno tras otro, con los mismos ajustes («+N en fila» en la tarjeta del archivo). Si uno falla, la fila se detiene.
- **Publicar varios desde la Colección**: con 2 o más seleccionados, «Publicar N» con un solo formulario (categoría, etiquetas, derechos del audio), con progreso; se detiene si el error se repetiría (sesión, límite).

- **Compartir directo a Estampido (Android)**: con la app instalada, «Compartir» desde WhatsApp o la galería → Estampido abre el video/GIF/foto como clip, o el audio (p. ej. una nota de voz) como sonido. Botón «Instalar app» cuando el navegador lo permite.

- **Tiempo estimado al enviar un pack**: antes de enviar, si va a tardar, avisa «Tardará ~X min» (el bot envía con calma y, con número nuevo, con límites por minuto/hora); durante el envío muestra «N/M enviados · faltan ~X», con el ritmo real.

- **Packs con la marca de la app**: al enviar un pack, cada sticker llega como «<pack> · @creador • Crea más en estampido.isrradev.com» (el autor lo fija la app, no se puede cambiar) y todos comparten el mismo pack en WhatsApp. Se aplica a una copia; el sticker publicado no cambia.
- **«Así lo verán en WhatsApp»** rediseñado como la pantalla real: chat oscuro con tu sticker (texto, emojis y filtro incluidos; lo transparente deja ver el chat), hora con ✓✓, ícono de sonido y la hoja de info del sticker con pack y autor.

- **Restablecer por pestaña**: cada pestaña de ajustes (Tiempo, Sonido, Estilo, Texto, Pack) muestra «Restablecer …» solo cuando cambiaste algo, y regresa únicamente lo suyo.
- **+10 tipografías** (Caricatura, Redonda, Letrero, Pop, Retro, Vintage, Nota, Militar, Terror, Disco → 18 en total), que se descargan solo al aparecer en pantalla.
- **+6 efectos de voz** (Megáfono, Videojuego, Fantasma, Mareado, Coro, Bajo el agua → 14) con su vista previa en «Escuchar».
- **+5 filtros de color** (Noir, Cine, Suave, Negativo, Rosa → 10).

### Corregido

- Prueba de cancelación en cola intermitente en CI (dependía de un tiempo fijo).

- **Mover el texto y emojis como capa**: arrastra cada texto a donde quieras en la vista previa («Volver el texto arriba / abajo» lo regresa); agrega hasta 6 emojis desde una fila rápida, muévelos, cambia su tamaño o quítalos. Todo sale igual en el sticker final.

- **Escuchar el efecto de voz antes de crear**: botón «Escuchar» en Sonido (Web Audio en el navegador, hasta 6 s, aproximado); al tocar otro efecto mientras suena cambia al instante.

- **Vista previa al compartir**: los enlaces de packs (`/p/:id`) y perfiles (`/u/:handle`) en WhatsApp/redes muestran su propio título, descripción e imagen con sus stickers (1200×630, generada una vez y cacheada).

- **Monitoreo**: con `SVA_ALERT_WEBHOOK`, la web avisa (ntfy/Discord) si el bot se cae o WhatsApp queda desconectado más de 5 min, y cuando vuelve; el contenedor tiene `HEALTHCHECK` para que Coolify lo reinicie si la web deja de responder. Guía de monitor externo en `docs/DEPLOY-RAILWAY.md`.
- **Desvincular bot desde /admin** (para cambiar de número sin tocar el teléfono viejo): confirmación escrita, cierra la sesión en WhatsApp y muestra el QR nuevo.

- **Info del sticker que invita**: al tocar un sticker en WhatsApp ahora dice «Busca o crea más en • estampido.isrradev.com» (en vez de «Estampido • estampido») cuando dejas el pack vacío.
- **Duración guiada**: 3/5/10 s arriba (10 s es lo máximo que anima WhatsApp); 30 s–3 min aparte como «Más largo · solo para descargar».

### Cambiado

- **Límite de publicaciones por cuenta, no por IP**: antes eran 10 por hora por IP (con datos móviles mucha gente comparte IP y se frenaban entre sí). Ahora cada cuenta tiene 30 por hora y 150 al día; por IP queda solo un tope alto (120/h) contra abusos. Los intentos fallidos no cuentan y `SVA_UNLIMITED_HANDLES` deja sin límite al dueño.

- **Carga más rápida en celular**: el JS inicial bajó de 1.09 MB a 674 KB (331 → 201 KB comprimido). El formulario de publicar, el de comentarios, el panel de admin, el tour y las animaciones se descargan solo cuando se usan (publicar se precarga al acercar el dedo).

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
