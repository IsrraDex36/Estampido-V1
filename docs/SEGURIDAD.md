# Seguridad: que no tiren la página

Un ataque para «tirar la página» (DoS/DDoS) llega por dos vías:

| Tipo                    | Ejemplo                               | Quién lo frena                       |
| ----------------------- | ------------------------------------- | ------------------------------------ |
| **Red** (capa 3/4)      | inundar la IP con paquetes, SYN flood | **Cloudflare + firewall de Hetzner** |
| **Aplicación** (capa 7) | miles de peticiones a la web o la API | Cloudflare **y** el escudo de la app |

La app **no puede** defenderse sola de la primera: los paquetes llegan antes que
el código. Por eso lo más importante es **esconder la IP del servidor detrás de
Cloudflare y cerrar la puerta directa**. Hoy la IP real (`5.222.8.144`) está
publicada en el DNS: cualquiera puede atacarla directo.

## 1. Recuperarla ahora (si no carga)

1. **Hetzner Cloud** → tu servidor → pestaña **Graphs**: si CPU o red están al
   tope, es saturación.
2. Pon primero el **firewall** del paso 3 (corta el ataque directo a la IP).
3. Si sigue sin responder: **Power → Reset** (o _Reboot_) desde Hetzner.
   Coolify y la app arrancan solos.

## 2. Cloudflare delante (gratis) — lo más importante

1. Crea cuenta en **cloudflare.com** → _Add a domain_ → `isrradev.com` → plan
   **Free**.
2. Cloudflare te da **2 nameservers**. En GoDaddy (donde está hoy el DNS:
   `domaincontrol.com`) → _Dominio_ → _Nameservers_ → _Cambiar_ → pega los de
   Cloudflare. Tarda de minutos a unas horas.
3. En Cloudflare → **DNS**: el registro `A estampido → 5.222.8.144` con la
   **nube naranja (Proxied)** encendida. Así el mundo ve IPs de Cloudflare, no
   la tuya.
4. **SSL/TLS** → modo **Full (strict)** (Coolify ya tiene certificado).
5. **Security**:
   - _Bots_ → **Bot Fight Mode**: activado.
   - _WAF_ → **Rate limiting rules** (el plan gratis trae 1): ruta
     `/api/convert`, **20 peticiones / 1 min por IP** → _Block_ 10 min.
   - Si te atacan en vivo: _Overview_ → **Under Attack Mode** (pide un reto
     JavaScript a todos durante el ataque; apágalo después).
6. En **Coolify** → la app → _Environment Variables_: agrega
   **`SVA_BEHIND_CLOUDFLARE=1`** y redespliega (la app usará la IP real del
   visitante, verificada contra los rangos oficiales de Cloudflare).

## 3. Firewall de Hetzner: cerrar la puerta directa

Hetzner Cloud → **Firewalls** → _Create Firewall_ → aplícalo al servidor:

| Regla de entrada | Puerto | Origen                                                                             |
| ---------------- | ------ | ---------------------------------------------------------------------------------- |
| HTTP             | 80     | **Solo los rangos de Cloudflare** (lista abajo)                                    |
| HTTPS            | 443    | **Solo los rangos de Cloudflare**                                                  |
| SSH              | 22     | **Solo tu IP** (o cualquiera si tu IP cambia; usa llave)                           |
| Coolify panel    | 8000   | **Solo tu IP** (o ciérralo y entra con un dominio de Coolify detrás de Cloudflare) |

Todo lo demás: **bloqueado** (Hetzner bloquea lo que no esté en la lista).

Rangos de Cloudflare (https://www.cloudflare.com/ips/):

```
173.245.48.0/20  103.21.244.0/22  103.22.200.0/22  103.31.4.0/22
141.101.64.0/18  108.162.192.0/18 190.93.240.0/20  188.114.96.0/20
197.234.240.0/22 198.41.128.0/17  162.158.0.0/15   104.16.0.0/13
104.24.0.0/14    172.64.0.0/13    131.0.72.0/22
2400:cb00::/32   2606:4700::/32   2803:f800::/32   2405:b500::/32
2405:8100::/32   2a06:98c0::/29   2c0f:f248::/32
```

Con esto, aunque el atacante sepa la IP, sus paquetes **se descartan en la red
de Hetzner** antes de tocar tu servidor. Si quieres cortar de raíz, en Hetzner
puedes además **cambiar la IP** del servidor (_Primary IPs_) y solo Cloudflare
conocerá la nueva.

## 4. Lo que ya hace la app (escudo)

Antes de cualquier otra cosa, cada petición pasa por un escudo barato (sin leer
cuerpos ni tocar la base):

- **Tope global** de peticiones en curso (400): si se satura, responde 503 al
  instante y sigue viva en vez de ahogarse.
- **Tope por IP** de peticiones simultáneas (24) y de ritmo sobre todo
  (1 500 cada 5 min: una visita normal usa ~30).
- **Bloqueo automático** 15 min a la IP que insiste tras ser frenada.
- Límites por acción (crear, enviar, publicar, códigos…) por IP y por cuenta.
- Cola de conversiones con lugares contados: no acepta más trabajo del que el
  CPU puede hacer.
- Tiempos de espera contra conexiones lentas (slowloris): cabeceras 15 s,
  petición 180 s, keep-alive 5 s; máximo 2 000 conexiones.
- La IP del visitante no se puede falsificar: `CF-Connecting-IP` solo se cree
  si la petición viene de verdad de Cloudflare.

Prueba local: un atacante con 4 000 peticiones (200 a la vez) quedó bloqueado
en ~2 s y un visitante normal siguió cargando en 1–34 ms.

En **Coolify → Logs** verás, cuando haya un ataque:
`[escudo] último minuto: 3039 frenadas por IP, 0 por saturación, 1 IPs bloqueadas`.

## 5. Si te amenazan

- Guarda capturas de la amenaza (fecha, usuario, número).
- No respondas ni negocies.
- En México puedes reportarlo a la **Policía Cibernética** de tu estado o de la
  SSPC (denuncia en línea). Si el ataque ocurre, guarda también las gráficas
  de Hetzner y los logs del escudo como evidencia.
