# Pendientes (contexto rápido)

> Actualizado: 25 nov 2026. Resumen corto para retomar sin releer todo. El detalle técnico está en [ENVIO.md](ENVIO.md) y [DEPLOY-RAILWAY.md](DEPLOY-RAILWAY.md).

## Dónde estamos

- **En producción en Railway**: un solo contenedor (web + API + bot), volumen `/data` y vinculación desde `/admin`.
- **El bot usa el número personal del dueño.** No correr el bot en local mientras Railway esté encendido: dos sesiones del mismo número se pelean y el bot deja de recibir.
- **Web pulida (nov 2026)**: recortador de video y de audio, fondos y encuadre libre en «Estilo», «Tiempo» con cuadros de inicio y fin, vista de Pack como en WhatsApp, y panel de Resultado (WhatsApp / Publicar / Colección / Descargar).

## 1. Mudar el hosting (Railway → Hetzner + Coolify)

**Por qué:** Railway cobra por uso, a unos $10 por GB de RAM al mes más la CPU. Un contenedor siempre encendido puede llegar a $15–30 al mes. Hetzner CX23 (2 vCPU, 4 GB) cuesta unos €6 al mes, precio fijo.

**Antes de decidir:** revisar en Railway → *Usage* cuánto se pagó el último mes. Si fueron $8 o menos, la mudanza puede esperar.

Ranking de la investigación:

| #   | Opción                    | ≈ Costo al mes | Nota                                                                                           |
| --- | ------------------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| 1   | **Hetzner CX23 + Coolify** | €6             | Recomendado. Precio fijo, despliega al hacer push, sobra CPU para FFmpeg                        |
| 2   | Oracle Always Free (ARM)  | $0             | Para pruebas. Reportes de recorte en 2026, «out of capacity», imagen ARM                        |
| 3   | Fly.io                    | $7             | Usa el Dockerfile tal cual; CPU compartida débil para FFmpeg                                    |
| 4   | Contabo / Hostinger       | $5–8           | Mucha RAM; rendimiento o renovación irregulares                                                 |
| 5   | Render                    | $7 → $25       | 512 MB no alcanza                                                                              |

Pasos (uno a la vez, confirmando cada uno):

- [ ] Ver el costo real en Railway
- [ ] Crear cuenta en hetzner.com/cloud **← siguiente paso**
- [ ] Crear el servidor CX23 (Ubuntu) y verificar el precio en la consola
- [ ] Instalar Coolify y usar el firewall de Hetzner (no UFW)
- [ ] Conectar el repo de GitHub, volumen `/data`, variables de entorno (`SVA_ADMIN_TOKEN`, etc.)
- [ ] **Apagar Railway** → vincular WhatsApp con el QR de `/admin` en el servidor nuevo
- [ ] Dominio + HTTPS (Coolify/Caddy) y probar crear → enviar desde el celular
- [ ] Borrar el servicio de Railway cuando todo funcione una semana

## 2. Número dedicado (fase S1)

Pasar el bot a un chip prepago o eSIM con `npm run bot:relink`, para que un bloqueo no afecte la cuenta personal. Conviene hacerlo **junto con la mudanza**, porque de todos modos hay que volver a vincular.

## 3. ¿Seguir enviando por número de WhatsApp o usar otro medio?

**Contexto:** el bot usa Baileys, un cliente no oficial. Va contra los términos de WhatsApp y el riesgo de bloqueo es real, aunque bajo si el bot **solo responde** (es nuestro caso: envía a chats vinculados por código). Es la **única** vía que hoy entrega el sticker **con sonido** de forma nativa.

| Opción                                                       | ¿Con sonido?                                       | Riesgo / costo                                                                           | Veredicto                                             |
| ------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Bot actual con número dedicado (S1)**                       | ✅ nativo                                           | Bloqueo posible (no oficial); solo respuestas reduce el riesgo                            | **Conservar** como vía principal                       |
| **Descargar / Compartir (ya existe)**                        | ❌ (el sonido va aparte en .ogg)                    | Cero                                                                                     | **Conservar** siempre como respaldo                    |
| **Exportar el clip para el creador de stickers con sonido de WhatsApp** | ✅ lo arma el usuario en WhatsApp                   | Cero. WhatsApp lo está probando en beta (Android/iOS, nov 2026); aún no llega a todos    | **Agregar** cuando salga para todos: plan B sin riesgo |
| WhatsApp Cloud API (oficial, S4)                             | ❌ sticker (WebP ≤ 500 KB) + audio aparte           | Verificación de Meta, número aparte; 1 000 mensajes de servicio gratis al mes y luego por mensaje | Solo si Baileys cae                                    |
| App nativa con «Añadir a WhatsApp» (paquetes)                | ❌                                                  | Play Store, paquetes de 3–30 stickers, animación ≤ 10 s                                   | No vale la pena                                        |
| Bot de Telegram                                              | ❓ (stickers de video WEBM; sonido sin confirmar)   | Oficial y gratis, otro público                                                           | Baja prioridad                                         |

**Análisis completo para escalar a muchas personas:** [ESCALAR-ENVIO.md](ESCALAR-ENVIO.md).

**Recomendación:** conservar el bot, pasarlo a número dedicado y mantener «Compartir/Descargar». Cuando el creador de stickers con sonido de WhatsApp llegue a todos, agregar un botón «Exportar para WhatsApp» (MP4 del tramo con su audio) como plan B sin riesgo.

## 4. Pendientes chicos

- [ ] `gh auth login` para revisar el CI desde aquí; confirmar que `ae562ca` salió verde (el `0410c25` falló por formato de Biome, ya corregido)
- [ ] Probar en el celular el panel de Resultado nuevo: enviar, vincular, compartir, publicar y colección
- [ ] Probar fondos y encuadre con videos verticales reales y PNG con transparencia
