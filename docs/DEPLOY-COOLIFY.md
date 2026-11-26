# Desplegar Estampido en Hetzner + Coolify

Es como corre producción hoy (`estampido.isrradev.com`): **un solo
contenedor** (web + API + bot de WhatsApp) con un volumen en `/data`. Cada
push a `main` despliega solo (webhook de GitHub → Coolify).

> La guía de Railway ([DEPLOY-RAILWAY.md](DEPLOY-RAILWAY.md)) queda como
> referencia; los límites por IP, el SEO y los detalles del vigilante de esa
> guía aplican igual aquí.

## 1. Servidor y Coolify

1. Hetzner Cloud → servidor **CX23** (2 vCPU, 4 GB), Ubuntu. Activa
   **Backups** del servidor (+20 % del precio, ~€1.2/mes): es lo que protege
   los **archivos** de los stickers (la base tiene además sus propios
   respaldos, ver §6).
2. Instala Coolify (script oficial) y abre su panel.
3. _New Resource_ → _Public/Private Repository_ → este repo, rama `main`,
   **Build Pack: Dockerfile** (usa el `Dockerfile` de la raíz).

## 2. Volumen, puerto y dominio

- **Persistent storage**: monta un volumen en **`/data`** (sesión del bot,
  vínculos, `community.db`, archivos de la comunidad, respaldos).
- **Port**: `8787`.
- **Domain**: `https://estampido.isrradev.com` (Coolify saca el certificado).
- El contenedor trae `HEALTHCHECK` (`/api/health`): si la web deja de
  responder ~2 min, se marca enferma y Coolify la reinicia.

## 3. Variables de entorno

| Variable                | Valor / para qué                                                     |
| ----------------------- | -------------------------------------------------------------------- |
| `SVA_ADMIN_TOKEN`       | **Obligatoria.** Contraseña larga (16+). Habilita `/admin`.          |
| `SVA_PUBLIC_URL`        | `https://estampido.isrradev.com` (SEO, vistas previas al compartir). |
| `SVA_ALERT_WEBHOOK`     | `https://ntfy.sh/<tema-secreto>`: alertas al celular (app **ntfy**). |
| `SVA_PAIRING_NUMBER`    | Opcional: `52…` para vincular con código en vez de QR.               |
| `SVA_ALERT_WHATSAPP`    | `0` para no recibir alertas también en el chat del bot.              |
| `SVA_LIMITS`            | Opcional: ajustar límites por IP (`convert=30/10m,…`).               |
| `SVA_COMMUNITY_MAX_MB`  | Tope de espacio de la comunidad (por defecto 2048).                  |
| `SVA_UNLIMITED_HANDLES` | Tu usuario (p. ej. `isrra`): sin límite de publicaciones por cuenta. |

Ya vienen en la imagen: `SVA_MODE=production`, `SVA_HOST=0.0.0.0`,
`SVA_TRUST_PROXY=1` y las rutas en `/data`.

## 4. Vincular el bot

1. Abre **`https://<dominio>/admin`** y escribe `SVA_ADMIN_TOKEN`.
2. Aparece un **QR grande**. En el teléfono del bot: WhatsApp → _Dispositivos
   vinculados_ → _Vincular un dispositivo_ → escanear.
3. Cuando diga **Conectado**, prueba mandándole un mensaje desde otro número.

**Cambiar de número**: en `/admin` → «Desvincular bot (cambiar de número)»,
escribe `DESVINCULAR`, y vincula el nuevo con el QR que aparece. Las personas
tendrán que volver a «Entrar con WhatsApp». El número nuevo arranca con
límites de envío bajos que suben solos durante un mes (calentamiento).

## 5. Alertas y monitoreo

- **Vigilante del bot** (dentro del bot): reconecta, detecta sesión muerta.
- **Monitor del bot desde la web** (con `SVA_ALERT_WEBHOOK`): avisa **una vez**
  si el bot se cae o WhatsApp queda desconectado más de 5 min, y cuando vuelve.
- **Si se cae el servidor entero** nada interno puede avisar: crea un monitor
  gratis en **UptimeRobot** (HTTP(s) → `https://<dominio>/api/health`, cada
  5 min, alerta por correo/app).

## 6. Respaldos

- **Base de datos** (cuentas, comunidad, packs, seguidores, reportes):
  copia diaria automática en `/data/backups` (7 diarias + 4 semanales).
  En `/admin` → **Respaldos**: «Respaldar ahora» y **«Descargar último»**.
  Descárgalo de vez en cuando y guárdalo **fuera del servidor**.
- **Archivos** de los stickers: Backups del servidor de Hetzner (§1).
- **`/data/account.secret`**: identifica las cuentas a partir del número
  (nunca cambia). Si se pierde, la gente no recupera su cuenta al volver a
  vincular. Cópialo una vez a un lugar seguro (Coolify → _Terminal_ →
  `cat /data/account.secret`) y guárdalo como contraseña.

**Restaurar la base**: detener la app, descomprimir el respaldo
(`gunzip community-AAAA-MM-DD.db.gz`), reemplazar `/data/community/community.db`
(borra `community.db-wal` y `-shm` si existen) y arrancar.

## 7. Actualizar y mantener

- **Desplegar**: push a `main` (y `dev`), Coolify construye y reinicia solo.
- **Ver logs**: Coolify → la app → _Logs_ (busca `[vigilante]`, `[admin]`,
  `[respaldo]`).
- **Limpiar la comunidad de pruebas**: `/admin` → Comunidad → vaciar (pide
  confirmación escrita).
- **Escalar**: si en `/admin` la cola se llena seguido, sube el servidor a
  4 vCPU (las conversiones simultáneas siguen a los núcleos, hasta 4).

## 8. Problemas comunes

| Síntoma                                       | Qué hacer                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `/admin` no muestra QR tras cerrar sesión     | Ya se corrige solo; si no, Coolify → _Restart_.                             |
| «WhatsApp en pausa» en la web                 | El bot no está conectado: `/admin` muestra el estado y el QR.               |
| El bot dejó de responder pero la web funciona | Revisa la alerta del monitor; `/admin` → Vigilante; reinicia si hace falta. |
| Errores 503 «ocupado» al crear                | Mucha demanda: es la cola protegiendo el servidor; considera escalar.       |
| Página no encontrada en `/comunidad/admin`    | La ruta es **`/admin`**.                                                    |
