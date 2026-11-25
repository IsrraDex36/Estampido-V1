# Política de seguridad

## Reportar una vulnerabilidad

**No abras un issue público.** Repórtala de forma privada desde la pestaña **Security → Report a vulnerability** de este repositorio (GitHub Security Advisories).

Incluye:

- qué componente afecta (web, API, bot, despliegue);
- los pasos para reproducirla y su impacto;
- si la conoces, una posible solución.

Recibirás respuesta lo antes posible. Te pedimos no divulgarla hasta que esté corregida.

## Qué nos importa especialmente

- Acceso a sesiones o credenciales del bot de WhatsApp (`.auth/`, `/data/auth`).
- Envío de stickers a chats que no corresponden (vinculación por código).
- Lectura de archivos fuera de las carpetas de resultados o de la comunidad (path traversal).
- Inyección de código en el HTML (CSP, metadatos SEO, cabeceras).
- Saltarse los límites por IP o el token de `/admin`.

## Buenas prácticas para quien despliega

- Usa un `SVA_ADMIN_TOKEN` largo (16+ caracteres) y no lo compartas.
- Usa un **número dedicado** para el bot, nunca el personal.
- No expongas el puerto de control del bot; solo el servidor web.
- Mantén FFmpeg, Node.js y las dependencias actualizadas.
