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

| Fase                        | Contenido                                                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1. Número dedicado**     | Chip prepago o eSIM; `npm run bot:relink` (respalda `.auth`, pide el QR y verifica). Los vínculos se reinician solos                                                                    |
| **S2a. Túnel (hecho)**      | `npm run start:public`: producción en tu Mac + Cloudflare quick tunnel (URL temporal), límites por IP, CSP, publicar requiere vínculo, tope de disco, reinicio automático, `caffeinate` |
| **S2. Despliegue**          | VPS o mini-PC siempre encendido: Docker o systemd, FFmpeg, reverse proxy (Caddy) con HTTPS y dominio, la API detrás del proxy (hoy solo escucha en `127.0.0.1`), CORS y límites por IP  |
| **S3. Vigilante + alertas** | Detectar «conectado pero sin recibir» (como lo de ayer), reconectar o pedir revincular, y avisar al dueño                                                                               |
| **S4. Respaldo oficial**    | WhatsApp Cloud API: sticker + audio aparte, ventana de 24 h, 1 000 mensajes al mes gratis por número. Entra si Baileys cae                                                              |
| **S5. Datos y cuentas**     | Postgres o Turso para vínculos y comunidad; iniciar sesión con este mismo código (cuentas → favoritos sincronizados)                                                                    |
| **S6. Operación**           | Métricas (envíos, fallos, bloqueos), moderación, aviso de privacidad y términos                                                                                                         |
