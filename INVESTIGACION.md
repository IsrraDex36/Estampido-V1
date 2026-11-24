# Investigación: stickers con audio en WhatsApp

> Fecha de corte: 24 nov 2026. Fuentes: prensa tech, WABetaInfo, teardowns de APK y PRs/issues de librerías no oficiales (Baileys, whatsapp-rust, bots comunitarios). WhatsApp/Meta **no ha publicado documentación oficial** del formato.

## 1. Resumen ejecutivo

- **Sí existen** los "sound stickers" (figurinhas com áudio) en WhatsApp. Detectados primero en Android beta **2.26.41.3** (oct 2026).
- **Estado:** despliegue **limitado y escalonado** desde ~24 nov 2026 (reportes en Brasil, Italia y medios en español). Sin anuncio oficial de Meta ni fecha de disponibilidad general.
- **Crear** stickers con audio desde la app oficial todavía está restringido a pruebas. Recibirlos/reproducirlos ya funciona para algunos usuarios, también en WhatsApp Web.
- **A nivel de protocolo**, la comunidad identificó un nuevo campo `audioStickerMessage` (**campo 134** de `Message`), un `FutureProofMessage` que envuelve un `stickerMessage` con un audio adjunto. Baileys aún no lo soporta oficialmente: los mensajes llegan vacíos.
- **Oportunidad:** generar stickers animados desde video (WebP) conservando el audio, y enviarlos como sound sticker nativo vía bot, con fallback a sticker + nota de voz.

## 2. Comportamiento de la función (lado usuario)

| Aspecto            | Detalle reportado                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Apariencia         | Sticker normal con icono de altavoz/audio (posición varía según la fuente: arriba-izq en móvil, arriba-der en Web)       |
| Reproducción       | Solo al tocar el sticker; **no** hay autoplay al abrir el chat                                                           |
| Modo silencio      | Respeta el modo silencio del dispositivo                                                                                 |
| Mute               | Icono de volumen en el sticker; la preferencia se recuerda para futuros sound stickers                                   |
| Duración del audio | Imagen estática: hasta **10 s** (grabación o archivo). Desde video: **5 s** del audio original por defecto, reemplazable |
| Creación           | Editor de stickers → icono de onda de sonido → _grabar voz_ o _elegir archivo de audio_                                  |
| Cifrado            | Imagen y audio con cifrado de extremo a extremo                                                                          |

**Discrepancias entre fuentes:** el límite de duración se reporta como 5 s y como 10 s según el tipo de sticker y la build. Tampoco coinciden en la posición del icono. Hay que validarlo en un dispositivo real.

## 3. Detalles técnicos (protocolo, derivado por la comunidad)

> ⚠️ Información de ingeniería inversa. Debe verificarse contra un bundle actual de WhatsApp Web antes de usarse.

- **Campo top-level 134** en `Message`, `audioStickerMessage`: es un `FutureProofMessage` que envuelve un `stickerMessage`.
- El `stickerMessage` interno lleva el audio en un oneof de audio. Una nota comunitaria lo ubica en el **campo 26** del `StickerMessage`.
- **Baileys:** el issue **#2932** (abierto el 24 nov 2026) reporta que estos mensajes llegan como **mensajes vacíos**, porque WAProto descarta el campo 134 al decodificar.
- **whatsapp-rust PR #2110:** sin "unwrap" del wrapper, el envío salía sin media type y el servidor lo descartaba. Según su autor, a esa fecha ni Baileys ni whatsmeow manejaban el wrapper. La corrección no está validada contra WhatsApp Web.
- **Workarounds en bots comunitarios:**
  - `usebridger` PR #352 (merged 24 nov 2026): envío nativo de sound stickers sobre un transporte Baileys. Si la plataforma no lo soporta, se niega a enviar en silencio el sticker sin audio.
  - `zapota` PR #10: comando `.saudio` sobre zapo, más fixes de upload.
  - `bot-completobeto` PR #37 (WIP): comando `saudio` con un fork de Baileys. Falta probar envío y reproducción reales.
  - `Botnovo` PR #116: `figsom`, "figurinha com som nativa (experimental)".
  - `NEO-BOT` PR #8: test de compatibilidad solo para el owner. La reproducción en teléfono no está verificada.
  - Técnica común: escribir los bytes protobuf a mano como _unknown fields_ y forzar el media type `sticker` en la copia local de la librería.
- Formato y códec del audio: **no documentado**. Hipótesis razonable: el mismo pipeline que las notas de voz (`audio/ogg; codecs=opus`). **Pendiente de verificar.**

## 4. Especificaciones de stickers (base actual)

| Tipo                       | Formato      | Tamaño máx.                             | Notas                                                                       |
| -------------------------- | ------------ | --------------------------------------- | --------------------------------------------------------------------------- |
| Estático                   | WebP         | 100 KB                                  | 512×512                                                                     |
| Animado                    | WebP animado | 500 KB (doc. oficial Business Platform) | Un PR de whatsapp-web.js menciona 1 MB, pero conviene usar la cifra oficial |
| Animado (guía comunitaria) | WebP         | —                                       | 512×512, 8–30 FPS, ≤3 s, fondo transparente                                 |

- Usar una **duración de frame uniforme**: hay reportes de WebP rechazados por tener una duración de frame variable.
- Pipeline típico: `ffmpeg` (recorte, escala a 512, fps) → WebP animado → bajar la calidad (~60) hasta quedar por debajo de 500 KB.
- Librerías Node existentes: `wa-sticker-formatter` (genera WebP animado desde GIF/video y añade metadatos EXIF de pack/autor) y `ws-sticker-maker` (sharp + FFmpeg).

## 5. Panorama en otras plataformas

| Plataforma | ¿Stickers con sonido nativos?                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| Telegram   | No. Solo propuestas de usuarios en bugs.telegram.org. Sí tiene stickers en video (WebM/VP9, sin audio) |
| Signal     | No. APNG animado ≤3 s, ≤300 KB                                                                         |
| Discord    | No. Solo animados                                                                                      |
| iMessage   | Solo mediante apps de terceros (p. ej. Soundmoji)                                                      |

WhatsApp sería **la primera app de mensajería grande** con sound stickers nativos.

## 6. Alternativas previas (pre-función nativa)

- Apps como "Sticker y sonido" (Google Play, 2020), Whatsticker Sound Effects y Soundmoji (iOS). Ninguna era nativa: enviaban el audio aparte.
- Workaround manual: enviar el sticker y justo después una nota de voz.
- Los clientes modificados (mods) **arriesgan suspensión de la cuenta**.

## 7. Riesgos

- **Protocolo no oficial:** puede cambiar sin aviso. Las librerías no oficiales (Baileys) arriesgan el **baneo del número**.
- **Rollout parcial:** un receptor sin soporte puede ver un mensaje vacío o solo la imagen. Hace falta fallback.
- **Copyright:** el audio de videos de terceros puede infringir derechos.
- **Abuso:** spam de audio. Mitiga que la función respete el silencio y no tenga autoplay.

## 8. Preguntas abiertas (a verificar)

1. ¿Qué códec y contenedor usa el audio? ¿Opus/OGG como los PTT?
2. ¿Cuál es el límite real de duración y tamaño del audio?
3. ¿El audio se sube como media separada (con su propia `mediaKey`/`directPath`) o va embebido?
4. ¿Qué ve un cliente sin soporte?
5. ¿Hay soporte en packs de stickers (`stickerPackMessage`)?

## 9. Fuentes

**Prensa / WABetaInfo**

- https://wabetainfo.com/whatsapp-is-testing-a-new-sound-sticker-format-on-android/
- https://www.androidauthority.com/whatsapp-sound-stickers-apk-teardown-3724247/
- https://maketecheasier.com/whatsapp-sound-stickers-teardown/
- https://www.digitaltrends.com/phones/whatsapp-sound-stickers-android-chat-box/
- https://propakistani.pk/2026/10/13/whatsapp-working-on-stickers-that-can-play-sound/
- https://www.archyde.com/whatsapp-begins-rolling-out-audio-stickers-to-users-in-brazil/
- https://www.canal26.com/tecnologia/2026/11/24/whatsapp-habilito-los-stickers-con-audio-como-crear-imagenes-con-voz-frases-y-efectos-de-sonido-de-hasta-10-segundos/
- https://www.publimetro.co/tecnologia/2026/11/24/whatsapp-estrena-stickers-con-audio-asi-funcionan-y-como-puede-crear-los-suyos/
- https://www.adslzone.net/noticias/whatsapp/stickers-sonido-whatsapp-beta/
- https://www.tomshw.it/altro/whatsapp-porta-l-audio-negli-sticker-per-alcuni-utenti
- https://antihype.com.br/c/software/figurinhas-com-som-whatsapp-como-ouvir/
- https://canaltech.com.br/apps/fabrica-de-memes-whatsapp-testa-novo-formato-de-figurinhas-que-falam/
- https://borncity.com/news/whatsapp-audio-sticker-neue-motive-spielen-ton-erst-nach-fingertipp/
- https://www.digit.in/news/apps/love-whatsapp-stickers-you-may-soon-get-option-to-add-sound-to-your-sticker-packs-what-we-know.html
- https://www.ma-no.org/en/software/how-to-create-animated-stickers-with-sound-on-whatsapp

**Código / foros de desarrollo**

- https://github.com/WhiskeySockets/Baileys/issues (issue #2932)
- https://github.com/oxidezap/whatsapp-rust/pull/2110
- https://github.com/murillous/usebridger/pull/352
- https://github.com/idlanyor/zapota/pull/10
- https://github.com/alpizar269708-crypto/bot-completobeto/pull/37
- https://github.com/yosheloa-stack/Botnovo/pull/116
- https://github.com/nabilboubakri23-del/NEO-BOT/pull/8
- https://baileys.wiki/proto-reference/Message/classes/StickerMessage
- https://www.Github.com/pedroslopez/whatsapp-web.js/pull/2807

**Specs**

- https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/sticker-messages/
- https://npmjs.com/package/wa-sticker-formatter
- https://pkg.go.dev/github.com/miruchigawa/sticker-go
- https://core.telegram.org/stickers/webm-vp9-encoding
