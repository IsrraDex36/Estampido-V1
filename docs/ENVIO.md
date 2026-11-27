# Envío de stickers a cualquier WhatsApp desde la web

> Objetivo: que **cualquier persona** cree un sticker en la web y lo reciba **con sonido** en su WhatsApp.
> Estado: fases A1–A5 hechas, **probando con el número del dueño como bot**. Las fases S1–S6 (servidor) están pendientes.

## Cómo funciona (vinculación por código)

```
Web: «Enviar a mi WhatsApp»
  └─ no vinculado → la web pide un código ──▶ API ──▶ bot: EST-4K7Q (10 min, un solo uso)
       └─ botón wa.me/<número-del-bot>?text=…EST-4K7Q   (el usuario lo envía desde SU WhatsApp)
            └─ el bot recibe el código → vincula «este navegador ↔ ese chat» → responde «✅ Listo»
                 └─ la web lo detecta (consulta cada 2 s) → envía el sticker con sonido nativo a ese chat
```

- **El usuario escribe primero**: consiente, y WhatsApp no lo ve como spam.
- **No guardamos claves de nadie**: solo «este navegador ↔ este chat».
- **El navegador se identifica** con un id aleatorio guardado en su local storage. La API lo **hashea** (SHA-256) antes de pasarlo al bot; el id en crudo nunca sale de la API ni se escribe en disco.
- **Solo se envía al chat vinculado**: nadie puede mandar stickers a un número arbitrario.
- **Los vínculos dependen del número del bot** (`.data/links/<número>.json`). Si cambias de número, se empieza de cero y la web pide volver a vincular: el usuario escribe primero al número nuevo.
- El número del bot **no se configura**: el bot lo conoce al conectarse y la API lo usa para el enlace `wa.me`.

**Modo local del dueño** (`SVA_OWNER_SELF_SEND`): en desarrollo (`npm run dev`), un navegador sin vincular envía **al chat propio del bot**, como antes, sin pasar por el código. Viene **apagado en producción**: en un servidor público, cualquiera podría mandarte stickers.

## Ahora: con el número del dueño (para probar)

| Fase                            | Contenido                                                                                                                                                                                                                                                       | Estado |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **A1. Vinculación en el bot**   | `LinkStore` (códigos `EST-XXXX` sin caracteres ambiguos, 10 min, un solo uso, máx. 5 intentos por remitente cada 10 min, persistencia atómica). El bot reconoce el código en **chats directos** de cualquier remitente (no hace falta `SVA_ALLOWED`) y responde | ✅     |
| **A2. Envío al chat vinculado** | Endpoint de control `/send` hacia el chat vinculado (reemplaza a «solo a mí»), límite de 10 envíos por minuto por chat, archivos solo de la carpeta de resultados                                                                                               | ✅     |
| **A3. API**                     | `GET/POST/DELETE /api/whatsapp/link` (cabecera `x-estampido-client`), `POST /api/results/:id/whatsapp` (sin vínculo → `409 not_linked`), `status` con el número del bot                                                                                         | ✅     |
| **A4. Web**                     | Diálogo «Vincular WhatsApp» (código, botón para abrir WhatsApp, copiar, espera en vivo, ✅) que se abre solo al enviar sin vínculo; después envía automáticamente. Desvincular. También para la colección                                                       | ✅     |
| **A5. Respaldo + tests**        | «Compartir…» (menú de compartir del celular) y descarga; tests del store, del reconocimiento del código, de los endpoints y de la web                                                                                                                           | ✅     |

**Para probar con tu número**: los amigos te escriben el código a **tu** WhatsApp y el bot les responde desde tu número. Úsalo con pocas personas: el riesgo de bloqueo es de tu cuenta personal.

## Después: servidor y número dedicado

> Pendientes actuales (hosting, número dedicado, otros medios de envío): [PENDIENTES.md](PENDIENTES.md)

| Fase                           | Contenido                                                                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1. Número dedicado**        | Chip prepago o eSIM; `npm run bot:relink` (respalda `.auth`, pide el QR y verifica). Los vínculos se reinician solos                                                                    |
| **S2a. Túnel (hecho)**         | `npm run start:public`: producción en tu Mac + Cloudflare quick tunnel (URL temporal), límites por IP, CSP, publicar requiere vínculo, tope de disco, reinicio automático, `caffeinate` |
| **S2b. Railway (R0 hecho)**    | `Dockerfile` + `railway.json` + volumen `/data` + vinculación con código (`SVA_PAIRING_NUMBER`). Guía: [DEPLOY-RAILWAY.md](DEPLOY-RAILWAY.md)                                           |
| **S2. Despliegue**             | VPS o mini-PC siempre encendido: Docker o systemd, FFmpeg, reverse proxy (Caddy) con HTTPS y dominio, la API detrás del proxy (hoy solo escucha en `127.0.0.1`), CORS y límites por IP  |
| **S3. Vigilante + alertas ✅** | Detectar «conectado pero sin recibir» (como lo de ayer), reconectar o pedir revincular, y avisar al dueño                                                                               |
| **S4. Respaldo oficial**       | WhatsApp Cloud API: sticker + audio aparte, ventana de 24 h, 1 000 mensajes al mes gratis por número. Entra si Baileys cae                                                              |
| **S5. Datos y cuentas**        | Postgres o Turso para vínculos y comunidad; iniciar sesión con este mismo código (cuentas → favoritos sincronizados)                                                                    |
| **S6. Operación**              | Métricas (envíos, fallos, bloqueos), moderación, aviso de privacidad y términos                                                                                                         |

## «Tu propio WhatsApp» (envío a tu chat «Tú»)

Desde noviembre 2026 los botones «Enviar a mi WhatsApp» usan **el WhatsApp de
cada persona** como dispositivo vinculado, y el sticker va a **su propio chat
«Tú»**. Así ningún número de Estampido le escribe a muchas personas (el patrón
que lleva a baneos).

- **Vincular**: la persona escribe su número (solo para pedir el código) y lo
  teclea en WhatsApp → Dispositivos vinculados → Vincular con número de
  teléfono. En computadora también puede escanear un QR.
- **Sesión**: el bot la sella con AES-256-GCM (llave derivada de
  `/data/account.secret`, que nunca sale del servidor) y se la entrega al
  navegador, que la guarda en `localStorage`. **El servidor no guarda ninguna
  sesión.** Cada envío trae la sesión, el bot la abre en memoria, se conecta,
  manda al chat propio, cierra y devuelve la sesión actualizada.
- **Privacidad**: sin historial (`shouldSyncHistoryMessage: () => false`), sin
  consultas iniciales, sin manejadores de mensajes; nada se escribe a disco.
- **Packs y colección**: todos los stickers en **una sola conexión**.
- **Desvincular**: «Desvincular mi WhatsApp» (cierra sesión en WhatsApp y borra
  la copia del navegador) o desde el teléfono.
- Funciona aunque el número del bot esté desconectado (solo necesita que el
  proceso del bot esté corriendo). El bot sigue sirviendo para «Entrar con
  WhatsApp» (cuentas).
- Si `account.secret` cambia, todas las sesiones dejan de abrirse y cada
  persona debe vincular otra vez.

### Blindaje (modelo de amenazas)

| Riesgo                                            | Defensa                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Hackeo del servidor                               | No hay sesiones guardadas: viven selladas en cada navegador                                                  |
| Sesión copiada (logs, capturas, respaldos)        | El sello autentica el id del navegador (AAD): en otro navegador no abre                                      |
| Sesiones olvidadas                                | Caducan a los 180 días sin uso; cada envío las renueva                                                       |
| Incidente: invalidar todas                        | Subir `SVA_SELF_EPOCH` (cambia la llave)                                                                     |
| Acoso con códigos de vinculación a números ajenos | Máx. 3 códigos por número por hora (huella en memoria) + límite por IP                                       |
| Robar una vinculación en curso                    | Solo el navegador que la empezó la ve y la recoge (una vez)                                                  |
| Dos pestañas a la vez                             | Candado por cuenta: nunca dos conexiones del mismo WhatsApp                                                  |
| Mandar a otras personas / archivos del servidor   | Siempre al chat propio; solo archivos de resultados o comunidad (rutas validadas)                            |
| Agotar recursos                                   | 4 conexiones a la vez, fila acotada, tiempo máximo por operación, vinculaciones abandonadas se cierran solas |
| Fugas por logs o cachés                           | Los errores no incluyen la sesión; respuestas con `no-store`                                                 |
| «Bomba» comprimida dentro de una sesión           | Descompresión con tope (16 MB)                                                                               |

### Cuenta = tu propio WhatsApp

Al terminar la vinculación, el bot deriva la **misma huella de cuenta** que usaba
el inicio con código EST- (`HMAC(secreto, número)`) y se la da solo a la API,
junto con el número enmascarado (`…1234`). La API abre la sesión (cookie) y
responde `{ state: "linked", session, me }`; el navegador nunca ve la huella.

Si la cookie vence, `POST /api/self/signin { session }` vuelve a entrar: el bot
solo **abre el sello** (atado a ese navegador) para saber de quién es; no se
conecta a WhatsApp.

El número del bot del admin ya no se usa para nada y queda apagado salvo
`SVA_ADMIN_BOT=1`.
