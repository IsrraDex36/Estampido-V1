# Comunidad de Estampido: análisis y UX por fases

> Estado: **Fase 0 hecha**. La ruta `/comunidad` existe y tiene todos sus apartados, pero sin datos. El resto está diseñado y pendiente.

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
├── Hero            título · búsqueda · «Publicar» · «Crear sticker»
├── Barra           Tendencias | Nuevos | Top (Hoy · Semana · Siempre)
├── Categorías      chips (Reacciones, Memes, Música, Frases, Gaming, Anime, Deportes, Otros)
├── 01 Feed         cuadrícula de tarjetas de sticker
├── 02 Ranking      podio top 3 + puestos 4–10 del periodo
├── 03 Reto         reto semanal (tema, fecha de cierre, participar)
├── 04 Packs        packs creados por la comunidad
├── 05 Tu espacio   Publicados · Guardados · Votados
└── 06 Creadores    creadores destacados
Futuras: /comunidad/s/:id (detalle) · /comunidad/@usuario (perfil) · /comunidad/packs/:id
```

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
