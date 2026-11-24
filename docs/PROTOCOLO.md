# Protocolo: sound sticker (`audioStickerMessage`)

> Estado al 2026-11-24: **hipótesis + herramienta de captura lista**. Falta capturar un sticker real.

## Lo verificado en el código local

| Hecho                                                                                                                                                                                       | Evidencia                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Baileys `7.0.0-rc14` (último, 29 jul 2026) **no define el campo 134** en `Message`                                                                                                          | `node_modules/baileys/WAProto/WAProto.proto`                         |
| `proto.Message.decode` **descarta en silencio** los campos desconocidos: un mensaje con solo el campo 134 llega vacío                                                                       | `tests/unit/rawCapture.test.ts`                                      |
| `Message.stickerMessage = 26`. El "campo 26" de los foros es el sticker dentro del wrapper, no un campo de audio                                                                            | `WAProto.proto` línea `optional StickerMessage stickerMessage = 26;` |
| Hay un precedente con la misma forma: `lottieStickerMessage = 74` es un `FutureProofMessage` que envuelve un `stickerMessage`                                                               | `WAProto.proto`                                                      |
| En `relayMessage`, el atributo `mediatype` se calcula con `getMediaType()`, que no reconoce el campo 134. Por eso el servidor descarta el envío (coincide con el PR #2110 de whatsapp-rust) | `lib/Socket/messages-send.js`                                        |

## Forma probable

```
Message {
  134: FutureProofMessage {          // audioStickerMessage
    1: Message {
      26: StickerMessage { url, mediaKey, mimetype: "image/webp", isAnimated, … , ??? }
      ??? audio: ¿AudioMessage (campo 8) hermano? ¿campo nuevo dentro de StickerMessage?
    }
  }
}
```

Lo que **falta confirmar con una captura**:

1. ¿Dónde va el audio? Puede ser un `audioMessage` (campo 8) al lado del sticker, o un campo nuevo dentro de `StickerMessage`.
2. ¿Qué códec/mimetype usa el audio? (¿`audio/ogg; codecs=opus`?)
3. ¿El audio se sube como media separada (con su propia `mediaKey`/`directPath`)?
4. ¿Qué `mediatype` lleva el nodo `<enc>`? ¿`sticker`?

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

## Envío

- **Hoy (fallback):** `/saudio` envía el sticker y después el audio como nota de voz (`ptt`).
- **Nativo (pendiente de la captura):** construir los bytes del campo 134 con `src/utils/protobufRaw.ts`, envolver `proto.Message.encode` para añadirlos y forzar `mediatype` en `relayMessage`.
