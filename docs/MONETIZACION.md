# Monetización: anuncios y apoyo al creador

> Estado: **investigación y plan**, sin implementar. Objetivo: que Estampido se
> pague solo (servidor, número, dominio) y deje algo, **sin arruinar la
> experiencia**: anuncios visibles pero contados, nunca en medio de crear.
> Las cifras son estimaciones públicas (fuentes al final); las reales salen
> del panel de AdSense tras unas semanas.

## 1. Cuánto cuesta mantenerlo

| Concepto                        | Costo aprox.                       | Notas                                              |
| ------------------------------- | ---------------------------------- | -------------------------------------------------- |
| Servidor Hetzner CX23 + Coolify | ~€6 / mes (~$120 MXN)              | 2 vCPU, el que usamos hoy                          |
| Número del bot (SIM/plan)       | $100–200 MXN / mes                 | según el plan de la línea 229 873 2115             |
| Dominio `isrradev.com`          | ~$250–350 MXN / año (~$25 MXN/mes) | renovación anual                                   |
| **Fijo mensual**                | **≈ $250–350 MXN (~$15–20 USD)**   | sin contar tu tiempo ni herramientas de desarrollo |
| Escalar (más tráfico)           | +€6–15 / mes por servidor extra    | solo si la cola se llena seguido (`/admin`)        |

Llena aquí lo que no sé con exactitud (tu plan de celular, suscripciones de
desarrollo) para tener el número real de «punto de equilibrio».

## 2. Cuánto pueden dejar los anuncios (realista)

Para tráfico en español de México, en un sitio de entretenimiento/herramienta,
las estimaciones públicas del **RPM de página** (ingreso por cada 1 000 páginas
vistas) van de **~$1 a ~$5 USD**; los números altos (5–15) son de nichos
caros (finanzas) y no aplican aquí. Planeamos con **$1–2 USD**:

| Usuarios al día | Páginas/mes (≈4 por visita) | Ingreso/mes a $1–2 RPM | ¿Cubre el fijo (~$18 USD)? |
| --------------- | --------------------------- | ---------------------- | -------------------------- |
| 100             | 12 000                      | $12–24                 | casi / sí                  |
| 500             | 60 000                      | $60–120                | sí, sobra                  |
| 2 000           | 240 000                     | $240–480               | sí, y paga mejoras         |

Conclusión: con **pocos anuncios bien puestos** basta para cubrir costos desde
unos cientos de usuarios diarios. No hace falta saturar.

## 3. Con quién anunciar

| Opción                                             | A favor                                             | En contra                                                                                                   | Veredicto                                                         |
| -------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Google AdSense**                                 | El que más paga en LATAM, auto-relleno, fácil       | Exige «contenido»: rechaza páginas que son solo herramienta; necesita CMP en Europa                         | **Sí**, pidiendo revisión con Comunidad/packs/perfiles y una guía |
| Patrocinio directo («Patrocinado por…»)            | 100 % para ti, sin scripts ni cookies, se ve limpio | Hay que venderlo (marcas, creadores, tiendas)                                                               | **Sí, complemento**: 1 espacio fijo al mes                        |
| Redes agresivas (Monetag, PropellerAds, popunders) | Aprueban todo                                       | Pop-ups, redirecciones, malware ocasional: destruyen la confianza                                           | **No**                                                            |
| EthicalAds / Carbon                                | Muy limpios                                         | Audiencia de programadores, no es la nuestra                                                                | No                                                                |
| **Anuncios dentro de WhatsApp (bot)**              | —                                                   | Contra las reglas de WhatsApp (mensajes promocionales no solicitados); riesgo directo de bloqueo del número | **Nunca**                                                         |

### Para que AdSense apruebe

- AdSense considera poco apto un sitio que es «solo herramienta»: hay que
  mostrar **contenido propio**. Tenemos Comunidad, packs y perfiles; falta que
  ese contenido **salga en el HTML** (hoy el servidor solo pone título y
  descripción; el resto lo dibuja React). Antes de solicitar:
  1. Prerender ligero de `/comunidad`, `/p/:id` y `/u/:handle` (lista de
     títulos y textos en el HTML inicial).
  2. Una página **«Guía»** (cómo hacer stickers con sonido, ideas, preguntas
     frecuentes) con texto real: la página que más ayuda a aprobar y a SEO.
  3. Política de privacidad actualizada (cookies de anuncios), `ads.txt` en la
     raíz y aviso de cookies (CMP certificado por Google para visitantes de
     Europa/Reino Unido).

## 4. Dónde ponerlos (y dónde jamás)

Reglas base (Better Ads Standards, que Chrome aplica): **nada de pop-ups,
intersticiales antes del contenido, anuncios que parpadean, video con sonido
automático, ni anuncios fijos grandes**; en celular, **menos de 30 %** de la
pantalla con anuncios. Estampido es una app de **sonido**: un anuncio que suena
es inaceptable.

| #   | Lugar                               | Formato                                           | Regla                                                                                    | Por qué funciona                                                      |
| --- | ----------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | **Pantalla de espera al convertir** | 1 rectángulo (300×250) bajo el progreso           | Solo si la espera > 3 s; **desde la 2.ª conversión** de la sesión; nunca tapa «Cancelar» | El usuario está esperando y mirando: alta visibilidad sin interrumpir |
| 2   | **Feed de Comunidad**               | Tarjeta «Anuncio» del mismo tamaño que un sticker | 1 cada **12 stickers** (celular) / **16** (escritorio); máx. 2 por carga                 | Nativo, se lee como parte del feed                                    |
| 3   | **Resultado**                       | 1 banner horizontal **debajo** de las acciones    | Nunca entre el sticker y «Enviar»                                                        | Momento de satisfacción, ya terminó                                   |
| 4   | **Página de pack / perfil**         | 1 tarjeta tras la primera fila                    | Máx. 1 por página                                                                        | Páginas que se comparten: tráfico nuevo                               |
| 5   | Página «Guía»                       | 1–2 bloques entre secciones                       | Contenido ≥ anuncios                                                                     | La página que aprueba AdSense                                         |

**Nunca**: dentro del editor (pestañas de ajustes), en el diálogo de
«Entrar con WhatsApp», en `/admin`, `/cuenta`, en el sticker o sus datos, en
mensajes del bot, en la primera conversión de alguien nuevo, ni como pantalla
completa.

**Frecuencia total**: ~1 anuncio por pantalla como máximo; la primera visita y
la primera conversión **sin anuncios** (primera impresión limpia).

## 5. Cómo implementarlo sin hacer lenta la app

- Cargar el script de anuncios **después** de la primera interacción o cuando
  el navegador esté libre (`requestIdleCallback`), nunca en la carga inicial.
- **Reservar el espacio** del anuncio (alto fijo) para que nada «salte».
- Un componente `<AdSlot place="espera|feed|resultado|pack">` con la regla de
  frecuencia en un solo lugar (fácil de apagar todo con una variable
  `SVA_ADS=0`).
- La CSP actual es estricta: habrá que permitir los dominios de Google solo
  donde haga falta.
- Medir en `/admin`: cuántos anuncios se mostraron y si bajaron las
  conversiones o publicaciones (si bajan, se quitan).

## 6. Apoyo al creador (donaciones)

### Plataformas

| Plataforma                      | Comisión de la plataforma                                                                                                          | Cómo pagan en México          | Veredicto                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------- |
| **Ko-fi**                       | 0 % en propinas únicas (según la mayoría de fuentes; revisar «Contributor Mode») + procesamiento PayPal/Stripe (~3 % + cargo fijo) | Tarjeta, PayPal               | **Principal** (internacional, sencillo) |
| **Mercado Pago (link de pago)** | % según cuándo recibes el dinero (al instante cuesta más; a 14–30 días menos) + IVA                                                | Tarjeta, OXXO, SPEI, saldo MP | **Principal para México**               |
| Buy Me a Coffee                 | 5 % en todo                                                                                                                        | Tarjeta                       | No (más caro que Ko-fi)                 |
| GitHub Sponsors                 | 0 %                                                                                                                                | Tarjeta                       | Opcional (solo para programadores)      |
| Patreon                         | 8–12 %                                                                                                                             | Tarjeta                       | No (pensado para contenido mensual)     |

Las comisiones exactas cambian: confirmar en el panel de cada una antes de
publicar los botones.

### Dónde y cómo pedir (sin molestar)

- Página **«Apoya a Estampido»** (`/apoya`): quién lo hace, en qué se usa el
  dinero (la tabla de costos de arriba), una **meta del mes** con barra
  («$210 de $350 para el servidor») y los dos botones (Ko-fi, Mercado Pago).
- **Footer**: enlace «Apoya ☕» siempre visible, discreto.
- **Después del 3.er sticker** creado: una tarjeta amable, **una sola vez**
  (se recuerda en el navegador), con «Ahora no» que la cierra para siempre.
- **Nunca** en el diálogo de WhatsApp ni bloqueando una función.

### Agradecer (lo que más hace que la gente repita)

- Insignia **«Apoya a Estampido»** en el perfil de creador.
- **Sin anuncios** para quien apoya (se marca su cuenta desde `/admin`).
- Lista de agradecimientos en `/apoya` (solo con permiso).

### Legal (México)

Las donaciones a una persona física son **ingresos** ante el SAT
(plataformas digitales / RESICO según tu caso) y AdSense también. Antes de
cobrar en serio: hablar con un contador y, si conviene, darte de alta en el
régimen adecuado. No es complicado, pero conviene hacerlo desde el inicio.

## 7. Orden recomendado

1. **Apoyo/donaciones** (rápido, sin aprobación de nadie): `/apoya`, footer y
   tarjeta tras el 3.er sticker.
2. **Contenido para AdSense**: página «Guía» y HTML inicial de comunidad/packs.
3. **Solicitar AdSense**; mientras aprueban, preparar `<AdSlot>` y la CMP.
4. Activar **solo 2 lugares** (espera al convertir y feed de comunidad),
   medir 2–4 semanas, y después decidir si se agregan resultado y packs.
5. Probar un **patrocinio directo** mensual cuando haya tráfico estable.

## Fuentes

- RPM por país/nicho (estimaciones de terceros, varían mucho):
  [bannertag: CPM AdSense 2026](https://www.bannertag.com/google-adsense-cpm-rates/),
  [adstimate: cuánto paga AdSense](https://adstimate.com/blog/how-much-does-adsense-pay.html),
  [arbhunter: países y RPM](https://arbhunter.dev/blog/best-countries-ad-arbitrage-2026),
  [bridgingpointsmedia: CPM por país](https://bridgingpointsmedia.com/google-adsense-cpm-rates-by-countries/).
- AdSense y sitios-herramienta:
  [Comunidad AdSense: contenido de poco valor](https://support.google.com/adsense/community-guide/241032356/how-can-you-solve-the-low-value-content-adsense-disapproval-challenge?hl=en),
  [adsenseauditor: «No content» en herramientas](https://adsenseauditor.com/blog/2026/03/29/valuable-inventory-no-content-explained-for-tools-directories-and-image-heavy-sites/),
  [SEJ: política de inventario valioso](https://www.searchenginejournal.com/asktheadsenseguy-how-adsense-affects-seo-and-the-valuable-inventory-policy-update/181908/).
- Experiencias de anuncio prohibidas en móvil:
  [Google: About mobile ad experiences](https://support.google.com/webtools/answer/7073774?hl=en),
  [IAB: Better Ads Standards](https://www.iab.com/news/coalition-better-ads-releases-initial-better-ads-standards-desktop-mobile-web-north-america-europe).
- WhatsApp y mensajes promocionales:
  [WhatsApp Business Messaging Policy](https://business.whatsapp.com/policy),
  [Meta: cumplimiento y spam](https://developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement).
- Donaciones:
  [Ko-fi vs Buy Me a Coffee (comisiones)](https://www.lilachbullock.com/buy-me-a-coffee-vs-ko-fi/),
  [calcfalcon: Ko-fi vs Patreon vs BMC](https://calcfalcon.com/blog/kofi-vs-patreon-comparison/),
  [Mercado Pago México: link de pago](https://www.mercadopago.com.mx/herramientas-para-vender/link-de-pago).
