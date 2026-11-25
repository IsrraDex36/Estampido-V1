# Desplegar Estampido en Railway

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

| Variable                  | Para qué                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `SVA_PAIRING_NUMBER`      | Número del bot (con código de país, sin `+`). Muestra un **código** de vinculación en los logs en lugar del QR |
| `SVA_ALLOWED`             | Quién puede usar `/saudio` desde el chat (los códigos de vinculación funcionan para todos)                     |
| `SVA_PACK` / `SVA_AUTHOR` | Metadatos por defecto de los stickers                                                                          |
| `SVA_RATE_PER_MIN`        | Límite de `/saudio` por persona                                                                                |

Ya vienen fijadas en la imagen (no hace falta tocarlas): `SVA_MODE=production`, `SVA_HOST=0.0.0.0`, `SVA_TRUST_PROXY=1` y las rutas en `/data` (`SVA_AUTH_DIR=/data/auth`, `SVA_DATA_DIR=/data`, `SVA_COMMUNITY_DIR=/data/community`). Railway pone `PORT` solo.

## R3. Desplegar y obtener la URL

1. Railway compila y arranca solo (la primera vez tarda unos 3–5 min).
2. **Settings → Networking → Generate Domain** → `https://estampido-xxxx.up.railway.app`.
3. Abre `https://…/api/health` → debe responder `{"ok":true}`.

## R4. Vincular el bot

1. **Apaga el bot de tu Mac** (`Ctrl+C`).
2. En Railway → _Deployments → View logs_, busca:

   ```
   🔑 Código de vinculación: ABCD-1234
   ```
3. En el celular del número del bot: WhatsApp → **Dispositivos vinculados → Vincular un dispositivo → «Vincular con número de teléfono»** → escribe el código.
4. En los logs: `✔ Vinculado…` y luego `✔ Conectado como …`.

La sesión queda guardada en el volumen (`/data/auth`), así que los siguientes despliegues **no** piden volver a vincular.

## R5. Probar

Desde el celular **con datos móviles**: abre la URL → crea un sticker → «Enviar a WhatsApp» → vincula tu WhatsApp con el código → recibe el sticker. Luego comparte la URL.

En producción, el modo «mándamelo sin vincular» está apagado a propósito: todos, tú incluido, vinculan su WhatsApp una vez.

## R6. Mantenimiento

| Tarea             | Cómo                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actualizar        | `git push` a `main` (la CI corre los tests y Railway redespliega)                                                                                                          |
| Ver qué pasa      | _Deployments → logs_ (prefijos `[api]` y `[bot]`); con `SVA_DEBUG=1` se ve cada mensaje que recibe el bot                                                                  |
| Respaldos         | _Volume → Backups_ (la sesión del bot, la comunidad y los vínculos viven ahí)                                                                                              |
| Cambiar de número | Cambia `SVA_PAIRING_NUMBER`, borra `/data/auth` (_Volume → shell_ o con un despliegue de una sola vez) y vincula de nuevo. Los vínculos de los usuarios se reinician solos |
| Costo             | Plan Hobby, unos $5 al mes con uso incluido; revisa _Usage_                                                                                                                |

Durante cada redespliegue hay unos segundos sin servicio: un volumen solo puede montarse en un despliegue a la vez, así que nunca corren dos bots juntos.
