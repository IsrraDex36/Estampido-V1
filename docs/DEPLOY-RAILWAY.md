# Desplegar Estampido en Railway

> **Producción ya no corre en Railway**: la guía actual es [DEPLOY-COOLIFY.md](DEPLOY-COOLIFY.md). Las secciones de vigilante, límites por IP y SEO de aquí siguen aplicando.

Un solo servicio con la web, la API y el bot de WhatsApp, y un volumen en `/data` para lo que debe sobrevivir a cada despliegue.

> ⚠️ **Nunca** corras el bot en tu Mac y en Railway a la vez: se pelean la sesión de WhatsApp.
> ⚠️ Railway usa IPs de centro de datos, que WhatsApp vigila más. Lo ideal es un **número dedicado**; con tu número personal, el riesgo de bloqueo es mayor.

## R0. El repo ya está listo ✅

- `Dockerfile`: Node 24 + FFmpeg reciente (el mismo de la CI) + `tini`. Corre `scripts/start.ts --skip-build` (API en producción + bot, con reinicio automático).
- `railway.json`: build por Dockerfile, **1 réplica**, healthcheck en `/api/health` y reinicio si falla.
- La CI construye la imagen y la prueba en cada push (job «Docker image»).

## R1. Proyecto

1. Entra a <https://railway.com> con tu cuenta de GitHub.
2. **New Project → Deploy from GitHub repo →** `IsrraDex36/Estampido-V1`.
3. En el servicio: **Settings → Source → Branch = `main`** (cada push a `main` despliega).

## R2. Volumen y variables

**Volumen** (clic derecho en el servicio, o _Command palette → Add Volume_):

- Mount path: **`/data`**

**Variables** (pestaña _Variables_ → _Raw Editor_). Pega esto y ajusta los valores:

```
SVA_PAIRING_NUMBER=52155XXXXXXXX
SVA_ALLOWED=52155XXXXXXXX
SVA_PACK=Estampido
SVA_RATE_PER_MIN=6
```

| Variable                       | Para qué                                                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SVA_PAIRING_NUMBER`           | Número del bot (con código de país, sin `+`). Muestra un **código** de vinculación en los logs en lugar del QR                                                       |
| `SVA_ALLOWED`                  | Quién puede usar `/saudio` desde el chat (los códigos de vinculación funcionan para todos)                                                                           |
| `SVA_PACK` / `SVA_AUTHOR`      | Metadatos por defecto de los stickers                                                                                                                                |
| `SVA_RATE_PER_MIN`             | Límite de `/saudio` por persona                                                                                                                                      |
| `SVA_PUBLIC_URL`               | Dominio público canónico (p. ej. `https://estampido.mx`) para Google: canonical, Open Graph, `sitemap.xml` y `robots.txt`. Sin ella se usa el dominio de la petición |
| `SVA_GOOGLE_SITE_VERIFICATION` | Código de verificación de Google Search Console (método «etiqueta HTML», solo el valor de `content`)                                                                 |

Ya vienen fijadas en la imagen (no hace falta tocarlas): `SVA_MODE=production`, `SVA_HOST=0.0.0.0`, `SVA_TRUST_PROXY=1` y las rutas en `/data` (`SVA_AUTH_DIR=/data/auth`, `SVA_DATA_DIR=/data`, `SVA_COMMUNITY_DIR=/data/community`). Railway pone `PORT` solo.

## R3. Desplegar y obtener la URL

1. Railway compila y arranca solo (la primera vez tarda unos 3–5 min).
2. **Settings → Networking → Generate Domain** → `https://estampido-xxxx.up.railway.app`.
3. Abre `https://…/api/health` → debe responder `{"ok":true}`.

## R4. Vincular el bot

**Opción fácil: QR grande en el navegador (`/admin`)**

1. En _Variables_ agrega `SVA_ADMIN_TOKEN` con una contraseña larga (16+ caracteres). **Quita** `SVA_PAIRING_NUMBER` si quieres QR en lugar de código.
2. **Apaga el bot de tu Mac.**
3. Abre `https://<tu-dominio>/admin`, escribe la contraseña y escanea el QR desde WhatsApp → Dispositivos vinculados → Vincular un dispositivo. El QR se renueva solo.
4. La página muestra «Bot conectado …1234».

**Opción con código (sin cámara)**: deja `SVA_PAIRING_NUMBER` y verás el código en `/admin` y en los logs (`🔑 Código de vinculación: ABCD-1234`). Escríbelo en WhatsApp → Vincular con número de teléfono. Tienes ~1 minuto: si caduca, el bot genera uno nuevo solo.

La sesión queda en el volumen (`/data/auth`): los siguientes despliegues no piden volver a vincular.

## R5. Probar

Desde el celular **con datos móviles**: abre la URL → crea un sticker → «Enviar a WhatsApp» → vincula tu WhatsApp con el código → recibe el sticker. Luego comparte la URL.

En producción, el modo «mándamelo sin vincular» está apagado a propósito: todos, tú incluido, vinculan su WhatsApp una vez.

## Vigilante y alertas (S3)

El bot se vigila solo:

- cada 5 min le pregunta a WhatsApp si su dispositivo sigue vinculado;
- detecta caídas largas y mensajes indescifrables (`Bad MAC`).

Además se arregla solo:

- si las pruebas no responden, se reconecta;
- si WhatsApp lo desvinculó, borra la sesión muerta y deja el QR nuevo en `/admin`.

La salud se ve en **`/admin` → Vigilante**.

**Alertas en tu celular, aunque el bot esté caído** (recomendado):

1. Instala la app **ntfy** (Android o iOS, gratis).
2. Inventa un tema difícil de adivinar, por ejemplo `estampido-k3j9x2`, y suscríbete en la app.
3. En Railway → _Variables_: `SVA_ALERT_WEBHOOK=https://ntfy.sh/estampido-k3j9x2`

También acepta webhooks de Discord. Las alertas además llegan a tu chat de WhatsApp contigo mismo, cuando el bot puede enviar (`SVA_ALERT_WHATSAPP=0` para apagarlas). Cada tipo de alerta se repite como máximo cada 30 min, y avisa cuando el bot se recupera.

Con `SVA_ALERT_WEBHOOK` puesto, la **web también vigila al bot**: si el proceso del bot muere o WhatsApp queda desconectado más de 5 minutos, manda una alerta (una sola) y otra cuando vuelve. Esto cubre lo que el vigilante del propio bot no puede avisar (su propia caída).

**Si se cae la página entera** (el servidor apagado), nada dentro del servidor puede avisar. Para eso:

- El contenedor tiene un `HEALTHCHECK` (`/api/health` cada 30 s): si la web deja de responder ~2 min, Docker/Coolify lo marca como enfermo y lo reinicia.
- Un monitor externo gratis (UptimeRobot, Better Stack o el propio ntfy con healthchecks.io) que abra `https://<tu-dominio>/api/health` cada 5 min y te avise si falla. En UptimeRobot: _Add New Monitor_ → HTTP(s) → la URL → alerta por correo o por la app.

## Límites por IP (ajustables)

Por defecto, cada IP puede hacer en 10 minutos (publicar: por hora):

| Nombre           | Acción                                                               | Límite       |
| ---------------- | -------------------------------------------------------------------- | ------------ |
| `convertBrowser` | crear stickers, por navegador (una persona)                          | 40 / 10 min  |
| `convert`        | crear stickers, tope por IP (datos móviles: muchas personas por IP)  | 200 / 10 min |
| `linkCode`       | pedir códigos de vinculación                                         | 30 / 10 min  |
| `send`           | enviar a WhatsApp                                                    | 40 / 10 min  |
| `publish`        | publicar (tope por IP; el límite real es por cuenta: 30/h y 150/día) | 120 / 1 h    |
| `soundUse`       | usar sonidos                                                         | 60 / 10 min  |
| `adminFail`      | contraseñas incorrectas en `/admin`                                  | 10 / 10 min  |
| `api`            | todo lo demás                                                        | 600 / 10 min |

Para pruebas, súbelos con una variable (formato `nombre=N/periodo`, en `s`, `m` o `h`):

```
SVA_LIMITS=convert=100/5m,send=200/10m,api=3000/10m
```

## R6. Mantenimiento

| Tarea             | Cómo                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actualizar        | `git push` a `main` (la CI corre los tests y Railway redespliega)                                                                                                          |
| Ver qué pasa      | _Deployments → logs_ (prefijos `[api]` y `[bot]`); con `SVA_DEBUG=1` se ve cada mensaje que recibe el bot                                                                  |
| Respaldos         | _Volume → Backups_ (la sesión del bot, la comunidad y los vínculos viven ahí)                                                                                              |
| Cambiar de número | Cambia `SVA_PAIRING_NUMBER`, borra `/data/auth` (_Volume → shell_ o con un despliegue de una sola vez) y vincula de nuevo. Los vínculos de los usuarios se reinician solos |
| Costo             | Plan Hobby, unos $5 al mes con uso incluido; revisa _Usage_                                                                                                                |

Durante cada redespliegue hay unos segundos sin servicio: un volumen solo puede montarse en un despliegue a la vez, así que nunca corren dos bots juntos.

## Google (SEO)

El servidor genera `/sitemap.xml` y `/robots.txt` con el dominio real, y pone en cada página su título, descripción, canonical, Open Graph (vista previa en WhatsApp/redes, imagen `og-image.png`) y datos estructurados (`WebApplication`). Para darla de alta en Google:

1. Fija `SVA_PUBLIC_URL` con tu dominio definitivo.
2. En [Google Search Console](https://search.google.com/search-console) agrega la propiedad (prefijo de URL) → método **Etiqueta HTML** → copia solo el valor de `content` en `SVA_GOOGLE_SITE_VERIFICATION` → redeploy → **Verificar**.
3. En Search Console → _Sitemaps_ → envía `sitemap.xml`.
