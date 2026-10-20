# Despliegue

Guía para desplegar esta plataforma: la ruta principal (Cloudflare, la que
usa producción), cómo actualizarla, el desarrollo local y cómo llevarla a
otros proveedores, con honestidad sobre qué funciona tal cual y qué hay que
adaptar.

Producción actual: **https://comunidad-mvp.j94390833.workers.dev**

---

## A. Cloudflare (ruta principal)

### Requisitos

- Una cuenta de **Cloudflare** (el plan gratuito alcanza para Workers, D1 y
  R2 en esta escala).
- **Node.js 20+** y npm en tu máquina.
- **Wrangler** (la CLI de Cloudflare): se usa con `npx wrangler`, sin
  instalar nada global. Autenticación: `npx wrangler login`, o un API token
  con permisos de Workers, D1 y R2 en la variable de entorno
  `CLOUDFLARE_API_TOKEN`.

### Paso 1 — Crear la base de datos y el bucket

```bash
npx wrangler d1 create comunidad-db
npx wrangler r2 bucket create comunidad-files
```

El primer comando devuelve un `database_id`: pégalo en `wrangler.jsonc`
(campo `d1_databases[0].database_id`). El nombre del bucket debe coincidir
con `r2_buckets[0].bucket_name`. **Ningún secreto va en ese archivo**: solo
identificadores.

### Paso 2 — Secreto de sesión (obligatorio)

```bash
npx wrangler secret put NUXT_SESSION_SECRET
```

Pega un valor largo y aleatorio (32+ caracteres). Firma las cookies de
sesión; sin él la app no autentica.

### Paso 3 — Compilar y desplegar

```bash
npm install --legacy-peer-deps   # necesario: npm 10 falla con los peers de este árbol
npm run build
npx wrangler deploy
```

`wrangler deploy` **a secas**: el `main` de `wrangler.jsonc` es
`worker-entry.mjs`, que envuelve el handler de Nitro y exporta la clase del
Durable Object de tiempo real. No sustituyas el entry por el de `.output` o
el tiempo real no existirá y Cloudflare rechazará el binding.

### Paso 4 — Primer arranque

No hay migraciones manuales: al primer request la app **crea el esquema,
aplica las migraciones aditivas pendientes y, si la base está vacía, siembra
el tenant demo** («Comunidad Demo», 5 canales, cursos y usuarios de
ejemplo):

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin@demo.local` | `demo1234` | Administradora |
| `member@demo.local` | `demo1234` | Miembro |
| `lucia@demo.local` / `diego@demo.local` | `demo1234` | Miembros |

Cambia nombre, colores, moneda e idioma de la comunidad desde la consola de
administración (`/admin`). **Borra o desactiva los usuarios demo antes de
usarla con público real.**

### Variables opcionales (secretos de Wrangler)

Todo lo opcional sigue el patrón **«en oscuro»**: sin la clave, la función
está apagada y la interfaz lo dice; jamás se finge una operación.

| Secreto | Para qué | Sin él |
|---|---|---|
| `NUXT_STRIPE_SECRET_KEY` | Cobros con tarjeta (Checkout) | Pagos con tarjeta apagados |
| `NUXT_STRIPE_WEBHOOK_SECRET` | Confirmar pagos de Stripe por webhook | Igual que arriba |
| `NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Clave pública de Stripe en el cliente | Igual que arriba |
| `NUXT_EMAIL_PROVIDER_URL` / `NUXT_EMAIL_PROVIDER_TOKEN` / `NUXT_EMAIL_FROM` | Envío real de correos (invitaciones, avisos) | Los correos no salen; las invitaciones funcionan por **enlace copiable** |
| `NUXT_CRON_SECRET` | Proteger el endpoint del resumen (digest) por cron | El digest responde 503 |

Sin Stripe igual se puede vender: activa un **método de pago manual** en
Ajustes → Pagos (transferencia, billetera, enlace de pago). Cada compra llega
a «Pagos pendientes» y el acceso se concede cuando el admin la aprueba.

El webhook de Stripe, si lo activas, apunta a
`https://TU-DOMINIO/api/billing/webhook`.

### Dominio propio

1. En Cloudflare, agrega tu dominio y asígnalo al Worker (Workers → tu
   Worker → Settings → Domains & Routes → Custom Domain).
2. La plataforma es multi-tenant: cada comunidad se resuelve por el host que
   la sirve, y su marca (logo claro/oscuro, favicon, colores) se configura
   desde su consola. Un dominio por comunidad.

### Actualizar a una versión nueva

```bash
git pull
npm install --legacy-peer-deps
npm run build
npx wrangler deploy
```

Las migraciones de base son **aditivas y automáticas** al primer request:
una versión nueva nunca exige tocar la base a mano, y desplegar no borra
datos ni archivos.

### Desarrollo local

Dos modos, ambos válidos:

```bash
npm run dev              # Nuxt en Node con SQLite local (data/comunidad.db)
# o
npx wrangler dev --port 8787   # el Worker real, con D1/R2 emulados en .wrangler/state
```

Las baterías de regresión (`scripts/test-fase*.mjs`) corren contra el
segundo modo. La base local se re-siembra sola si está vacía; para empezar
de cero, borra `data/comunidad.db*` (modo Node) o `.wrangler/state` (modo
Worker).

### Respaldos

- **Base de datos**: `npx wrangler d1 export comunidad-db --remote --output respaldo.sql`
- **Archivos**: R2 es almacenamiento de objetos; respáldalo con cualquier
  cliente S3 (rclone, AWS CLI) usando las credenciales R2 de la cuenta.

---

## B. Desplegar en otros lados

La app es **Nuxt 4 / Nitro**: el SSR no está casado con Cloudflare, pero tres
piezas sí usan servicios suyos. Las tres están detrás de capas propias,
pensadas para poder sustituirse:

| Pieza | En Cloudflare | Capa propia | Fuera de Cloudflare |
|---|---|---|---|
| Base de datos | D1 (binding `DB`) | `server/utils/db.ts` | Ya corre sobre SQLite local en desarrollo; en un servidor Node se usa esa misma ruta con archivo persistente, o se porta la capa a Postgres conservando la interfaz `prepare().get/all/run`. |
| Archivos | R2 (binding `FILES`) | `server/utils/storage.ts` | Ya usa disco local en Node; basta un volumen persistente. También admite cualquier S3 adaptando la capa. |
| Tiempo real (chat, presencia, avisos) | Durable Objects (`RealtimeRoom`) | `realtime/` + entry `worker-entry.mjs` | **No existe equivalente directo**: hay que montar un servicio WebSocket propio que replique el protocolo de salas (`chan:`, `dm:`, `user:`) o desactivar el tiempo real. El resto de la plataforma funciona sin él. |

### Opción 1 — Otra cuenta de Cloudflare

La ruta sin cambios: clona el repo en la otra cuenta siguiendo la sección A
(D1 y R2 nuevos, mismos pasos). Cero adaptaciones.

### Opción 2 — VPS o Dokploy (Node)

1. Compila para servidor Node:
   ```bash
   NITRO_PRESET=node-server npm run build
   node .output/server/index.mjs   # escucha en PORT (def. 3000)
   ```
2. Ponlo detrás de un proxy con HTTPS (Caddy, Nginx o el proxy de Dokploy)
   y define `NUXT_SESSION_SECRET` como variable de entorno del proceso.
3. Adaptaciones mínimas: volumen persistente para la base SQLite y para
   `data/uploads/`; el tiempo real queda apagado salvo que montes el
   servicio WebSocket equivalente (ver la tabla).

### Opción 3 — Otros serverless/edge (Vercel, Netlify, Fly.io, Deno Deploy…)

Nitro tiene presets para estas plataformas y el SSR compila, pero D1, R2 y
Durable Objects deben sustituirse igual que en la opción 2 (base, archivos
y, si se quiere, tiempo real). **Ruta documentada, no verificada**: nadie ha
desplegado esta plataforma ahí todavía; espera ajustes en el camino.

### Resumen honesto

- **Cloudflare (cualquier cuenta): funciona tal cual**, es la ruta probada
  en producción.
- **VPS/Dokploy: funciona con las adaptaciones de la tabla**; el tiempo real
  es la única pieza que exige trabajo extra o queda fuera.
- **Otros serverless: posible, no verificado.**
