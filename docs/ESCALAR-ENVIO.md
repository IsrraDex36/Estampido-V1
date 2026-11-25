# Cómo llevar los stickers con sonido a muchas personas

> Investigación y análisis, 25 nov 2026. Fuentes al final. Muchas son blogs de terceros; donde se contradicen, se indica.

## 1. Hechos que cambian el análisis

| Hecho                                                                                                                                                                                                        | Por qué importa                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Desde el 24 nov 2026, usuarios normales (sin beta) ya pueden recibir, reproducir, guardar en favoritos y reenviar stickers con sonido.** Crearlos sigue solo en beta                                       | Cada persona necesita recibir **cada sticker una sola vez**: lo guarda en favoritos y luego lo usa y reenvía con su propia cuenta. El volumen por usuario es bajo y el reenvío hace crecer el uso de forma viral |
| WhatsApp limita el audio: **≤ 5 s en stickers animados o de video** y ≤ 10 s en estáticos                                                                                                                    | Nuestra web permite tramos de hasta 3 min. Enviar algo que la app oficial no podría crear es una señal rara. Conviene respetar esos límites en el envío nativo                                                   |
| El sticker con sonido es el **campo 134** (`audioStickerMessage`), sin documentar ([PROTOCOLO.md](PROTOCOLO.md))                                                                                             | La API oficial (Cloud API) no lo ofrece: manda stickers (WebP ≤ 500 KB) y audio, pero **por separado**. Hoy, solo un cliente no oficial (Baileys) entrega el sticker con sonido nativo                           |
| Baileys va contra los términos de WhatsApp. No hay una ofensiva ni demandas confirmadas en 2026, pero sí bloqueos reportados (sobre todo por envíos masivos). Un número bloqueado así casi nunca se recupera | El riesgo existe y no se puede eliminar, solo **acotar**: que caiga un número desechable y no la cuenta de un usuario                                                                                            |
| Una cuenta admite **4 dispositivos vinculados**, que se cierran si el celular principal pasa unos 14 días sin uso                                                                                            | Limita la idea de que cada usuario vincule su propia cuenta (ver §3)                                                                                                                                             |
| Precios de la Cloud API en México (oct 2026, de terceros): utilidad ≈ $0.0085 por mensaje; servicio con 1 000 gratis al mes por número y después cobro (las fuentes no coinciden), más 16 % de IVA           | Es barato, pero sin sonido nativo pierde la gracia del producto                                                                                                                                                  |

## 2. Opciones evaluadas

| #     | Opción                                                                                      | Sonido nativo                                    | Escala                                  | Riesgo                                                                                             | Costo                                     |
| ----- | ------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **A** | **Bot con números dedicados (pool)**: el usuario escribe primero (código) y el bot responde | ✅                                               | Alta si se reparte entre varios números | Bloqueo de un número del pool (desechable); los usuarios no arriesgan nada                         | Chip prepago por número + servidor        |
| **B** | Cloud API oficial                                                                           | ❌ (sticker + audio aparte)                      | Muy alta                                | Ninguno (oficial)                                                                                  | ≈ $0.0085 por mensaje después de la cuota |
| **C** | Cada usuario vincula **su** WhatsApp y se lo envía a sí mismo                               | ✅                                               | Difícil: una sesión por usuario         | **Alto para el usuario** (su cuenta personal) y para nosotros (custodiar acceso total a sus chats) | RAM por sesión, cifrado, soporte          |
| **D** | Exportar el clip (≤ 5 s con audio) para el **creador oficial** de WhatsApp                  | ✅ (lo arma el usuario)                          | Infinita                                | Cero                                                                                               | Cero                                      |
| **E** | **Canal de WhatsApp «Estampido»** con los sonidos de la comunidad                           | ❓ (por probar: los canales ya aceptan stickers) | Un envío llega a todos los seguidores   | Bajo: un solo número, poco volumen                                                                 | Cero                                      |
| F     | App nativa con paquetes «Añadir a WhatsApp»                                                 | ❌ (los paquetes no llevan audio)                | Alta                                    | Bajo                                                                                               | Play Store y mantenimiento                |

### Sobre C (la idea de que cada quien use su número)

Suena ideal, pero:

1. Un dispositivo vinculado tiene **acceso total**: leer chats y contactos y escribir como el usuario. Si el servidor se compromete, se exponen las cuentas de todos. Además implica obligaciones legales (aviso de privacidad, LFPDPPP en México) y genera desconfianza: «vincula tu WhatsApp a esta página» es justo lo que hacen las estafas.
2. Si Meta detecta el cliente no oficial, **el bloqueo cae en la cuenta personal del usuario**, que probablemente no entiende el riesgo.
3. Ocupa uno de sus 4 espacios de dispositivo, y cada sesión consume memoria y requiere reconexiones.

Una versión con menos riesgo, solo como «modo avanzado» voluntario: las credenciales se guardan **cifradas en el navegador del usuario** (no en el servidor) y la sesión se abre solo para enviar y se cierra después. Aun así, el riesgo de bloqueo sigue siendo del usuario. **No como opción por defecto.**

## 3. Recomendación: estrategia por capas

1. **Ahora (con la mudanza a Hetzner):** bot con **número dedicado** (S1), solo respuestas, como hoy:
   - Respetar los límites oficiales en el envío nativo: **≤ 5 s** en animados y ≤ 10 s en estáticos (avisar en la web si el tramo es más largo).
   - Topes por número: envíos por minuto (ya existe: 10 por chat) y por día (nuevo).
   - Después de enviar, mostrar el tip «Guárdalo en favoritos ⭐ y reenvíalo» para que cada sticker se mande una sola vez por persona.
2. **Cuando crezca: pool de números** (A):
   - Cada usuario queda asignado a un número.
   - Si un número cae, el vigilante (S3) reasigna a otro y avisa.
   - Los números nuevos se «calientan» con poco volumen antes de usarse a fondo.
   - Agregar números según el uso diario. Meta no publica umbrales: empezar con topes bajos y medir.
3. **Red de seguridad: Cloud API (B)** como respaldo automático si todo el pool cae. Envía sticker + audio aparte; no es lo mismo, pero el usuario no se queda sin nada.
4. **Crecimiento sin riesgo:**
   - Probar el **canal** (E): publicar los sonidos más usados de la comunidad; si el canal acepta stickers con sonido, un solo envío llega a todos los seguidores.
   - Cuando el creador oficial salga de beta, agregar **«Exportar para WhatsApp»** (D).
5. **Opción C:** solo como modo avanzado voluntario (diseño cifrado en el navegador), si alguna vez se justifica.

**Volumen de referencia:** 1 000 usuarios × 10 stickers al mes ≈ 10 000 envíos al mes (≈ 330 al día). Con el modelo «guardar en favoritos» la cifra baja, porque los reenvíos los hace el usuario con su propia cuenta. Repartido entre 2 o 3 números es un volumen moderado por número; eso no garantiza que no haya bloqueos, solo baja la probabilidad.

## 4. Siguientes pasos concretos

- [x] **Hecho (25 nov):** los 2 caminos en Resultado («Enviar a mi WhatsApp» y «Crearlo tú en WhatsApp» con MP4 de ≤ 5 s / 10 s, `GET /api/results/:id/whatsapp.mp4`) y un tour de bienvenida que explica las opciones, la situación actual, el plan a futuro y la privacidad

- [ ] Mudanza a Hetzner + número dedicado ([PENDIENTES.md](PENDIENTES.md))
- [ ] Límite de 5 s / 10 s para el envío nativo y aviso en la web
- [ ] Tip «guárdalo en favoritos» después de enviar
- [ ] Tope diario por número + métricas (envíos y fallos por número)
- [ ] Probar un canal: publicar un sticker con sonido vía Baileys (newsletter) y verificar si llega con sonido
- [ ] Diseñar el pool (asignación de usuario → número, failover en el vigilante)
- [ ] Evaluar la Cloud API como respaldo (verificación de Meta, número aparte)

## Fuentes

- Stickers con sonido, despliegue y límites: [Archyde](https://www.archyde.com/whatsapp-rolls-out-sound-stickers-without-official-announcement-creation-tools-limited/), [World Today Journal](https://world-today-journal.com/whatsapp-rolls-out-audio-stickers-how-to-create-send-and-what-you-need-to-know/), [Archynewsy](https://www.archynewsy.com/whatsapp-users-receive-audio-stickers-in-brazil-creation-tool-stays-in-beta/), [WABetaInfo](https://wabetainfo.com/whatsapp-is-rolling-out-new-sound-sticker-messages-on-android/), [9to5Mac](https://9to5mac.com/2026/11/25/whatsapp-testing-stickers-with-audio-including-make-your-own-option/), [Particle](https://particle.news/story/whatsapp-rolls-out-stickers-with-short-audio-clips)
- Cloud API (stickers y tipos): [Meta: sticker messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/sticker-messages/), [Meta changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog), [Message types (infiq)](https://www.infiq.in/glossary/message-types)
- Precios en México: [goeva.ai](https://www.goeva.ai/en/resources/whatsapp-business-api-pricing-mexico), [aissist.io](https://aissist.io/insights/whatsapp-business-api-pricing), [go4whatsup](https://www.go4whatsup.com/mexico/whatsapp-business-api-pricing/), [zernio](https://zernio.com/blog/whatsapp-business-api-pricing)
- Riesgo de Baileys: [pipes.bot](https://www.pipes.bot/blog/baileys-vs-whatsapp-cloud-api-ban), [genuka](https://wa.genuka.com/en/docs/compare/unofficial-whatsapp-apis), [SocialMate](https://socialmate.app/blog/baileys-whatsapp/), [adviseai](https://www.adviseai.in/blog/whatsapp-automation-ban-risk), [checkleaked](https://whatsapp.checkleaked.cc/blog/avoid-whatsapp-ban)
- Dispositivos vinculados: [WhatsApp blog](https://blog.whatsapp.com/one-whatsapp-account-now-across-multiple-phones), [Gulf News](https://gulfnews.com/lifestyle/your-whatsapp-could-still-be-linked-to-a-device-you-dont-use-or-dont-own-heres-how-to-check-1.500694345)
- Canales y stickers: [WhatsApp Channels](https://www.whatsapp.com/channels?lang=en), [TweakTown](https://www.tweaktown.com/news/94624/whatsapp-is-bringing-stickers-to-channels-for-the-very-first-time/index.html)
