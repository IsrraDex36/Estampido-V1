# Protocolo: sound sticker (`audioStickerMessage`)

> Estado al 2026-11-25: **formato confirmado con una captura real** con el envío nativo implementado (`src/adapters/bot/soundSticker.ts`) y **validado en un teléfono real el 2026-11-25**: llega como sticker con 🔊 y suena al tocarlo.

## Lo verificado en el código local

| Hecho                                                                                                                                                                                       | Evidencia                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Baileys `7.0.0-rc14` (último, 29 jul 2026) **no define el campo 134** en `Message`                                                                                                          | `node_modules/baileys/WAProto/WAProto.proto`                         |
| `proto.Message.decode` **descarta en silencio** los campos desconocidos: un mensaje con solo el campo 134 llega vacío                                                                       | `tests/unit/rawCapture.test.ts`                                      |
| `Message.stickerMessage = 26`. El "campo 26" de los foros es el sticker dentro del wrapper, no un campo de audio                                                                            | `WAProto.proto` línea `optional StickerMessage stickerMessage = 26;` |
| Hay un precedente con la misma forma: `lottieStickerMessage = 74` es un `FutureProofMessage` que envuelve un `stickerMessage`                                                               | `WAProto.proto`                                                      |
| En `relayMessage`, el atributo `mediatype` se calcula con `getMediaType()`, que no reconoce el campo 134. Por eso el servidor descarta el envío (coincide con el PR #2110 de whatsapp-rust) | `lib/Socket/messages-send.js`                                        |

## Formato confirmado (captura real, 2026-11-25)

Sticker con sonido creado en la app oficial y enviado al chat propio (llega envuelto en `deviceSentMessage`, campo 31):

```
Message {
  134 audioStickerMessage: FutureProofMessage {
    1 message: Message {
      26 stickerMessage: StickerMessage {
        1 url · 2 fileSha256 · 3 fileEncSha256 · 4 mediaKey · 5 "image/webp"
        6 height=64 · 7 width=64 · 8 directPath · 9 fileLength · 10 mediaKeyTimestamp
        11 firstFrameLength · 12 firstFrameSidecar · 13 isAnimated=1
        17 contextInfo { 74 {…}, 82 … } · 18 stickerSentTs · 19/20/21 = 0
        24 = 0                     ← nuevo (desconocido en rc14)
        25 "🔊"                    ← nuevo (string)
        26 AudioMessage {          ← nuevo: el audio va DENTRO del sticker
          1 url · 2 "audio/ogg; codecs=opus" · 3 fileSha256 · 4 fileLength
          5 seconds · 7 mediaKey · 8 fileEncSha256 · 9 directPath · 10 mediaKeyTimestamp
          17 contextInfo
        }
      }
    }
  }
  35 messageContextInfo { deviceListMetadata, version, messageSecret }
}
```

- El audio es un **`AudioMessage` normal** (mismos números de campo), subido como media separada con su propia `mediaKey`, sin `ptt` ni `waveform`.
- Medios de la captura: el WebP es de 512×512, animado, con 47 frames × 100 ms (4.7 s). El audio es Opus mono a 48 kHz y dura 4.7 s. La animación dura lo mismo que el audio.

## Envío nativo (implementado)

1. `prepareWAMessageMedia` sube el sticker (`sticker`) y el audio (`audio`, `audio/ogg; codecs=opus`).
2. Se construyen a mano (`protobufRaw`) los bytes de `134 → 1 → 26 { …sticker, 25 "🔊", 26 AudioMessage }`.
3. `proto.Message.encode` se envuelve para que agregue esos bytes. También aplica al `deviceSentMessage` que va a los demás dispositivos de uno mismo.
4. `stickerMessage` se pone en el **prototipo** del objeto: `getMediaType()` de Baileys marca `mediatype="sticker"`, pero el codificador, que solo escribe propiedades propias, no duplica un sticker normal.
5. Modos (`SVA_SEND_MODE`): `native` (por defecto), `fallback` (sticker + nota de voz) y `both`. Si el nativo falla, se usa el _fallback_ automáticamente.

Campos de la captura que no replicamos (opcionales): 11/12 (primer frame), 17 (`contextInfo`, con los campos desconocidos 74/82), 18–21 y 24.

## Cómo capturar uno real

> ⚠️ Usa un **número secundario** para el bot. Baileys es no oficial y hay riesgo de baneo.
> `.auth/` y `captures/` contienen claves de sesión y de media: **nunca las subas al repo** (ya están en `.gitignore`).

1. Arranca el bot en modo captura y autoriza a tu número principal:

   ```bash
   SVA_ALLOWED=<tu_numero_con_codigo_pais> npm run bot:capture
   ```
2. Escanea el QR con el **número secundario**: WhatsApp → Dispositivos vinculados.
3. Desde tu número principal (necesita tener la función habilitada), crea o reenvía un **sticker con sonido** al número del bot.
4. En la consola aparece `📦 Captura: campos desconocidos [134] … → captures/<id>/`. Esa carpeta contiene:
   - `raw.bin`: los bytes protobuf exactos
   - `capture.json`: el árbol sin esquema, la vista parcial de Baileys del mensaje interno y la media encontrada
   - `media-*.webp` / `media-*.ogg`: el sticker y el audio descargados y descifrados (si se encontró la clave)
5. Comparte `capture.json` **sin** `raw.bin` ni los campos `mediaKey`/`url` para analizarlo y escribir el envío nativo.

## Packs de stickers (`stickerPackMessage`, campo 86) — investigación 2026-11-25

**Conclusión clave: un pack nativo no puede llevar sonido.** `StickerPackMessage.Sticker` solo tiene `fileName`, `isAnimated`, `emojis`, `accessibilityLabel`, `isLottie` y `mimetype`; no hay audio. Mandar nuestros stickers como pack haría que perdieran el sonido.

Por eso, en la web, **«Colección» envía varios stickers con sonido uno tras otro** (función disponible hoy). El pack nativo queda como opción futura, **sin sonido**, para «añadir todo el pack de un toque».

Lo que se sabe del formato (fuentes comunitarias, sin verificar con Baileys):

| Punto          | Estado                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Contenido      | Un ZIP cifrado con los `.webp` (nombres por hash) + ícono de bandeja (+ `contents.json`, según algunas fuentes)                               |
| Cifrado        | `WhatsApp Sticker Pack Keys`. **Todas las fuentes coinciden** al aplicar la plantilla `WhatsApp ${tipo} Keys` de Baileys                      |
| Ruta de subida | **Discrepancia**: `/mms/sticker-pack` (TomiOka) frente a `/mms/sticker` (Baileys-X). Ninguna fuente lo verifica en vivo                       |
| Miniatura      | JPEG en cuadrícula 2×2, subida aparte con la **misma** `mediaKey` del pack (whatsapp-web.js), tipo `thumbnail-sticker-pack`. HKDF desconocido |
| Envío          | `relayMessage` con `stickerPackMessage` (Baileys no tiene función propia para enviarlo)                                                       |

Fuentes: whatsapp-web.js PR #201913 (cerrado; el autor dice haberlo probado en vivo), Baileys-X PR #28 («not live-verified»), TomiOka PR #6 (probado solo con un socket falso), Baileys issue #1548.

### Cómo capturar un pack real

1. `npm run bot:capture`
2. Desde WhatsApp, comparte un pack de stickers en tu chat contigo mismo (si tu versión lo permite).
3. Se crea `captures/pack-…/` con:
   - `report.json`: si se descifró el ZIP (lo que confirma la clave de cifrado), su contenido y qué HKDF descifró la miniatura;
   - `pack.zip`, `zip-listing.txt`, `contents.json` (si existe), `thumbnail.*` y `stickerPackMessage.json` (contiene claves: es privado).

Con esa captura se implementa el envío del pack con el formato exacto.
