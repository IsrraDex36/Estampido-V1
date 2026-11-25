# Comunidad de Estampido: análisis y UX por fases

> Estado: **Fase 0 hecha** y **fase 1.5 (local) hecha**: ya se puede publicar, explorar con paginación real, usar sonidos de la comunidad en tus propios clips y guardar favoritos. Todavía no hay cuentas ni votos: los datos viven en tu servidor local y los favoritos en tu dispositivo.

## 0. Fase 1.5 local: combinar sonidos, paginación y favoritos

### Combinación: sonidos de la comunidad + tus clips

Cada sticker publicado con audio aporta un **sonido** reutilizable. Hay dos caminos, que terminan en el mismo lugar:

```
Comunidad ─ «Usar sonido» ─▶ /?sonido=<id> ─▶ Crear: el sonido ya está cargado, eliges tu video/GIF/imagen/sticker
Crear ─ Sonido ─ «De la comunidad» ─▶ selector (búsqueda + paginación + escuchar) ─▶ «Usar»
```

- El sonido entra como un **audio propio** normal, así que reutiliza todo el pipeline: tramo, «empieza en», nivelación y límites (10 s para imágenes).
- Se cuenta un **uso** cada vez que alguien elige ese sonido. Ese contador alimenta «Sonidos virales» y el ranking.
- Si publicas un sticker hecho con un sonido de la comunidad, queda enlazado a su origen (`soundId`), así que no hace falta volver a declarar que el audio es tuyo.

### Paginación (por cursor)

- `GET /api/community/stickers?sort=hot|new|top&period=day|week|all&category=&q=&cursor=&limit=` responde `{ items, nextCursor }`.
- El cursor es opaco y lleva `asOf` (el momento de la primera página) más la última clave `(puntuación, id)`.
  - Con `asOf` fijo, la puntuación «hot», que cambia con el tiempo, no reordena las páginas siguientes.
  - Lo publicado después de `asOf` no se cuela a mitad de la lista: aparece al recargar.
  - Resultado: **ni duplicados ni huecos** entre páginas.
- En el cliente se usa `useInfiniteQuery` (TanStack Query): caché por filtros y cancelación al cambiar de filtro. Hay scroll infinito con un `IntersectionObserver` y, como alternativa accesible, el botón «Cargar más». Mientras carga se ven skeletons, cuando no hay más se avisa «No hay más», y si falla aparece «Reintentar».

### Favoritos (en tu dispositivo)

- Guarda **stickers** y **sonidos** con el ícono de marcador (relleno = guardado). Se ven en «Tu espacio» → Guardados / Sonidos, y «Publicados» muestra lo que publicaste desde este dispositivo.
- Se guardan en un store de zustand persistido en `localStorage`, con una copia mínima de cada elemento para que se vean al instante. Cuando existan las cuentas (fase 1), se sincronizan con el servidor.

### Publicar

- En el Resultado, el botón «Publicar» abre una hoja con:
  - categoría (obligatoria);
  - título opcional (máx. 60);
  - hasta 3 etiquetas;
  - la casilla «El audio es mío o tengo permiso», obligatoria si el sonido no viene de la comunidad.
- Se copian el `.webp` y el `.ogg` del resultado (que dura 30 min) al almacenamiento de la comunidad (`.data/community`, persistente y fuera de git).

## 1. Para qué

Hoy Estampido es una **herramienta**: creas un sticker con sonido y te lo mandas. La comunidad lo convierte en un **lugar**: lo que creas otros lo descubren, lo votan, lo guardan y lo comparten en sus chats.

Así se cierra el ciclo **crear → publicar → descubrir → usar → crear**:

```
 Crear (/) ──publicar──▶ Comunidad ──descubrir/votar──▶ Enviar a mi WhatsApp
     ▲                                                          │
     └──────────── «remix»: usar su sonido o clip ◀──────────────┘
```

## 2. Quién la usa

| Perfil                    | Qué quiere                                         | Qué necesita de la UI                                             |
| ------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| **Buscador** (la mayoría) | Encontrar «el sticker perfecto» para reaccionar ya | Búsqueda, categorías, **escuchar al pasar** y enviar en 1 toque   |
| **Creador**               | Que su sticker se vuelva viral                     | Publicar fácil (desde su Colección), ver votos, posición y perfil |
| **Curador**               | Armar packs temáticos                              | Guardar, armar colecciones y compartirlas                         |
| **Moderador**             | Que no haya abuso ni contenido robado              | Cola de reportes, ocultar, banear                                 |

## 3. Arquitectura de información

```
/comunidad
├── Hero            título · «Publicar» · «Crear sticker» · cifras (stickers, creadores, envíos)
├── Barra fija      Tendencias | Nuevos | Top (Hoy · Semana · Siempre) · búsqueda
├── Categorías      17 chips con emoji (Reacciones, Memes, Música, Frases, Voces y doblajes,
│                   Efectos de sonido, Saludos, Amor, Cumpleaños, Fiesta, Animales, Gaming,
│                   Anime, Series y TV, Deportes, Virales, Otros)
├── 01 Feed         cuadrícula de tarjetas de sticker
├── 02 Ranking      podio top 3 + puestos 4–10 del periodo
├── 03 Sonidos      sonidos virales (los más reutilizados → «usar este sonido»)
├── Reto            banner del reto semanal (tema, cierre, participantes, participar)
├── 04 Packs        packs creados por la comunidad
├── 05 Tu espacio   Publicados · Guardados · Votados
└── 06 Creadores    creadores destacados
Futuras: /comunidad/s/:id (detalle) · /comunidad/@usuario (perfil) · /comunidad/packs/:id
```

### Estado del cliente (ya implementado)

- **Filtros** (`orden`, `periodo`, `cat`, `q`) en un store de zustand (`features/community/store`), sincronizados con la URL en ambos sentidos. La URL manda al cargar y al ir atrás o adelante; los cambios usan `replaceState` para no llenar el historial mientras escribes. Los valores inválidos vuelven al predeterminado y la búsqueda se corta a 80 caracteres. Las funciones `parseFilters` y `serializeFilters` son puras y tienen tests.
- Los componentes leen el store con **selectores atómicos** (`useCommunityStore((s) => s.sort)`), así cada uno se vuelve a renderizar solo cuando cambia lo que usa.
- Los **datos del feed** (fase 2) no irán al store, sino a una caché de consultas con cancelación y paginación por cursor. El store guarda solo estado de interfaz.
- **Marcadores vs. skeletons**: sin datos se usan bloques estáticos punteados. `CommunitySkeleton` (mientras carga la ruta) y `StickerCardSkeleton` usan shimmer porque ahí sí algo está cargando.

### Anatomía de la tarjeta (la pieza central)

```
┌──────────────────────┐
│ 🔊 0:04        ⋯     │  duración del sonido · menú (reportar, copiar enlace)
│                      │
│      [ sticker ]     │  se anima y suena al pasar el mouse o al tocar
│                      │
├──────────────────────┤
│ @autor        #memes │
│ ▲ 128   ♡   ↗   ➤   │  votar · guardar · compartir · enviar a WhatsApp
└──────────────────────┘
```

Reglas: el sonido **nunca se reproduce solo** (solo al pasar el mouse o tocar, y solo uno a la vez). Votar es un **toggle optimista**. «Enviar a WhatsApp» reutiliza el envío nativo que ya existe.

## 4. Flujos clave

1. **Publicar.** En la Colección o en el Resultado, botón «Publicar en la comunidad». Abre una hoja con:
   - categoría (obligatoria);
   - hasta 3 etiquetas;
   - título opcional;
   - la casilla **«El audio es mío o tengo permiso»**.

   Al publicar, el sticker queda «en revisión» (automática) y aparece en el feed.
2. **Descubrir y usar.** Feed o búsqueda → pasas el mouse por la tarjeta y la escuchas → «Enviar a WhatsApp» o «Descargar».
3. **Votar.** Un voto por cuenta y sticker; se puede quitar. Sin votos negativos: lo malo se reporta, no se castiga en público.
4. **Compartir.** Enlace `/comunidad/s/:id` con vista previa OG (imagen animada), Web Share API en el móvil y copiar enlace.
5. **Reportar.** Motivo (copyright, ofensivo, spam, otro). A los N reportes se oculta automáticamente hasta que alguien lo revise.

## 5. Ranking

- **Top (Hoy, Semana, Siempre):** límite inferior de **Wilson** sobre (votos ÷ vistas). Así no gana lo que tiene 2 votos de 2 vistas.
- **Tendencias:** puntuación «hot» con decaimiento por antigüedad, `score = log10(1 + votos + 0.3·envíos + 0.2·guardados) − horas / 36`.
- **Antiabuso:** un voto por cuenta, límite de votos por minuto, cuentas nuevas con peso reducido las primeras 24 h y detección de ráfagas desde la misma IP.

## 6. Datos y API (borrador)

```
User       id · handle · avatar · createdAt · role(user|mod|admin) · banned
Sticker    id · authorId · webpKey · audioKey · durationSec · animated · category · tags[] · title?
           status(pending|live|hidden|removed) · votes · saves · sends · views · createdAt
Vote       (userId, stickerId) único · createdAt
Save       (userId, stickerId) único
Pack       id · authorId · name · stickerIds[] · createdAt
Report     id · stickerId · userId · reason · createdAt · resolvedBy?
Challenge  id · title · startsAt · endsAt · tag
```

```
GET  /api/community/stickers?sort=hot|new|top&period=day|week|all&category=&q=&cursor=
GET  /api/community/stickers/:id
POST /api/community/stickers              (publicar desde un resultado: { resultId, category, tags, title, ownsAudio })
PUT  /api/community/stickers/:id/vote     DELETE …/vote
PUT  /api/community/stickers/:id/save     DELETE …/save
POST /api/community/stickers/:id/report
GET  /api/community/ranking?period=
GET  /api/community/challenges/current · /creators · /packs
```

- **Almacenamiento:** los archivos en object storage (R2 o S3) con URLs públicas e inmutables, y los metadatos en Postgres (o SQLite/Turso al inicio).
- **Paginación:** por cursor, no por `offset`.

## 7. Fases

| Fase                       | Qué incluye                                                                                                                                                                      | Criterio de salida                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **0. Esqueleto** ✅        | Router (`/` y `/comunidad`), navegación Crear/Comunidad, todos los apartados con marcadores sin datos, tarjeta con su anatomía final, responsive                                 | Navegable, sin errores, con los mismos tokens visuales |
| **1. Cuentas y publicar**  | Inicio de sesión (vinculando WhatsApp por el bot con código de un solo uso, o GitHub/Google), publicar desde Colección y Resultado, almacenamiento, moderación automática básica | Un usuario publica y ve su sticker en «Publicados»     |
| **2. Feed y votos**        | Feed real con scroll infinito, escuchar al pasar el mouse, votar y guardar (optimista), enviar a WhatsApp o descargar, página de detalle                                         | Votos consistentes; el feed carga en menos de 1 s      |
| **3. Ranking y búsqueda**  | Tendencias, Top por periodo, categorías y etiquetas, búsqueda, compartir con OG                                                                                                  | El ranking resiste el abuso básico                     |
| **4. Social**              | Perfiles, creadores destacados, packs de la comunidad, retos semanales, «remix» (usar el sonido de otro)                                                                         | Retención de creadores                                 |
| **5. Moderación a escala** | Cola de reportes, rol de moderador, huellas de audio contra contenido protegido, límites, avisos de copyright                                                                    | Tiempo de respuesta a reportes menor a 24 h            |

## 8. Principios de UI

- Se mantiene el lenguaje de la herramienta: secciones numeradas, negro puro, 3 colores (neutro, verde para **sonido**, magenta para **acento**) y Pum en los estados vacíos.
- **Marcador ≠ cargando:** mientras no haya datos, se usan bloques estáticos con borde punteado. El shimmer queda solo para cuando algo carga de verdad.
- Los botones que aún no funcionan se ven **desactivados** y llevan un aviso de «Pronto», nada de clics muertos.
- El sonido sigue siendo protagonista: la duración va siempre visible en verde y nada se reproduce solo.
- Accesibilidad: votar y guardar con `aria-pressed`, la tarjeta se puede manejar con el teclado y se respeta `prefers-reduced-motion`.
