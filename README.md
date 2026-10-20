# Comunidad MVP

Plataforma de comunidades (MVP) inspirada en el *producto* EzyCommunity — sin usar su marca ni sus textos: todo el contenido demo es original y está en español.

Canales con feed, publicaciones con reacciones y comentarios, cursos, eventos, biblioteca, ranking por puntos y canales pagos con paywall — **multi-tenant desde la base** y pensada para alojarse **100% en Cloudflare**.

## Stack fijado

| Capa | Tecnología |
|---|---|
| Framework | Nuxt 4 (Vue 3 + TypeScript) |
| UI | Plantilla oficial gratuita de **Nuxt UI v4** (`@nuxt/ui`, MIT) — layout de 3 columnas tipo hub: sidebar de canales, feed central, rail derecho con eventos y recientes. Dark mode y responsive |
| Iconos | Lucide empaquetados localmente (`@iconify-json/lucide`, bundle local, sin CDN en runtime) |
| Datos | Capa asíncrona propia (`server/utils/db.ts`, interfaz `prepare().get/all/run`) sobre **Cloudflare D1** en producción (binding `DB`) y **SQLite local** (better-sqlite3) en desarrollo. El esquema Drizzle en `server/db/schema.ts` queda como referencia de tipos |
| Archivos | **Cloudflare R2** (binding `FILES`) en el Worker; en local Node, disco bajo `data/uploads/` servido por una ruta server (`server/utils/storage.ts`) |
| Deploy | Cloudflare Workers, preset Nitro `cloudflare_module` (el entry desplegado es `worker-entry.mjs`, que envuelve el handler de Nitro — ver «Tiempo real») |
| Tiempo real | **Durable Objects** (binding `REALTIME`, clase `RealtimeRoom` en `realtime/room.mjs`): chat por canal, mensajes directos, presencia por sala y notificaciones en vivo por WebSocket |
| Auth | Propia: correo + contraseña con **scrypt** (crypto de Node), sesión en cookie httpOnly firmada con HMAC |

## Cómo correrlo

```bash
npm install --legacy-peer-deps   # npm 10 tiene un bug de peers con este árbol; legacy lo evita
npm run dev                       # http://localhost:3000 → redirige a /feeds
npm run build                     # build Cloudflare (preset cloudflare_module)
npm run typecheck                 # vue-tsc — debe pasar limpio
```

La base local `data/comunidad.db` se crea y se **siembra sola** en el primer arranque (si está vacía). Para reiniciar los datos demo: borrar `data/comunidad.db*` y volver a levantar.

### Usuarios demo

| Correo | Contraseña | Rol |
|---|---|---|
| `admin@demo.local` | `demo1234` | Administrador |
| `member@demo.local` | `demo1234` | Miembro |
| `lucia@demo.local` | `demo1234` | Miembro (con acceso al canal premium) |
| `diego@demo.local` | `demo1234` | Miembro |

## Qué funciona (todo contra la base, sin mockups)

- **Multi-tenant:** tabla `tenants`, `tenant_id` en todas las tablas; el tenant se resuelve por el subdominio del host (`<slug>.tudominio.com`) y si no hay coincidencia se usa el tenant demo. Semilla: 1 tenant `demo` ("Comunidad Demo", color de marca `#2563eb` aplicado en la identidad de la UI).
- **Canales:** grupos (General, Ayuda, Recursos) y canales `free` / `private` / `paid`. Seguir / dejar de seguir. El canal **pago ($22)** muestra solo el *teaser* con candado a quien no tiene acceso; el acceso se concede con el botón **«Acceso demo»**, claramente etiquetado, que registra una fila `channel_access` con `source='demo'`. **No hay checkout falso:** Stripe real es una fase siguiente y usará la misma tabla con `source='stripe'`.
- **Feed `/feeds`:** publicaciones de canales públicos + seguidos, fijadas primero; compositor funcional (canal, título, cuerpo, adjunto imagen/video) solo para miembros.
- **Publicación `/p/[canal]/[post]`:** detalle, reacciones (love/like/fire/clap, toggle con conteo), comentarios (crear/listar), guardar (bookmark) y fijar (admin).
- **Cursos:** catálogo con búsqueda, detalle con currículum por capítulos/lecciones (lecciones gratis marcadas, el resto con candado si no estás inscrito) e inscripción persistente.
- **Eventos:** lista de próximos/pasados, detalle con anfitrión, asistentes y RSVP funcional («Asistiré», toggle).
- **Biblioteca `/library`:** recursos con filtro por tipo (PDF/Docs/Video/Imagen/Audio/Enlace). El admin puede **subir archivos reales** (R2 en producción, disco local en desarrollo) y los miembros los descargan por `/api/library/:id/download`, que respeta el candado premium; los recursos semilla siguen como registros de referencia. Las claves `library/` nunca se sirven por la ruta pública de archivos.
- **Ranking `/leaderboard`:** puntos calculados de la actividad real — publicar 10, comentar 3, reacción recibida 2 — con el **nivel** de cada miembro junto a su nombre.
- **Perfil `/profile/[slug]`:** portada con **avatar real** (el propio usuario puede subir su foto), bio, puntos, **nivel e insignias**, y tabs de publicaciones, comentarios y canales que sigue.
- **Videos `/videos`:** agregador de publicaciones con video (YouTube embebido).
- **Reglas `/guidelines`:** salen del campo `guidelines` del tenant, editable desde el panel de ajustes.
- **Notificaciones (Fase 2):** tabla `notifications`; se generan al recibir una reacción o un comentario en tu post, un post nuevo en un canal que seguís y menciones `@slug` en posts/comentarios — nunca por tu propia acción. Campana en la barra superior con contador de no leídas y página `/notifications` con marcar leídas (una o todas).
- **Chat por canal (Fase 3):** pestaña «Chat» en cada canal, solo para miembros con acceso a ese canal (las mismas reglas que las publicaciones: el canal pago sin acceso no tiene chat). Historial y envío por REST (`/api/channels/:slug/chat`, tabla `chat_messages`); recepción **en vivo por WebSocket** vía Durable Object, con presencia de la sala e indicador «escribiendo…». Semilla: 3 mensajes en el canal general.
- **Mensajes directos (Fase 3):** página `/messages` con lista de miembros (presencia y no leídos por persona), conversación 1 a 1 (`/api/members`, `/api/dms/:slug`, tabla `dm_messages` con `read_at`), envío por REST y recepción en vivo. Cada DM crea además la notificación in-app del destinatario. Semilla: 1 DM sin leer para `member@demo.local`.
- **Presencia (Fase 3):** exacta **por sala** mientras el socket está abierto (chips «En la sala» en el chat) y **aproximada** fuera de ella: al conectar un WebSocket se registra `users.last_seen_at` y perfiles/lista de miembros muestran «En línea» si fue hace menos de 2 minutos. No es presencia global en tiempo real: es honesto y alcanza para el MVP.
- **Notificaciones en vivo (Fase 3):** cada notificación nueva se empuja por la sala personal del destinatario (`/api/rt/me`) y su campana se actualiza al instante, sin esperar el polling de 60 s (que queda como respaldo).
- **Subidas reales (Fase 2):** `POST /api/uploads` con validación de tipo/tamaño: imagen para posts (kind `image`, máx. 5 MB) y avatar (kind `avatar`, máx. 2 MB, se guarda en `users.avatar_url`). En el Worker van a R2; en local Node van a `data/uploads/` y se sirven por `GET /api/files/<clave>`. Toda subida queda auditada en la tabla `uploads`.
- **Cursos completos (Fase 2):** las lecciones tienen **contenido** (`lessons.content`), visor `/courses/<slug>/lessons/<id>` (lecciones gratuitas sin inscripción; el resto solo para inscritos, sin filtrar el contenido), progreso en `lesson_progress` con porcentaje en catálogo y detalle, y **certificado** imprimible al 100% en `/courses/<slug>/certificate`.
- **Eventos (Fase 2):** toggle **Lista/Calendario** en `/events`, con grilla mensual, navegación de mes y clic al detalle.
- **Búsqueda global (Fase 2):** buscador en la barra superior y página `/search?q=` sobre publicaciones, canales, cursos y miembros del tenant. Los posts de canales pagos sin acceso salen solo como *teaser* y los de canales privados sin acceso no salen.
- **Niveles e insignias (Fase 2):** niveles por puntos — **Inicial 0, Activo 25, Colaborador 60, Referente 120, Leyenda 250** — e insignias por hitos (Primera publicación, Comentarista ×10, Estrella ×20 reacciones recibidas, Graduado con un curso al 100%, Coleccionista ×5 guardados), calculadas desde la actividad real en `server/utils/levels.ts`. Se muestran en el perfil y en el ranking.
- **Admin completo (Fase 2):** `/admin` ajustes de la comunidad (nombre, lema, color de marca y reglas, reflejados al instante en la UI), `/admin/members` (cambiar rol member/admin y quitar membresía, sin poder degradar ni quitar al único admin), `/admin/channels` (crear, **editar y borrar** canales) y moderación: borrar publicaciones y comentarios ajenos desde la UI con confirmación. Todo protegido por rol en el servidor.

## Estructura

```
app/
  layouts/default.vue     layout 3 columnas (sidebar canales · contenido · rail)
  layouts/auth.vue        login/registro centrados
  components/PostCard.vue tarjeta de publicación (reacciones, guardar, fijar)
  components/ChannelChat.vue  chat de un canal (REST + vivo/polling, presencia)
  components/ChatThread.vue   hilo de mensajes compartido (chat y DMs)
  composables/            useAuth (sesión), useApi (reenvía cookie en SSR), useFormat,
                          useRealtime (WebSocket con reconexión y fallback)
  pages/                  feeds, channels/[slug] (posts + chat), messages (DMs),
                          p/[canal]/[post], courses, events, library, leaderboard,
                          profile, videos, guidelines, admin
server/
  db/schema.ts            esquema Drizzle (referencia de tipos; compatible con D1)
  utils/db.ts             capa de datos asíncrona unificada (D1 ⇄ SQLite local),
                          CREATE_SQL, migraciones aditivas idempotentes,
                          auto-creación de tablas y disparo del seed
  utils/seed.ts           semilla original en español (tenant, 4 usuarios, 5 canales,
                          7 publicaciones, 2 cursos con contenido, 2 eventos,
                          6 recursos, 3 mensajes de chat, 1 DM) + backfill
                          de contenido de lecciones
  utils/auth.ts           scrypt + cookie de sesión firmada
  utils/community.ts      tenant por host, permisos de canal, serialización de posts
  utils/storage.ts        archivos: R2 (binding FILES) o disco local data/uploads/
  utils/notify.ts         creación de notificaciones (reacción, comentario,
                          post nuevo en canal seguido, menciones @slug, DM);
                          además empuja en vivo a la sala personal
  utils/realtime.ts       publicación al Durable Object de la sala (no-op
                          silencioso si no hay binding o en `npm run dev`)
  utils/chat.ts           serialización de mensajes y helpers de presencia/DM
  utils/levels.ts         niveles por puntos, insignias y estadísticas de miembro
  api/                    rutas REST (auth, feed, canales, posts, comentarios,
                          reacciones, cursos + lecciones + certificado, eventos,
                          biblioteca + descarga, subidas, archivos, notificaciones,
                          búsqueda, ranking, perfiles, admin, chat de canal,
                          miembros, DMs y GET /api/rt/status)
worker-entry.mjs          entry real del Worker: envuelve el handler de Nitro,
                          exporta la clase RealtimeRoom e intercepta los
                          upgrades WebSocket /api/rt/* (fuera de Nitro)
realtime/room.mjs         clase Durable Object RealtimeRoom (sockets con
                          hibernación, presencia por attachments, broadcast)
realtime/upgrade.mjs      validación del upgrade: cookie de sesión (HMAC),
                          tenant por host, acceso a la sala vía D1 directo
wrangler.jsonc            Worker + bindings D1, R2 y Durable Object REALTIME
                          + migración v1-realtime (new_sqlite_classes)
scripts/test-realtime.mjs prueba WebSocket de punta a punta contra wrangler dev
```

## Capa de datos: D1 real (producción) y SQLite (desarrollo)

`server/utils/db.ts` expone `dbFor(event)`: una interfaz asíncrona única
(`prepare(sql).get/all/run`, con `run` devolviendo `{ changes, lastInsertRowId }`)
y dos adaptadores:

- **D1**: si el request trae el binding (`event.context.cloudflare.env.DB`,
  o `event.context._platform.cloudflare.env.DB`, o `globalThis.__env__.DB`
  — este último es el que setea el entry de Nitro en cada fetch y el único
  que sobrevive a los subrequests internos del SSR), usa D1:
  `prepare(sql).bind(...).first()/all()/run()`, mapeando `meta.last_row_id`
  a `lastInsertRowId`.
- **SQLite local**: sin binding ( `npm run dev` en Node), envuelve
  better-sqlite3 — importado de forma **perezosa solo en ese camino**, así
  el binario nativo nunca se ejecuta (ni se necesita) en el Worker.

Todos los handlers y helpers (`server/api/**`, `server/utils/community.ts`,
`server/utils/seed.ts`) son `async` y usan esta capa: el mismo código corre
en local y en Cloudflare. **Verificado en ambos modos** (rutas 200 con el
seed, login y escrituras OK), incluido `npx wrangler dev` con D1 local
(miniflare) sobre el build de producción.

### Inicialización y seed en D1

Decisión del MVP: la app **auto-crea el esquema y siembra si está vacío**
al primer request de cada isolate (`CREATE TABLE/INDEX IF NOT EXISTS` +
`seedIfEmpty`), igual que en local. El costo es despreciable a esta escala
y elimina pasos manuales. Como alternativa (o para recrear la base), está
generado `scripts/d1-init.sql` (esquema + los 78 INSERT del seed), que se
aplica con `wrangler d1 execute` y se regenera desde la base local con
`node scripts/gen-d1-init.mjs`.

### Migración a la Fase 2 (producción)

**Es automática, no requiere aplicar SQL a mano.** Al desplegar el Worker
nuevo, el primer request corre `initDb`: crea las tablas nuevas
(`notifications`, `lesson_progress`, `uploads`), agrega las columnas
nuevas (`users.avatar_url`, `lessons.content`, `library_items.file_key`,
`library_items.file_name`) con `ALTER TABLE` idempotentes que toleran
«columna duplicada», y rellena el contenido de las lecciones semilla que
sigan vacías (backfill por título, sin tocar contenido propio). Los datos
existentes no se tocan. `scripts/d1-init.sql` actualizado solo hace falta
para instalaciones nuevas desde cero.

## Tiempo real (Fase 3): arquitectura

El preset `cloudflare_module` de Nitro **no exporta clases de Durable
Objects** desde su entry, así que el Worker se despliega con un entry
envolvente (patrón documentado por Cloudflare para frameworks):

- **`worker-entry.mjs`** es el `main` de `wrangler.jsonc`. Reenvía todo al
  handler de Nitro (`.output/server/index.mjs`), **exporta la clase
  `RealtimeRoom`** y, antes de pasar a Nitro, intercepta los upgrades
  WebSocket `GET /api/rt/*`.
- **`realtime/upgrade.mjs`** corre fuera de Nitro (a nivel Worker, con la
  Request cruda): valida la cookie de sesión (mismo HMAC que la app), el
  tenant por host y el acceso a la sala consultando **D1 directo** —
  canal gratis = sesión; privado = membresía; pago = admin o
  `channel_access`; DM = ser uno de los dos del par; `/me` = sesión.
  Sin sesión/acceso responde 401/403/404 y **nunca** abre la sala.
  Al aceptar, registra `users.last_seen_at` sin bloquear la respuesta.
- **Salas** = una instancia del DO por clave: `chan:{tenant}:{canal}`,
  `dm:{tenant}:{menor}:{mayor}` y `user:{tenant}:{usuario}` (esta última
  es la «sala personal» de notificaciones).
- **`realtime/room.mjs`** (`RealtimeRoom`) usa la API de hibernación de
  WebSockets: guarda la identidad en el *attachment* de cada socket,
  difunde presencia de la sala al entrar/salir, reenvía eventos
  (`chat`, `dm`, `typing`, `notification`) y responde `ping`. **No guarda
  historial**: los mensajes viven en D1 y se leen/escriben por REST; el
  DO es solo el transporte en vivo.
- **Del lado Nitro**, `server/utils/realtime.ts` publica eventos al DO
  (`publishRealtime`) tras cada escritura REST; `notify()` además empuja
  a la sala personal del destinatario. Si no hay binding (o es `npm run
  dev`), publicar es un no-op silencioso.
- **El cliente** (`app/composables/useRealtime.ts`) pregunta primero a
  `GET /api/rt/status`, que hace un ping real a una sala de salud del DO
  y responde `realtime: true/false`. Con `true` conecta el WebSocket
  (reconexión con backoff, 3 intentos); con `false` — o si el socket se
  corta — las pantallas trabajan por **polling corto** contra la REST
  (chat 4 s, DMs 5 s, campana 60 s). Nada se rompe sin DO.
- En **`npm run dev`** (Node + emulación de bindings de Nuxt) la clase del
  DO no está exportada en ese servidor: al arrancar, la emulación avisa
  que `RealtimeRoom` «no such Durable Object class» y la app reporta
  `realtime: false` a propósito (ni siquiera toca el binding, para no
  ensuciar la consola). El tiempo real de verdad se prueba con
  `wrangler dev` (abajo).

Prueba automática de punta a punta (dos sesiones demo, presencia, chat y
DM en vivo, notificación empujada y rechazo de visitantes), contra
`wrangler dev` ya levantado:

```bash
node scripts/test-realtime.mjs http://127.0.0.1:8787
```

### Migración a la Fase 3 (producción) — LEER ANTES DE DESPLEGAR

Tiene dos mitades:

1. **Base de datos: automática.** Como en la Fase 2, el primer request
   corre `initDb`: crea `chat_messages` y `dm_messages` y agrega
   `users.last_seen_at` con la migración aditiva idempotente. La semilla
   de chat/DM solo se inserta en bases vacías (en la D1 ya poblada las
   tablas quedan vacías y se llenan con el uso real, que es lo correcto).
   No hay secreto nuevo: el DO usa el mismo `NUXT_SESSION_SECRET`.
2. **Durable Objects: requiere la migración declarada en
   `wrangler.jsonc`.** El archivo ya trae el binding y la migración:

   ```jsonc
   "durable_objects": { "bindings": [{ "name": "REALTIME", "class_name": "RealtimeRoom" }] },
   "migrations": [{ "tag": "v1-realtime", "new_sqlite_classes": ["RealtimeRoom"] }]
   ```

   `wrangler deploy` la aplica sola al subir — **pero solo si el deploy
   va por la configuración** (`npx wrangler deploy` a secas, sin rutas).
   ⚠️ **NO desplegar con la forma vieja**
   (`wrangler deploy .output/server/index.mjs --assets .output/public`):
   esa forma se salta `worker-entry.mjs`, el Worker queda **sin la clase
   del DO exportada** y el tiempo real no funciona (Cloudflare además
   puede rechazar el deploy por declarar un binding a una clase que el
   entry no exporta). Con el deploy correcto, `GET /api/rt/status` debe
   responder `{"realtime":true}` y la suite
   `node scripts/test-realtime.mjs https://<worker>` debe dar todo PASS
   también contra producción.

## Deploy en Cloudflare (pasos exactos)

`wrangler.jsonc` declara el Worker `comunidad-mvp`, el binding D1 `DB`
(base `comunidad-db`), el bucket R2 `FILES` (`comunidad-files`) y el
Durable Object `REALTIME` (clase `RealtimeRoom`, con su migración
`v1-realtime`); el `database_id` ya es el real de la cuenta.

```bash
# 1. Crear la base D1 y pegar el database_id que devuelve en wrangler.jsonc
npx wrangler d1 create comunidad-db

# 2. (Opcional — la app también auto-crea y siembra al primer request)
npx wrangler d1 execute comunidad-db --remote --file=scripts/d1-init.sql

# 3. Crear el bucket R2
npx wrangler r2 bucket create comunidad-files

# 4. Secreto de sesión (NUXT_SESSION_SECRET sobrescribe el runtime config;
#    nunca va en el código ni en wrangler.jsonc)
npx wrangler secret put NUXT_SESSION_SECRET

# 5. Build y deploy (¡por la configuración! — ver «Migración a la Fase 3»:
#    el deploy aplica la migración del Durable Object y usa
#    worker-entry.mjs como entry; no pasar rutas a mano)
npm run build && npx wrangler deploy
```

Probar el build localmente (D1/DO emulados, entrada por `wrangler.jsonc`)
antes de desplegar:

```bash
npm run build
npx wrangler dev --port 8787
node scripts/test-realtime.mjs http://127.0.0.1:8787   # todo PASS
```

## Fase 2 (hecha)

Notificaciones in-app, subidas reales a R2/disco (imagen de post, avatar
y archivos de biblioteca con descarga protegida), admin completo
(ajustes, miembros, canales CRUD y moderación), cursos con contenido,
progreso y certificado, eventos con vista calendario, búsqueda global y
niveles e insignias. Detalle en «Qué funciona» y en «Migración a la
Fase 2».

## Fase 3 (hecha)

Tiempo real con Durable Objects: chat por canal con presencia e
indicador «escribiendo…», mensajes directos 1 a 1 con no leídos,
presencia por sala + última conexión, y notificaciones empujadas en
vivo a la campana (el polling queda como respaldo). Degradación
elegante sin DO (polling corto) verificada en `npm run dev`, y WebSocket
real verificado en `wrangler dev` con `scripts/test-realtime.mjs`
(presencia, chat, DM, notificación y rechazo de visitantes: todo PASS).
Arquitectura y pasos de migración en «Tiempo real (Fase 3)».

## Fase 4 (hecha) — activación pendiente de credenciales

### Stripe: completo y EN OSCURO
El código de pagos está completo (sin SDK: fetch form-encoded a la API
de Stripe) pero **sin claves no cobra y la UI lo dice** («Pagos en línea
próximamente»). Piezas:

- Config por secretos del Worker: `NUXT_STRIPE_SECRET_KEY`,
  `NUXT_STRIPE_WEBHOOK_SECRET` y la pública
  `NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. `GET /api/billing/status`
  devuelve `{ enabled }` (true solo con las dos claves secretas).
- Tablas `plans` / `member_subscriptions` / `payments` / `stripe_events`.
  Los planes del tenant incluyen acceso a **todos** sus canales pagos;
  el admin los gestiona en `/admin/plans` y se venden en la página
  pública `/pricing` junto a canales y cursos pagos individuales.
- Compra: `POST /api/billing/checkout` (canal / curso / plan) crea la
  sesión de Stripe Checkout y la fila `payments` en `pending`. Sin
  claves responde **409** y ningún flujo existente se rompe (el «Acceso
  demo» sigue disponible y etiquetado).
- Webhook `POST /api/stripe/webhook` con **verificación de firma real**
  (HMAC-SHA256 sobre `t.payload`, tolerancia 5 min) e **idempotente**
  (`stripe_events`): al `checkout.session.completed` marca el pago como
  `paid` y concede `channel_access` con `source='stripe'` / la
  inscripción al curso / la suscripción activa. La página
  `/billing/return` **nunca** concede nada: solo muestra el estado real
  que dejó el webhook en la base.
- Los cursos pagos ya no se inscriben directo: el endpoint de
  inscripción responde 402 sin un pago confirmado.
- Prueba local (sin Stripe CLI): payload firmado a mano — firma válida
  concede acceso en la base y el reenvío del mismo evento no duplica;
  firma inválida → 400.

**Para encenderlo (Juan):**
```bash
npx wrangler secret put NUXT_STRIPE_SECRET_KEY        # clave secreta de Stripe
npx wrangler secret put NUXT_STRIPE_WEBHOOK_SECRET   # secreto del webhook
# (la publishable va como variable pública NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
```
Y en el panel de Stripe: crear un endpoint de webhook hacia
`https://<tu-worker>/api/stripe/webhook` con el evento
`checkout.session.completed` (y opcionalmente `checkout.session.expired`
y `customer.subscription.deleted`, también manejados).

### Correos: capa propia, honesta, EN OSCURO
`server/utils/email.ts` con **proveedor HTTP genérico**: si existe
`NUXT_EMAIL_PROVIDER_URL`, hace `POST { from, to, subject, text }` con
`Authorization: Bearer <NUXT_EMAIL_PROVIDER_TOKEN>` (si está). Sirve
para un relay de Amazon SES o un servicio tipo Resend sin cambiar
código. Remitente: `NUXT_EMAIL_FROM`.

- Sin proveedor: el correo **no se envía** y queda registrado en
  `email_log` con estado `skipped_no_provider`. Con proveedor: `sent` o
  `failed`. El admin lo ve todo en `/admin/emails`.
- Bienvenida automática al registrarse.
- **Digest semanal**: `POST /api/cron/digest` protegido por
  `NUXT_CRON_SECRET` (header `x-cron-secret` o Bearer; sin el secreto =
  503, con secreto incorrecto = 401). Genera el resumen de cada tenant
  (posts de la semana + próximos eventos) y lo despacha a sus miembros
  con la capa de correo. Agendado: un Cron Trigger de Cloudflare que
  llame a esta URL, o cualquier programador externo (cron/n8n).
  ```bash
  npx wrangler secret put NUXT_CRON_SECRET
  npx wrangler secret put NUXT_EMAIL_PROVIDER_URL    # relay SES/Resend
  npx wrangler secret put NUXT_EMAIL_PROVIDER_TOKEN  # token del relay (si aplica)
  ```

### Dominios personalizados por tenant
- Tabla `tenant_domains`; `resolveTenant` busca **primero** coincidencia
  exacta del host contra esa tabla, antes del subdominio y del fallback.
- Admin: `/admin/domains` para agregar/quitar el dominio, con los pasos
  de DNS (CNAME) explicados en la propia pantalla.
- **Paso de cuenta aparte (no lo hace la app):** activar el dominio en
  **Cloudflare for Platforms** (custom hostnames) y emitir el
  certificado; recién ahí el tráfico del dominio llega al Worker. La UI
  lo dice tal cual, sin prometer activación automática.
- En local se prueba con `curl -H "Host: tudominio.example.com"` (el
  dev server de Vite acepta cualquier host por `vite.server.allowedHosts`,
  solo-dev; verificado resolviendo un segundo tenant por su dominio).

### PWA instalable
- `public/manifest.webmanifest` (nombre, `display: standalone`,
  `start_url: /feeds`, colores) + iconos 192/512 y maskable generados
  con `scripts/gen-icons.mjs` (PNG sin dependencias).
- `public/sw.js` **prudente**: cache-first SOLO de assets versionados
  (`/_nuxt/`, `/icons/`); nunca cachea `/api/` ni HTML autenticado. Se
  registra solo en producción desde `app/app.vue`.
- Verificado: manifest e iconos servidos con 200 y content-type
  correcto en `npm run dev` y en `wrangler dev`, link al manifest en el
  HTML, SW accesible.

## Fase 5 (hecha) — ajustes del interior (comparado con EzyCommunity)

- **Encuestas en posts** (`poll_options` / `poll_votes`): el compositor
  del feed crea posts tipo encuesta (pregunta en el cuerpo + 2 a 4
  opciones). Un voto por usuario, con cambio de voto sin duplicar; el
  feed y el detalle muestran porcentajes, total y la opción votada.
  Solo vota quien puede ver el post (sesión + acceso al canal:
  en un canal pago/privado sin acceso, votar responde 403).
- **Borradores y programados** (`posts.status` + `scheduled_at`):
  «Guardar borrador» y «Programar» en el compositor. Los borradores
  solo los ve el autor (página `/drafts`: publicar ahora, editar
  título/cuerpo/hora, borrar; el detalle público responde 404 a
  cualquiera que no sea el autor). Los programados se publican de
  forma **perezosa**: como en Workers no hay un cron por minuto
  garantizado, `publishDuePosts()` se invoca al servir el feed, el
  detalle de canal y el digest; al vencer la hora el post pasa a
  publicado con `created_at` = su hora programada. Feed, canales,
  búsqueda, videos, perfiles y contadores nunca incluyen borradores
  ni programados sin vencer.
- **Directorio de miembros** (`/members`, en la navegación): buscador
  por nombre, filtro por rol (Todos / Administradores / Miembros —
  hoy solo existen esos dos roles) y punto de «en línea» por
  `last_seen_at` (< 2 min).
- **Ajustes de cuenta** (`/settings`): perfil (nombre, bio, ubicación
  y foto con la subida existente), seguridad (cambiar contraseña:
  verifica la actual con scrypt, mínimo 8; al cambiar se incrementa
  `users.token_version` y **todas las demás sesiones dejan de valer**
  — la actual se reemite con la versión nueva), notificaciones
  (interruptores por tipo en `user_prefs`, **respetados** por
  `utils/notify.ts`) y privacidad («Aparecer en el directorio»,
  respetado por `/members`). La preferencia de feed del original
  (seguidos vs. todo) quedó fuera a propósito: el feed actual no
  distingue seguidos de forma limpia y se prefirió no fingirla.
- **Panel de administración** (`/admin`): tarjetas con cifras reales
  (miembros, en línea ahora, canales, publicaciones, comentarios,
  cursos, eventos, membresías activas e ingresos confirmados desde
  `payments` en `paid`), actividad de los últimos 30 días,
  «Publicaciones sin comentarios» y «Miembros recientes», además de
  los ajustes de siempre.
- **Rail derecho** (`RightRail.vue`): suma «Top líderes» (top 5 por
  puntos, con enlace al ranking) y «Miembros en línea».
- **Salas grupales de chat** (`/messages`): crear salas con nombre y
  2+ miembros, listarlas, enviar/recibir (`chat_rooms`,
  `chat_room_members`, `chat_room_messages`). Tiempo real con el
  patrón de la Fase 3: sala `room:{tenant}:{roomId}` en el mismo
  Durable Object; el upgrade valida membresía de la sala y en local
  degradado funciona por polling. Un no-miembro recibe 403 tanto por
  REST como en el upgrade WebSocket.
- **Puntos por aprendizaje y eventos** (`point_events`, una sola vez
  por índice único): inscribirse a un curso **+5**, completar un
  curso al 100% **+50**, confirmar RSVP a un evento **+10**. Se suman
  a los puntos de actividad en el ranking, los perfiles y los niveles.
  Deshacer la acción (desmarcar la última lección, cancelar el RSVP)
  no quita los puntos ya ganados.
- **Filtros de notificaciones**: chips Todo / Menciones / Reacciones /
  Comentarios / Publicaciones / Mensajes en la página de
  notificaciones y en el desplegable de la campana.
- **Textos legales por tenant** (`tenants.terms` / `tenants.privacy`):
  editables en `/admin`, públicos en `/terms` y `/privacy` con texto
  por defecto si están vacíos, enlazados en el pie de la app.
- **Gestión de cursos y eventos (admin)**: `/admin/courses` con CRUD
  completo — cursos (título, descripción, nivel, precio reutilizando
  el guard de pago de la Fase 4, estado publicado/borrador e imagen
  por URL o subida), capítulos y lecciones (contenido, URL de video
  — YouTube se embebe en el visor —, duración, gratuita, orden con
  campo numérico y flechas). Un curso en borrador no aparece en el
  catálogo ni en la búsqueda y su detalle es 404 para no-admins.
  `/admin/events` con CRUD de eventos (inicio/fin, lugar o en línea,
  categoría y **agenda por sesiones** como texto libre, una sesión
  por línea, mostrada como lista en el detalle público). Borrados con
  confirmación y cascada (inscripciones, progresos y RSVP caen con su
  curso/evento; los pagos registrados no se borran nunca). Ponentes
  de evento: fuera de alcance.
- **Bloqueos y publicaciones ocultas** (`user_blocks`,
  `user_hidden_posts`): desde el perfil de un miembro, «Bloquear»
  (con confirmación). Efecto real: sus posts y comentarios dejan de
  verse para quien bloquea en feed, canales, búsqueda, videos,
  recientes y perfiles, y los mensajes directos entre ambos quedan
  impedidos en los dos sentidos (el envío responde 403 con el motivo).
  En el menú de cada publicación ajena, «Ocultar publicación» la
  quita de las vistas de ese usuario. Ambas cosas se revierten desde
  Ajustes de cuenta → «Bloqueados y ocultos». **Decisión**: son
  preferencias personales, no moderación — el admin conserva intactas
  sus herramientas (borrar posts/comentarios, gestionar miembros) y
  puede abrir cualquier publicación por su enlace directo para
  moderarla; bloquear a alguien tampoco le avisa ni le bloquea la
  cuenta.

Verificado en local con `wrangler dev` (suite de ~70 comprobaciones
contra la API con los usuarios demo + WebSocket real entre dos
sesiones): encuestas y cambio de voto, borrador invisible y publicado,
programado promovido al vencer su hora, directorio y opt-out,
preferencia de notificación que suprime el aviso, cambio de
contraseña con invalidación de las demás sesiones y restauración,
dashboard coherente con la semilla, CRUD admin de cursos/eventos con
403 para no-admins y agenda visible, puntos +5/+50/+10 sin duplicar,
sala grupal en vivo con no-miembro rechazado, bloqueo con sus efectos
y su restauración, y la suite de la Fase 3 (`scripts/test-realtime.mjs`)
sin regresiones. Build y typecheck en 0 errores. Las migraciones son
aditivas e idempotentes (tablas nuevas en el `CREATE_SQL` y columnas
nuevas en `MIGRATIONS`, `server/utils/db.ts`); `scripts/d1-init.sql`
regenerado con las 38 tablas.

## Fase 6 (hecha) — perfil de miembro completo

- **Foto de portada real** (`users.cover_url`, migración aditiva):
  subida con el pipeline existente (`/api/uploads`, kind `cover`,
  carpeta `covers/`, máx. 2 MB, mismos tipos que el avatar). Control
  «Cambiar portada» sobre la portada del perfil propio y en Ajustes
  (con «Quitar portada», que vuelve al degradado de marca por defecto).
- **Cabecera rediseñada**: portada a lo ancho, avatar superpuesto con
  punto de presencia sobre la foto, nombre + `@slug`, línea «Miembro
  desde · ubicación · Activo ahora / Última vez hace X» (relativo
  honesto desde `last_seen_at`) y fila de estadísticas visibles:
  Publicaciones, Comentarios, Reacciones recibidas, Cursos
  completados, Seguidores y Siguiendo.
- **Seguir miembros** (`user_follows`, único el par por tenant):
  `POST`/`DELETE /api/users/[slug]/follow` (uno mismo → 400, slug que
  no es miembro → 404, con un bloqueo en cualquier sentido → 400).
  Botón Seguir/Siguiendo en perfiles ajenos. Al seguir se crea una
  notificación tipo `follow` («{nombre} empezó a seguirte», enlace al
  perfil del seguidor) con su **propia** preferencia `notify_follow`
  en Ajustes — no se mezcló con menciones — y chip «Seguidores» en la
  campana y en la página de notificaciones. Seguir dos veces no
  duplica relación ni aviso.
- **Pestañas Eventos y Guardados**: Eventos lista los RSVP del miembro
  (próximos primero, pasados al final) con enlace al evento. Guardados
  muestra sus bookmarks con `PostCard` y es **solo del perfil propio**:
  para cualquier otro visitante — incluido un admin — la pestaña no
  aparece y la API ni siquiera incluye la clave `saved`.
- **Columna lateral** (dos columnas en pantallas grandes, apilada en
  móvil): tarjeta «Acerca de» (bio, ubicación, sitio web, miembro
  desde), tarjeta de nivel con barra de progreso («Te faltan N pts
  para {nivel}» o «Nivel máximo alcanzado») y panel de insignias
  «{ganadas} de {total}» con grilla — ganadas a color, bloqueadas
  atenuadas y descripción en el `title`.
- **Sitio web del miembro** (`users.website`): editable en Ajustes →
  Perfil. Se guarda tal cual se escribió (el protocolo es opcional) y
  se normaliza al enlazar en «Acerca de»; lo que no parsea como URL
  con host válido responde 400 y no se guarda.

Verificado en local con `wrangler dev` sobre estado fresco (suite de
36 comprobaciones contra la API y las páginas SSR con los usuarios
demo): portada subida, visible y quitada; member sigue a lucia con
conteos 1/1 en ambos perfiles, notificación `follow` recibida,
duplicado sin efecto, preferencia `notify_follow` apagada que suprime
el aviso, dejar de seguir vuelve a 0; pestaña Eventos con el RSVP y
Guardados invisible para el admin; sitio web válido/inválido; nivel
con nombre del siguiente e insignias coherentes; regresión de
bloqueos de la Fase 5 intacta y la suite de tiempo real
(`scripts/test-realtime.mjs`) en PASS. Build y typecheck en 0
errores. Migraciones aditivas e idempotentes; `scripts/d1-init.sql`
regenerado con las 39 tablas.

## Fase 7 (hecha) — paridad visual del Home/Feed

Fase de diseño y presentación comparada con EzyCommunity: mismas
funciones, acabado de red social en vez de panel.

- **Marco**: barra superior con logo/nombre de la comunidad, la
  navegación principal en **pastillas centradas** (Inicio / Cursos /
  Eventos / Miembros / Ranking, activa resaltada), buscador, icono de
  **mensajes con badge de no leídos** (suma por conversación de
  `/api/members`), campana y menú de avatar. Barra lateral con
  accesos Videos y Biblioteca, sección **Canales** por grupos (`#`,
  corona en pagos, candado en privados) y enlaces al pie (Precios,
  Reglas, Términos, Privacidad, Panel de administración si es admin).
  En móvil: hamburguesa para los canales y fila deslizable con todos
  los destinos. El riel derecho sigue como tercera columna en
  pantallas anchas; `/admin` conserva su navegación interna.
- **Cabecera del feed**: tarjeta con banner en degradado del color de
  marca del tenant + nombre y lema, y franja **«Feed»** con selector
  de orden **Recientes / Antiguos** que ordena de verdad (parámetro
  `sort` en `GET /api/feed`: `desc` por defecto con los fijados
  primero; `asc` cronológico simple, sin destacar fijados).
- **Compositor compacto + editor en modal** (`PostComposer.vue`,
  reusado en el feed y en cada canal con el canal preseleccionado):
  barra con avatar, campo «Escribí algo…» y atajos Foto / Video /
  Encuesta que abren el **modal** ya posicionados. El modal trae
  «Publicando en» con selector de canal, Título y cuerpo, adjuntos
  (foto subida o por URL, video de YouTube), constructor de encuesta
  de 2–4 opciones, y dos toggles nuevos: **«Permitir comentarios»**
  (`posts.allow_comments`, migración aditiva; apagado → el detalle
  avisa «Los comentarios están desactivados» y
  `POST /api/posts/[id]/comments` responde **403**) y **«Publicar
  como anuncio»** (solo admin: nace fijado; un `pin=true` de un
  miembro se ignora en el servidor). El botón **Publicar** lleva
  chevron con **«Programar…»** (fecha/hora → queda `scheduled`,
  publicación perezosa de la Fase 5) y **«Guardar borrador»** (queda
  en `/drafts`). Sin «Go Live» ni post anónimo: no existen en el
  producto y no se fingen.
- **Tarjeta de post**: avatar con **punto de presencia** del autor
  (`last_seen_at`, como en perfiles), **insignia de rol** «Admin»
  junto al nombre, línea «# en {Canal} · hace X · **Editado**»
  (`posts.edited_at`, migración aditiva: se completa al editar un
  borrador/programado por el `PUT` existente), **bookmark y menú «…»**
  arriba a la derecha (el menú reúne Ocultar / Fijar / Eliminar), y el
  botón de comentar pasa a mostrar candado «Comentarios desactivados»
  cuando el post no los permite.
- **Riel derecho**: bloques con título en mayúsculas y «Ver todo» —
  **Próximos eventos** con **cuadrado de fecha** (mes, día grande,
  día de semana) + título + hora + anfitrión (`host_name` nuevo en
  `/api/sidebar`), Publicaciones recientes, Top líderes, **Miembros**
  (bloque nuevo, en línea primero con su punto) y **En línea (n)**.
- **Página de canal**: cabecera compacta con franja de marca, nombre
  con `#`, descripción, tipo/acceso como estaba, y el mismo
  compositor compacto en la pestaña de publicaciones.

Verificado en local con `wrangler dev` (suite de 24 comprobaciones
contra la API): orden Antiguos invierte el cronológico y Recientes
deja los fijados primero; publicar texto y encuesta desde los
payloads del modal; comentar con comentarios desactivados = 403 con
su mensaje y `allowComments=false` en el modelo; anuncio del admin
nace fijado y primero, `pin` de miembro ignorado; programado y
borrador fuera del feed y presentes en `/api/drafts`; editar un
borrador y publicarlo deja `edited=true`; sidebar con `members[]` y
`host_name`; SSR del feed con el banner, la franja «Feed», el
selector y la barra del compositor. Suite
`scripts/test-realtime.mjs` en PASS y rutas `/ /feeds /courses
/events /members /leaderboard /messages /admin /channels/general
/p/:canal/:post` en 200. Build y typecheck en 0 errores.

## Fase 9 (hecha) — perfil estilo Ezy, personalización y gamificación administrable

- **Perfil en 3 zonas propias, sin el riel global**: en `/profile/*`
  el layout ya no renderiza el `RightRail` de la app (la página usa
  todo el ancho). Cabecera sobria con portada, avatar grande con punto
  de presencia, nombre + `@slug`, línea «Miembro desde · ubicación ·
  Activo ahora/Última vez…» y la fila de estadísticas discreta. Debajo,
  tres columnas: **izquierda** — tarjeta de **navegación vertical** con
  etiquetas completas (Publicaciones / Comentarios / Canales /
  Eventos / Guardados, este último solo en el perfil propio) con la
  activa en pastilla de marca, y tarjeta **«Insignias ganadas — X de
  Y»** con la grilla de insignias **de nivel** (icono, orden, umbral;
  ganadas a color, bloqueadas atenuadas) más la fila secundaria de
  insignias de actividad de la Fase 6; **centro** — el contenido de la
  sección con **estados vacíos estilo referencia** (icono grande en
  círculo, título y subtítulo, componente `EmptyState.vue`);
  **derecha** — tarjeta de **nivel** (icono grande, «Sin insignia
  aún» si no alcanzó el primer nivel con puntos, «Progreso a
  {siguiente} — X / Y», barra y «Te faltan N pts») y **«Acerca de»**
  con la sección **«Activo en»** (los canales del miembro).
- **Modales de personalización** (perfil propio): «Editar perfil»
  abre un **modal** con nombre, bio, ubicación y sitio web, y cambio
  de **avatar y portada** desde el mismo modal (subir / vista previa /
  quitar portada), reusando `PUT /api/settings/profile` y
  `/api/uploads` (`kind` avatar/cover). La portada (o su botón) abre
  el **modal de portada** dedicado. `/settings` conserva seguridad,
  notificaciones, privacidad y bloqueos.
- **Gamificación administrable por tenant**: tablas nuevas
  `gamification_levels` (nombre, umbral, icono lucide, orden) y
  `gamification_points` (acción → puntos; tabla propia en vez de JSON
  en el tenant, por encajar con el resto del esquema). Se siembran con
  los valores históricos la primera vez que se leen (niveles Inicial
  0 / Activo 25 / Colaborador 60 / Referente 120 / Leyenda 250; puntos
  post 10, comentario 3, reacción recibida 2, inscribirse 5, curso
  completo 50, RSVP 10). `levelFor`, `memberStats`, el ranking, el
  riel y los hitos de `point_events` leen esta configuración
  (cacheada solo dentro del request: los cambios se ven de
  inmediato). Página **`/admin/gamification`** (en el AdminNav y en el
  menú de admin de la barra superior): editar nombre/icono/umbral,
  agregar y eliminar niveles — con guardas en el servidor (siempre un
  nivel base en 0, umbrales estrictamente crecientes sin duplicar,
  nombres únicos) — y editar los puntos por acción (enteros ≥ 0).
  Los puntos base se recalculan con el valor vigente; los hitos
  (cursos/eventos) quedan registrados con el valor del momento.
- **«Aparecer en búsqueda»**: preferencia `show_in_search` (def.
  visible) en Ajustes → Privacidad; `/api/search` deja de devolver el
  **perfil** de quien la apaga (sus publicaciones y comentarios siguen
  apareciendo, como en la referencia). El opt-out del directorio no
  cambia. El par «Everyone / Members Only» de la referencia no se
  incluye: todo el producto exige cuenta, así que no hay superficie
  pública donde aplicarlo (sin interruptores decorativos).

Verificado en local con `wrangler dev` en estado fresco (suite de 61
comprobaciones): rutas `/profile/marco-solis` (propio y ajeno),
`/settings`, `/admin/gamification`, `/feeds` y `/leaderboard` en 200;
el HTML del perfil trae la navegación vertical completa, «Insignias
ganadas — 1 de 5» y «22 / 25» en la tarjeta de nivel, y NO trae el
riel global (que sí sigue en el feed); la bio editada por la API del
modal se refleja; seguir/dejar de seguir intacto; con
`show_in_search` apagado la búsqueda no devuelve el perfil pero sí un
post del miembro, y al reactivar vuelve; como admin, cambiar el
umbral de Activo (25 → 20) y el valor del comentario (3 → 4) mueve el
nivel y los puntos en perfil y ranking, un comentario nuevo otorga
con el valor nuevo, el hito de RSVP se registra con el valor vigente
(15), un nivel temporal agregado aparece como sexta insignia y al
eliminarlo todo vuelve a la semilla restaurada; las guardas
responden 400. Suite `scripts/test-realtime.mjs` en PASS. Build y
typecheck en 0 errores. Semilla local regenerada limpia
(`d1-init.sql` incluye las tablas de gamificación sembradas).

## Fase 10 (hecha) — navegación móvil/tableta organizada

Un solo marco que se repliega por niveles, como la referencia
(mapa verificado en las capturas de emulación de dispositivos):

- **Escritorio amplio (≥1280 px)**: todo — pastillas centrales en la
  barra superior, lateral fijo y riel derecho. Sin cambios visuales.
- **Tableta / laptop chica (768–1279 px)**: lateral fijo visible y
  columna única; **sin riel derecho y sin pastillas centrales** (la
  navegación vive en el lateral). La grilla pasa a
  `md:grid-cols-[240px_1fr]` y las pastillas a `xl:flex`.
- **Teléfono (<768 px)**: una columna; navegación en **panel
  deslizable** + **barra inferior fija**. Desaparece la fila
  deslizable horizontal de destinos de la Fase 7.

Piezas nuevas:

- **`MobilePanel.vue`** (slideover izquierdo, scroll interno): cabecera
  de usuario (avatar con punto de presencia, nombre, `@slug`, toque →
  perfil), **tarjeta de nivel/XP** con el nivel y los puntos reales
  del usuario (mismo payload que la tarjeta de su perfil:
  `/api/profiles/[slug]`, gamificación por tenant de la Fase 9 — con
  barra y «Te faltan N pts para {siguiente}»), **selector de tema
  segmentado Claro/Oscuro/Sistema**, fila de comunidad (endpoint nuevo
  **`GET /api/my-tenants`**: las membresías del usuario; la fila es
  informativa si hay una sola comunidad — lo habitual, cada una vive
  en su dominio — y si hay más, las demás se enlazan a su dominio
  propio registrado), navegación principal completa con icono +
  etiqueta + chevron (Mensajes con badge de no leídos), sección
  **Canales** con los grupos y corona/candado como el lateral fijo,
  accesos a Ajustes y Panel admin, y **Cerrar sesión en rojo** al pie
  (visitante: Iniciar sesión / Crear cuenta).
- **`MobileBottomBar.vue`** (solo con sesión, respeta
  `safe-area-inset-bottom` y el layout deja el respiro al final):
  Inicio · Mensajes (badge) · **Crear** · Avisos (badge) · Menú.
  «Crear» monta el `PostComposer` en la nueva variante **`bare`**
  (solo el disparador + su modal; al publicar refresca los datos en
  pantalla) — nada decorativo. El badge de Avisos sale del estado
  compartido **`useNotifBadge`**, la misma fuente que la campana de la
  barra superior (que ahora escribe en ese estado); el de Mensajes,
  del mismo conteo `/api/members` que ya usaba la barra superior.
- **Compositor**: en teléfono su editor abre **a pantalla completa**
  (`UModal fullscreen` bajo 768 px, vía `useIsPhone()` con
  `matchMedia`; sin dependencias nuevas).
- Barra superior en teléfono: botón de menú, logo, buscar, campana y
  avatar — **el avatar también abre el panel** (el menú desplegable de
  usuario queda desde `md`). El pase rápido de pantallas confirmó que
  las filas del admin ya usan `flex-wrap` y listas flexibles (sin
  tablas que fuercen zoom) y que el `RightRail` ya apila en el orden
  eventos → recientes → líderes → miembros → en línea.

Verificado con `wrangler dev` (build y typecheck en 0): rutas
`/feeds`, `/profile/marco-solis`, `/messages`, `/courses`, `/events`,
`/members`, `/leaderboard`, `/admin` y `/admin/gamification` en 200;
el SSR de `/feeds` como miembro trae las pastillas en `xl:flex`, el
lateral en `md:block`, la barra inferior con Crear/Menú/Avisos y el
`safe-area`, y ya NO trae la fila deslizable (`overflow-x-auto`: 0);
en escritorio el SSR conserva pastillas y riel. `/api/my-tenants`
devuelve la membresía real (member y admin) y la fuente de la tarjeta
de nivel responde los datos reales del miembro de prueba (22 pts,
Nivel Inicial, «Te faltan 3 pts para Activo»). El contenido del
slideover es un portal del cliente (no aparece en el SSR): su
presencia se verificó en el bundle del cliente y por revisión del
componente; la apertura/cierre táctil no es reproducible headless en
este entorno y queda declarada. Suite `scripts/test-realtime.mjs` en
PASS. Semilla local intacta (el estado de prueba vive en `.wrangler`,
descartable).

## Fase 8 (hecha) — editor rico en dos modos y página-estudio de cursos

La referencia usa DOS familias de editor y acá se igualan ambas con
un solo componente propio (`app/components/RichEditor.vue`, sobre
TipTap 3 — solo cliente; el Worker no lo carga):

- **Modo «slash»** (compositor de posts): sin bordes ni cajas dentro
  del modal; menú «/» con bloques (Texto, H1–H3, lista, lista
  numerada, lista de tareas, cita, bloque de código, divisor, imagen)
  y barra flotante al seleccionar texto.
- **Modo «clásico»** (lecciones, descripción de cursos y de eventos):
  barra FIJA superior (deshacer/rehacer, B/I/U/S, H1–H3, listas,
  tareas, cita, código, enlace, imagen, incrustar YouTube).

Todo el HTML pasa por un **sanitizador propio sin dependencias**
(`server/utils/sanitize.ts`, tokenizador + lista blanca): fuera
scripts, eventos inline, `javascript:`/`data:` en enlaces e imágenes,
e iframes salvo embeds de YouTube/Vimeo con host y ruta validados. Se
sanitiza al guardar Y se re-sanitiza al servir. De cada HTML se
deriva el texto plano (`posts.body`, descripciones) que usan teasers,
búsqueda y notificaciones; los posts viejos sin HTML se ven como
siempre.

**Compositor** (Parte B): título grande integrado, «Publicando en»
como texto, toggles-icono (anuncio solo admin, **anónimo**,
comentarios, maximizar), X con cambios → diálogo de descarte
(Seguir editando / Guardar borrador / Descartar), barra inferior de
solo iconos (imagen inline, video por URL, audio subido → nodo de
audio, GIF **solo por URL** — sin picker externo: decisión
registrada —, emoji con grilla propia, encuesta integrada, adjunto
con tarjeta de descarga, código), Publicar + chevron (Programar /
Guardar borrador), pantalla completa en teléfono. **Post anónimo
real** (`posts.anonymous`): para miembros es «Anónimo» con avatar
genérico y SIN slug ni ningún dato del autor en ningún serializador
(feed, detalle, búsqueda, perfil, canal, videos); el admin ve
«Anónimo (autor: …)»; las notificaciones no nombran al autor; solo se
elige al crear.

**Página-estudio de cursos** (Parte C, `/admin/courses/[id]/edit`;
`/admin/courses` quedó como catálogo): cabecera con interruptor
Publicado/Borrador e **indicador de autoguardado** (todo se guarda
solo con debounce, sin botón Guardar), pestañas **Curriculum / Drip /
Enrollments / Settings**. Curriculum con panel fijo (~300 px),
capítulos y lecciones **reordenables por arrastre** (HTML5 nativo),
«Add lesson» crea «Sin título» en borrador al instante. **Tipos de
lección (7, sin quiz): Video, Text, Audio, PDF, Slides, Download,
Embedded** (`lessons.kind` + campos por tipo; backfill: video solo si
tenía `video_url` y ningún texto). **El tipo de una lección con
contenido es inmutable** (lo enforce el servidor; una recién creada,
vacía, sí puede elegir tipo) — decisión espejo de la referencia, que
documenta el estudio cuando intentás cambiarlo. Ajustes por lección:
prerrequisito (bloquea visor y completado), vista previa gratuita
(visible sin inscripción — en cursos pagos actúa como muestra; no da
acceso al resto), permitir descarga, recurso descargable adjunto y
estado borrador/publicada (las borrador no existen para el público;
el admin las previsualiza con `?preview=1`). **Drip**
(`courses.drip_mode` = none/enrollment/dates + `unlock_offset_days` /
`unlock_at` por lección): el visor bloquea con «Disponible el
{fecha}», el completado responde 403 y el avance no cuenta lecciones
sin liberar. **Enrollments**: lista real con avance y alta/baja
manual de miembros (respeta el límite). **Settings**: descripción
corta + descripción con editor clásico (`description_html`
sanitizado), Visibility Public/Private/**Secret** (secreto = fuera de
catálogo, portada y búsqueda; solo enlace directo para inscritos),
límite de inscritos respetado al inscribir, precio único (los precios
múltiples quedan fuera: chocan con el billing actual y los planes
viven en su propia sección), miniatura + **banner** (`banner_url`,
encabeza la landing) y **certificado por curso**
(`certificate_enabled`): apagado → al 100% no hay certificado;
encendido → sí. Los cursos que ya existían quedan ENCENDIDOS (la
columna nace en 1: no cambia su comportamiento); **los cursos nuevos
nacen APAGADOS** (opt-in, como la referencia) y se encienden desde
Settings. El visor público renderiza los 7 tipos (audio con
reproductor, PDF en visor, slides incrustadas o archivo, descarga,
embed con sandbox).

**Descripciones con editor clásico** (Parte D): eventos y cursos
guardan `*_html` sanitizado + texto plano derivado; el detalle renderiza
el HTML y el admin de eventos edita con la barra clásica.

Verificación (local, `wrangler dev` + D1 local): build y typecheck en
0; suite propia de 40+ chequeos por API (sanitizador servido, anónimo
en ambos sentidos, los 7 tipos creados/reordenados/vistos, drip por
inscripción y por fechas con fecha correcta, prerrequisito,
certificado apagado/encendido, visibilidad secret/private, límite de
inscritos, enrollments del estudio, eventos con HTML) en PASS; rutas
HTML 200; posts semilla sin HTML intactos; cursos semilla abren en el
estudio sin perder datos (certificado sigue encendido en ellos);
`scripts/test-realtime.mjs` en PASS. Datos de prueba solo en
`.wrangler` local (limpiado al terminar).

## Correcciones post-Fase 8 (hechas)

- **El visor de lecciones y el estudio no renderizaban (rutas
  anidadas).** Causa raíz: en Nuxt, un archivo `X.vue` que convive con
  un directorio hermano `X/` se convierte en el componente PADRE de
  las rutas hijas; sin `<NuxtPage />` adentro, las hijas nunca se
  muestran y todo cae en el padre. Pasaba dos veces:
  `courses/[slug].vue` tapaba `lessons/[id]` y `certificate` (el
  visor servía la landing del curso) y `admin/courses.vue` tapaba
  `admin/courses/[id]/edit` (el estudio servía el catálogo; el 200 de
  la verificación anterior no alcanzó para detectarlo: hay que mirar
  el CONTENIDO servido, no solo el estado). Arreglo: las landings
  viven como `index.vue` dentro del directorio (`courses/[slug]/index.vue`,
  `admin/courses/index.vue`) y las hijas quedan como rutas hermanas.
  Regla para no repetirlo: nunca un `X.vue` junto a un directorio `X/`
  salvo que el padre renderice `<NuxtPage />` a propósito.
- **Buscador de la barra superior: solo el icono.** La caja de texto
  permanente («Buscar en la comunidad…») se pegaba a las pastillas de
  navegación; como en la referencia, ahora es un botón de lupa que
  abre un diálogo de búsqueda (`SearchDialog.vue`, también con
  **Ctrl+K / Cmd+K**) con resultados en vivo de la misma
  `/api/search` (candados y anonimización intactos, aplicados por el
  servidor) y enlace a «ver todos los resultados» en `/search`.

## Fase 11 (hecha) — consola de administración dedicada y ajustes de usuario como modal

- **Layout de consola propio (`app/layouts/admin.vue`)** para todo
  `/admin/**` (cada página lo declara con `definePageMeta`): ya no se
  monta dentro del layout de miembro. Barra superior mínima («← Volver
  a la comunidad» + nombre de la comunidad + distintivo
  «Administración», menú de usuario con cerrar sesión) y **riel de
  secciones** a la izquierda con solo las secciones que existen:
  Panel, Miembros, Canales, Cursos, Eventos, Gamificación, Planes,
  Dominios, Correos y Ajustes de la comunidad. Sin lateral de canales,
  sin RightRail, sin barra inferior ni panel móvil. Responsive del
  riel: completo desde `lg`, solo iconos en `md–lg`, panel deslizable
  en teléfono. La autorización no cambió: las APIs siguen exigiendo
  admin con `requireAdmin` (un miembro recibe 403 igual que antes) y
  el riel solo se pinta para administradores.
- **Sub-navegación por sección** (`AdminSubNav.vue`, pestañas por
  `?tab=`), solo donde hay subsecciones reales: Gamificación se partió
  en **Niveles e insignias / Puntos por acción** (un solo guardado,
  como antes) y los ajustes de la comunidad salieron del pie del Panel
  a su propia sección **`/admin/settings`** con pestañas **General**
  (nombre, lema, color, reglas) y **Textos legales** (términos y
  privacidad), también con un solo guardado contra
  `PUT /api/admin/settings`.
- El estudio de cursos (`/admin/courses/[id]/edit`) hereda la consola
  conservando su cabecera propia. Desaparece el viejo `AdminNav` de
  botones en pastilla. La **moderación** sigue sin sección propia a
  propósito: vive en contexto, en el menú de cada publicación
  (fijar/eliminar como admin), así que no se inventó una entrada de
  menú sin página detrás. (En la Fase 12 la moderación ganó su
  sección real en la consola: ver abajo.)
- **Ajustes de cuenta como modal** (`UserSettingsModal.vue` + estado
  compartido en `useUserSettings.ts`), como el «Profile Settings» de
  la referencia: navegación vertical de secciones (Perfil,
  Notificaciones, Privacidad, Bloqueados y ocultos, Seguridad) y la
  misma lógica/endpoints que tenía la página (`/api/settings*`,
  `/api/uploads`), guardando sin salir de donde estás. Se abre desde
  el menú del avatar, desde el panel móvil y desde la barra de la
  consola; en teléfono va a pantalla completa. Es el único editor de
  perfil (ver la nota de unificación al final de la Fase 12). La ruta `/settings`
  queda como compatibilidad: abre el modal (acepta `?section=`) y
  vuelve a `/feeds`, para no romper enlaces guardados.

## Fase 12 (hecha) — moderación completa y menú del avatar simplificado

- **Reportes de contenido** (tabla `reports`, migración aditiva):
  «Reportar» en el menú «…» de cada publicación y de cada comentario,
  solo para contenido ajeno y con sesión (`ReportDialog.vue` +
  `useReportDialog.ts`): categoría (spam/acoso/inapropiado/otro) y
  nota opcional. `POST /api/reports` no duplica: un reporte
  `pending` por persona y objetivo (repetir responde
  `alreadyReported`). Al crearse avisa a los admins del tenant con la
  notificación tipo `report` («Nuevo reporte de contenido»), sin
  auto-notificar a un admin que reporta contenido de otro.
- **Cola en la consola** (`/admin/moderation`, sección nueva del riel):
  pestañas **Reportes** y **En revisión** con contadores. Los reportes
  pendientes se agrupan por objetivo (tipo, extracto con enlace a su
  contexto, autor del contenido, quién reportó, categoría, nota y
  fecha) y se resuelven por objetivo: **Descartar**, **Resolver sin
  acción** o **Eliminar contenido** (misma cascada de borrado que el
  borrado normal, compartida en `utils/moderation.ts`; los reportes
  quedan `resolved` con `action='content_removed'`). Si el contenido
  ya no existe, el grupo se muestra como «ya eliminado» y solo permite
  cerrar. Debajo, el historial de reportes cerrados.
- **«Necesita tu atención» en el Panel**: bloque siempre visible
  (decisión tomada: también en cero, como el «Needs your attention»
  de la referencia, para que la moderación tenga un lugar fijo) con
  los contadores reales de reportes pendientes y publicaciones en
  revisión, enlazando a la pestaña que corresponde.
- **Revisión previa opcional** (`tenants.moderation_review`, default
  apagada; se edita en Ajustes de la comunidad → pestaña **Moderación**,
  su propia subsección porque es un comportamiento con explicación):
  encendida, las publicaciones de miembros NO administradores nacen
  con `posts.status='review'` (también los programados al vencer, vía
  `publishDuePosts()`, y los borradores re-publicados). Un post en
  revisión no existe para el resto: feed, canal, detalle, búsqueda y
  perfil lo excluyen; solo lo ven su autor y los admins, con la
  insignia «En revisión». Reacciones y comentarios quedan limitados a
  autor/admin, y **no suma puntos** hasta aprobarse (los puntos de
  publicación salen de `memberStats`, que solo cuenta `published`).
  En la cola, **Aprobar** publica con fecha actual (y notifica al
  autor, tipo `moderation`: «Tu publicación fue aprobada») y
  **Rechazar** lo devuelve a los borradores del autor con su aviso —
  nunca se borra el contenido del autor.
- **Notificaciones de moderación sin preferencia propia**: los tipos
  `report` y `moderation` no aparecen en las preferencias de Ajustes
  de cuenta a propósito — son avisos operativos, no sociales, y
  siempre llegan (documentado también en `utils/notify.ts`).
- **Diferencia documentada — «Edit Review» NO incluido**: en la
  referencia, editar una publicación ya aprobada también pasa por
  revisión. Acá las ediciones de posts publicados **no** pasan por
  revisión en esta fase; solo las publicaciones nuevas. La pestaña no
  se finge: la cola tiene solo Reportes y En revisión.
- **Menú del avatar sin redundancia** (Parte C): con la consola
  dedicada de la Fase 11, el menú del avatar dejó de repetir las
  secciones de admin una por una. Queda personal (Mi perfil, Mis
  borradores, Ajustes de cuenta, Notificaciones) + **una sola**
  entrada de admin («Panel de administración» → `/admin`) + Cerrar
  sesión. El panel móvil conserva igualmente su único «Panel de
  administración» y el enlace del lateral de miembro (Enlaces) se
  queda: son entradas únicas, no duplicaciones.

## Fase 13 (hecha) — el Panel como el Dashboard de la referencia

- **Selector de período** arriba del Panel (7 días / 30 días / 90 días
  / 12 meses; estado en la URL, `?range=`; por defecto 30). Afecta al
  bloque «En este período», a las gráficas, a los canales más activos
  y a los principales contribuidores. Los totales y la cola de
  atención no dependen del período.
- **«De un vistazo»**: las tarjetas de totales de siempre, ahora con su
  nota («Lo que la comunidad contiene ahora — no depende del período
  seleccionado»).
- **«En este período»**: miembros nuevos, publicaciones, comentarios e
  ingresos (pagos con estado pagado dentro de la ventana) del rango
  elegido, con su etiqueta («Los 30 días que elegiste», «Los 12 meses
  que elegiste»).
- **Atención, tercer ítem**: «publicaciones sin respuesta» con el
  conteo total de posts publicados con cero comentarios y, dentro del
  mismo bloque, la lista corta (máx. 5, las más recientes) con título,
  autor, canal y antigüedad, cada una enlazando a su post.
- **Gráficas propias** (`app/components/AdminSeriesChart.vue`, SVG
  inline, sin librerías): **Miembros nuevos** (serie temporal de
  altas), **Publicaciones y comentarios** (dos series con leyenda),
  **Canales más activos** (barras con publicaciones + comentarios del
  período por canal) y **Principales contribuidores** (puntos ganados
  en el período según `point_events`, con el nivel actual de cada
  uno). Todo sale de la base real; sin datos se muestra el estado
  vacío, nunca una serie inventada.
- **API**: `GET /api/admin/stats?range=7|30|90|365` (otro valor cae a
  30) devuelve además `period`, `series`, `busiestChannels`,
  `topContributors`, `unanswered` {count, items} y `generatedAt`,
  conservando los campos anteriores. La ventana del período empieza
  al inicio del primer bucket para que las sumas de las series
  coincidan con los conteos del período. Regla de buckets: 7/30 días
  → un bucket por día; 90 días → 13 buckets de 7 días; 12 meses → los
  últimos 12 meses calendario, un bucket por mes.
- Pie del Panel: «Datos al {fecha y hora} · se actualizan al abrir
  esta página.»
- **Diferencia documentada**: el rango personalizado con calendario
  de la referencia queda **fuera**; los cuatro presets cubren el uso
  real del Panel.
- **Un solo editor de perfil** (corrección posterior, detectada por
  el dueño): el perfil tenía dos editores de los mismos datos — la
  sección «Perfil» de este modal de Ajustes y los modales propios de
  la página de perfil de la Fase 9 («Editar perfil» y el de portada).
  Esos modales se retiraron: el botón «Editar perfil» y el botón de
  portada del perfil propio solo abren el modal de Ajustes en su
  sección «Perfil» (que ya incluye avatar y portada), y al cerrarlo
  la página de perfil recarga sus datos para reflejar los cambios.

## Fase 14 (hecha) — miembros a fondo: roles, invitaciones, aprobación, Level Gates, etiquetas y auto-ingreso

La sección de Miembros de la consola crece a la par de la referencia
(auditoría profunda de la consola, 19-oct-2026), con código y textos
propios. Migración **aditiva**: `memberships.status` nueva y columnas
JSON en `tenants` (`join_approval`, `join_questions`,
`join_cooldown_days`, `auto_join_channels`, `level_gates`) + tablas
`invitations`, `join_requests`, `member_tags`,
`member_tag_assignments` y `access_links`.

- **Roles**: además de `admin` y `member`, existen `moderator` y
  `course_manager`, con capacidades fijas definidas en el servidor
  (`canModerate` / `canManageCourses` / `requireAdmin` /
  `requireModerator` / `requireCourseManager` en
  `server/utils/community.ts`), aplicadas en TODAS las rutas de la
  consola: el moderador entra a Moderación (Fase 12) y a la lista de
  Miembros en solo lectura, y puede eliminar publicaciones y
  comentarios ajenos desde el menú «⋯»; el encargado de cursos, solo
  a Cursos. El riel de la consola se filtra por rol, «Panel de
  administración» aparece para todo el staff (cada uno aterriza en
  su sección) y entrar directo a una ruta prohibida muestra el aviso
  de acceso denegado de siempre. La regla de no degradar al único
  administrador se mantiene. **Diferencia documentada**: NO hay
  matriz de permisos configurable ni roles personalizados (la
  referencia trae 25 grupos de permisos): la subsección
  Miembros → Roles explica en lenguaje claro qué puede hacer cada
  uno de los cuatro roles fijos.
- **Aprobación previa de ingreso** (Ajustes → «Ingreso de
  miembros»): interruptor, hasta 6 preguntas que se responden al
  registrarse y días de espera tras un rechazo (`join_cooldown_days`;
  0 = reintento inmediato). Con la aprobación encendida, el registro
  crea la membresía en estado `pending` y una solicitud con las
  respuestas: la persona abre sesión pero un **muro de estado**
  (`server/middleware/membership-status.ts`) responde 403 en toda la
  API de la comunidad y la interfaz muestra `/pending` («Tu
  solicitud está en revisión»). La cola vive en Miembros →
  Solicitudes de ingreso (aprobar = acceso + auto-ingreso + aviso
  in-app; rechazar = estado `declined`, con re-solicitud posible
  tras el cooldown) y el Panel suma el conteo en «Necesita tu
  atención». Sin aprobación, el registro sigue siendo inmediato.
- **Invitaciones** (Miembros → Invitaciones): por **correo**
  (personal, un solo uso, solo para ese correo) y por **enlace**
  (reutilizable, con vencimiento opcional, contador de usos y
  revocación). Quien entra con invitación válida nace **aprobado**
  aunque la aprobación previa esté encendida. Los correos de
  invitación pasan por la capa existente y quedan **EN OSCURO**:
  sin proveedor configurado se registran como no enviados y la
  interfaz lo dice con franqueza, ofreciendo copiar el enlace para
  compartirlo manualmente (nunca se finge un envío). **Alta manual**:
  el administrador crea la cuenta con una contraseña temporal
  generada que se muestra **una sola vez** para pasársela a la
  persona.
- **Level Gates (compuertas por nivel)**: Gamificación →
  «Compuertas por nivel», una por acción (crear publicaciones,
  enviar mensajes directos, chatear en salas y canales, pegar
  enlaces en el feed, pegar enlaces en el chat, publicar videos en
  el feed), cada una con un nivel mínimo o «sin compuerta». Se
  **aplican en el servidor** (403 con el mensaje «Necesitás el nivel
  X para…», con los puntos actuales y los necesarios) en posts,
  comentarios con enlace, DMs, chat de canal, salas y videos. El
  **staff nunca se bloquea**. La UI avisa antes en el compositor de
  posts y en los mensajes directos (vía `gates` de `/api/tenant`);
  en enlaces y video avisa el error del servidor. La compuerta se
  guarda por **umbral de puntos** (único por tenant), no por id:
  la pantalla de niveles reemplaza la lista al guardar. **Diferencia
  documentada**: no hay interruptor maestro de gamificación;
  compuerta en «sin compuerta» = apagada.
- **Etiquetas privadas**: etiquetas del equipo (crear, renombrar,
  borrar, asignar por miembro y filtrar la lista). El miembro
  **nunca** las ve: no salen en su perfil, ni en el directorio, ni
  en ninguna API pública — solo en las rutas de administración.
- **Auto-ingreso a canales**: hasta 2 canales (Ajustes → Ingreso de
  miembros) a los que entra todo miembro nuevo por cualquier vía
  (registro aprobado, invitación o alta manual), como seguimiento
  (`follows`). Si el canal es privado, el auto-ingreso igual suma a
  la persona: es una decisión explícita del administrador al
  configurarlo.
- **Acciones de fila completas**: además de rol y quitar membresía,
  **Suspender** (no puede iniciar sesión — 403 con aviso — y su
  sesión abierta queda fuera por el muro de estado), **Restringir**
  (entra y lee, pero publicar/comentar/reaccionar/votar/chatear
  devuelve 403 claro, vía `requireCanWrite`) y **Enviar enlace de
  acceso** (enlace de un solo uso que vence en 1 hora para entrar
  sin contraseña; el envío por correo queda en oscuro y el enlace
  se puede copiar desde la consola). Nadie puede suspenderse ni
  restringirse a sí mismo, y el último administrador tampoco.

## Fase 15 (hecha) — privacidad y presentación

La comunidad gana las superficies de Settings → Community Privacy,
Feed Sidebar, Navigation Menu, General y Contact de la referencia
(auditoría profunda de la consola, 19-oct-2026), con código y textos
propios. Migración **aditiva** sobre `tenants` (19 columnas): todos
los defaults reproducen el comportamiento anterior — comunidad
privada, directorio y biblioteca de miembros, anticipo como el de
siempre, registro abierto, sin marca — y nada cambia hasta que un
administrador toca un ajuste. Todo se administra desde Ajustes de la
comunidad, en subsecciones nuevas: «Privacidad», «Barra lateral del
feed», «Menú de navegación» y «Contacto», más la marca y el
interruptor de registro en «General».

- **Visibilidad pública opcional** (`visibility`): con la comunidad
  `public`, un visitante sin sesión puede LEER el feed (solo
  publicaciones `published` de canales abiertos y las tarjetas de
  anticipo de los pagos), el detalle de esos posts, las páginas de
  canales abiertos y — según audiencia — el directorio y la
  biblioteca. Los canales **privados** no existen para el visitante:
  fuera de los listados, su página y el detalle de sus posts
  devuelven 404 (este endurecimiento aplica también con la comunidad
  privada: antes la página de un canal privado sin acceso mostraba su
  nombre y un post con anticipo). La búsqueda NO se abre a
  visitantes.
- **Decisión propia registrada**: en modo público el visitante ve la
  publicación pero NO los comentarios (son conversación de miembros)
  ni puede interactuar; la página lo dice y ofrece registrarse.
- **Anticipo granular de canales pagos**, calculado en el único
  serializador de posts (`serializePost`), así feed, detalle, canal,
  búsqueda y videos cuentan la misma historia: modo `preview` /
  `full` / `title`; corte por porcentaje (5–50 %, default 25) y tope
  de caracteres (150–2000, default 350; gana el menor; 0 = sin tope);
  adjuntos como conteo o invisibles (`paid_media_mode`, que además
  dejó de filtrar la URL real del archivo en las tarjetas
  bloqueadas); título completo o acortado a 40/60/80/120; y dónde
  aparecen las publicaciones bloqueadas (`feed` / `channel` /
  `hidden`). Con `full`, **leer no es participar**: el servidor
  separa `canRead` de `canInteract` y comentar, reaccionar o votar
  sin acceso al canal devuelve 403 (antes comentar y reaccionar no
  verificaban el acceso al canal del post).
- **Audiencias**: directorio (`members` / `everyone` / `paid` =
  acceso a un canal pago o suscripción activa / `disabled` = solo
  administración) y biblioteca (`members` / `everyone`). Para el
  visitante el directorio viaja en forma reducida: sin correos y sin
  presencia en vivo.
- **Barra lateral del feed configurable**: orden, visibilidad y
  audiencia (`members` / `everyone`) de los 5 bloques reales del riel
  (Próximos eventos, Publicaciones recientes, Top líderes, Miembros,
  En línea). El servidor solo envía los bloques visibles y filtra
  los datos por audiencia. **Diferencia menor documentada**: acá se
  guarda con el botón «Guardar ajustes», como el resto de la página;
  la referencia guarda al cambio.
- **Menú de navegación editable**: cabecera y lateral salen de una
  sola config (`nav_menu`): renombrar, reordenar, ocultar/mostrar y
  mover de zona los 11 enlaces integrados (no se borran) y agregar
  enlaces personalizados (los externos abren en pestaña nueva). El
  panel móvil usa la misma lista. **Diferencias documentadas**: no
  hay menú separado para website/blog (esa pieza quedó fuera por
  decisión del dueño) y la barra inferior del teléfono conserva sus
  5 acciones funcionales (Inicio, Mensajes, Crear, Avisos, Menú)
  porque son acciones de uso, no enlaces del menú.
- **Marca y registro**: `logo_url` / `logo_dark_url` (la barra
  superior elige según el tema de cada persona, con respaldo icono →
  inicial), `icon_url` y `favicon_url` (el `<head>` lo usa vía
  `useHead` en el layout), subidos por la vía de archivos de siempre
  con validación de imagen (tipo nuevo `branding`). Y
  `anyone_can_register`: apagado, `POST /api/auth/register`
  responde 403 y la página de registro muestra el aviso de cierre —
  salvo que el registro traiga una invitación válida de la Fase 14,
  que sigue entrando.
- **Contacto**: correo de soporte, sitio web y hasta 10 redes
  (Facebook, X, Instagram, LinkedIn, YouTube, TikTok, Discord) en un
  bloque al pie del lateral, visible solo si hay al menos un dato.

Verificación local por contenido (60 chequeos contra el dev server):
defaults intactos; negativas de filtración en ambos modos (canal
privado invisible y 404, cuerpo premium jamás servido a no
compradores, comentarios retenidos al visitante); anticipo medido
con un post de 2 759 caracteres (tope 350 + elipsis; sin tope manda
el 25 %); modos `title` y `full` (con 403 al comentar/reaccionar);
`hidden`/`channel` consistentes en feed, canal y búsqueda; título
acortado a 40 + elipsis; audiencias del directorio (everyone /
disabled / paid) y de la biblioteca; riel oculto y reordenado;
menú con enlace personalizado y «Eventos» oculto; registro cerrado
403 y con invitación 200 activo; favicon presente en el `<head>`
servido. Build 0, typecheck 0, suite `test-realtime.mjs` 5/5 PASS.
Datos de prueba eliminados y ajustes locales restaurados a los
defaults.

**Endurecimiento posterior (verificado en producción tras el
despliegue de la fase)**: el `GET /api/feed` sin sesión devolvía los
posts de canales abiertos con el cuerpo completo aunque el tenant
estuviera en `visibility='private'` — el endpoint nunca exigió
sesión y la «privacidad» vivía solo en las páginas. Corte único en
el servidor (`requireSessionUnlessPublic` en `server/utils/privacy.ts`):
sin sesión y con la comunidad NO pública, TODAS las superficies de
lectura de contenido responden **401** («Iniciá sesión para
continuar.»): feed, detalle de post, listado y detalle de canales,
videos, catálogo y detalle de cursos, visor de lecciones, lista y
detalle de eventos, perfiles, ranking y riel lateral. La búsqueda
anónima también quedó cerrada en modo privado (solo cortaba en
público) y la biblioteca alineó su regla: listado y descarga de
archivos exigen sesión salvo comunidad pública con audiencia
`everyone` (y la descarga con candado, sesión siempre). Siguen
abiertas a propósito, como antes: `/api/tenant` (marca para
login/registro), las rutas de auth e invitación/acceso, los textos
legales, la página pública de precios (`/api/billing/plans`, vitrina
comercial sin contenido de la comunidad) y el servidor de archivos
públicos `/api/files` (imágenes y marca; los archivos de biblioteca
no pasan por ahí). Con `visibility='public'` la lectura anónima
acotada de esta fase no cambió en nada, y con sesión válida tampoco
cambia nada. Verificación local por contenido: batería anónima en
ambos modos (17 rutas de contenido en 401 con la comunidad privada;
en pública, abiertos completos, premium solo anticipo medido,
privado invisible y detalle 404, comentarios retenidos), sesión de
miembro con todo 200 y cuerpos completos, y descarga real de
biblioteca en las tres combinaciones de audiencia. Build 0,
typecheck 0, suite 5/5 PASS; tenant local restaurado a privado y
datos de prueba eliminados.

## Fase 16 (hecha) — contenido central y certificados

La consola suma la sección **Contenido** (entrada en el riel, admin
y moderator) con tres subsecciones por ruta — Publicaciones,
Archivos y Canales — y el área de Cursos gana los **diseños de
certificado** (blueprints) con **verificación pública**, como
Content y Course tools de la referencia (auditoría profunda, ronda
2). Todo con código y textos propios; migración aditiva de siempre.

- **Contenido → Publicaciones** (`/admin/content`): tabla con TODOS
  los posts del tenant: buscador por título/autor, chips de estado
  con conteos (**Todos, Publicados, Borradores, Programados, En
  revisión** — los estados reales de esta plataforma), columnas
  Título (con chip «Editado» si el post fue editado, además de
  Encuesta y Anónimo), Estado, Autor, Canal, Reacciones,
  Comentarios y fecha. Menú por fila según estado: Ver, Editar (al
  editor que ya existe: «Mis borradores» para borradores y
  programados; Moderación para los que están en revisión),
  **Publicar** (borrador/programado → publicado al instante por el
  staff) y **Eliminar** con la cascada compartida
  `deletePostCascade`. Sin acciones en lote (la referencia tampoco
  tiene). API `GET /api/admin/content/posts` (paginación
  limit/offset, filtro por estado y texto) +
  `POST .../posts/[id]/publish` y `DELETE .../posts/[id]`, con
  `requireModerator`.
- **Contenido → Archivos** (`/admin/content/media`, solo admin): el
  gestor de medios con TODAS las subidas del tenant (tabla
  `uploads`): nombre, tipo derivado del MIME (Imagen/Video/Audio/
  Archivo, con pestañas y conteos), subido por, tamaño, fecha y
  **Ubicación** — dónde se usa el archivo, resuelta en el mejor
  esfuerzo contra las referencias reales del esquema (avatar y
  portada de perfil, adjunto o contenido de un post, miniatura y
  banner de curso, archivo de lección, ítem de biblioteca por su
  `file_key`, marca del tenant); sin referencia, «—». El **total
  usado** es la suma real de tamaños: no se muestra ninguna cuota
  (ver Diferencias). Panel de detalles (USlideover) con vista
  previa si es imagen, metadatos, **Descargar** y **Copiar URL**.
  **Eliminar** borra el objeto de R2 (o el archivo local) y la
  fila; si el archivo está referenciado, la confirmación lo
  advierte NOMBRANDO cada ubicación y exige tildar «entiendo que
  está en uso» antes de proceder.
- **Contenido → Canales** (`/admin/content/channels`, solo admin):
  tabla con Nombre, Tipo, Seguidores (el conteo real de `follows`),
  Acceso, **Quién puede publicar**, Grupo y menú (Ver, Editar — a
  la gestión de canales de siempre —, Copiar ID, Archivar/
  Desarchivar, Eliminar). Dos piezas nuevas de esquema (aditivas):
  `channels.archived_at` y `channels.post_permission`. **Archivar**
  un canal lo hace desaparecer para los miembros de la navegación
  (`/api/channels` lo excluye para todos; solo la gestión del
  admin lo pide con `?includeArchived=1`), del feed, de la
  búsqueda y del chat, y su detalle y sus posts responden 404 por
  enlace directo; el contenido queda guardado y el admin lo sigue
  viendo en la consola y en la página del canal (con aviso de
  archivado). **`post_permission = 'staff'`** («Solo el equipo»):
  los miembros sin rol de staff reciben 403 al crear posts en ese
  canal («Solo el equipo puede publicar en este canal.») y el
  compositor se reemplaza por ese aviso dentro del canal; comentar
  y reaccionar NO se bloquean. El PUT de canales acepta
  `postPermission` y `archived` opcionales sin tocar el resto.
- **Diseños de certificado** (`certificate_blueprints`, CRUD en
  Cursos → Certificados, `/admin/courses/blueprints`, admin y
  course_manager): nombre, color de acento, texto de encabezado,
  texto del cuerpo con marcadores **{nombre}**, **{curso}** y
  **{fecha}**, nombre y cargo del firmante, y mostrar el logo de
  la comunidad. Vista previa con datos de ejemplo al editar. El
  estudio del curso suma el selector «Diseño del certificado»
  junto al interruptor de la Fase 8 (`courses.certificate_blueprint_id`;
  sin elección vale el **diseño por defecto del sistema**, con el
  color de marca del tenant). Borrar un diseño con certificados
  emitidos responde **409**: la salida es desactivarlo (los cursos
  que lo usaban vuelven al diseño por defecto al borrar uno sin
  emisiones).
- **Emisión con foto del diseño** (`certificates`): la primera vez
  que un miembro elegible (100% del curso, certificado encendido)
  abre su certificado, se EMITE un registro con **código único**
  (`CERT-XXXXX-XXXXX`) y una copia congelada del diseño vigente
  con los marcadores ya reemplazados, más nombre del miembro,
  título del curso, comunidad y fecha de finalización. Editar el
  blueprint después NO altera los certificados emitidos
  (verificado). La página del certificado del miembro pinta esa
  foto: borde y encabezado en el color de acento, logo si el
  diseño lo pide y la marca cargada, firmante con línea, y al pie
  el código con el aviso de verificación.
- **Verificación pública**: `/verify` (buscador por código) y
  `/verify/[code]`, sin sesión, respaldados por
  `GET /api/verify/[code]`: válido muestra miembro, curso,
  comunidad y fecha de finalización; código inexistente,
  «No encontramos un certificado con ese código.» Sin correos ni
  ningún dato extra.

**Diferencias con la referencia (honestas)**:

- La tabla de posts NO tiene chip «Edit Review»: esa revisión de
  ediciones quedó fuera en la Fase 12 y no se inventó para esta
  tabla. Los estados son los cuatro reales.
- El gestor de medios no muestra cuota («de 500 GB» en la
  referencia): acá no hay un límite contratado que mostrar, así
  que solo va el total usado real. Nada de números inventados.
- La columna de canales dice «Seguidores» y no «Miembros»: en
  esta plataforma los canales no tienen lista de miembros propia;
  el conteo real equivalente es el de seguidores (`follows`).
- La verificación pública NO busca por correo (la referencia lo
  trae como interruptor apagado por defecto, con advertencia de
  privacidad): queda fuera a propósito; solo por código.
- **Blogs** no se construyó: en la referencia pertenece a su
  Website, excluido del alcance por decisión de Juan.

**Verificación (local, por contenido)**: build 0, typecheck 0,
suite `test-realtime.mjs` 5/5 PASS. Batería propia de 69 chequeos
contra `wrangler dev`, todos PASS: conteos de la tabla coherentes
y de vuelta al estado inicial tras publicar/eliminar con cascada
(el detalle responde 404 y el comentario desaparece con el post);
la suma de tamaños del gestor == total usado (140 B exactos en la
prueba) y la ubicación del avatar se detecta («Foto de perfil
de…») mientras una imagen sin uso muestra «—»; borrar un archivo
sin uso hace que su URL pública responda 404; canal archivado
fuera de listado/feed/búsqueda/chat (404) y visible en la consola,
desarchivar lo restaura; con «solo el equipo», el miembro recibe
el 403 con el mensaje y ve el aviso en la página del canal, el
staff publica y el miembro sigue pudiendo comentar; roles por
sección (moderator: tabla sí, medios y canales no; course_manager:
tabla no, diseños sí); certificado emitido con el diseño del
blueprint (color, encabezado, firmante, marcadores reemplazados),
invariable tras editar el blueprint, borrado del blueprint en uso
con 409, y verificación pública sin sesión (válido con los datos
correctos y sin correos; inventado con su mensaje). Datos de
prueba eliminados por completo (conteos de vuelta a la semilla) y
snapshot `scripts/d1-init.sql` regenerado con las tablas y
columnas nuevas.

## Fase 16-B (hecha) — menú y acciones de la publicación

El menú «…» de la tarjeta (`PostCard`, el componente único de feed,
canal, detalle, perfil, búsqueda y guardados) quedó con la
composición completa de la referencia, **todo funcional y
sincronizado** entre superficies — nada de entradas decorativas:

- **Siempre** (con sesión): **Guardar publicación / Quitar de
  guardados** (la MISMA función y el mismo estado local que el
  icono de marcador de la cabecera: guardar en un lado se refleja
  en el otro y en la pestaña Guardados del perfil), **Copiar
  enlace** (copia la URL real del detalle — origen actual +
  `/p/<canal>/<slug>` — con toast de confirmación; sin clipboard
  API ofrece la URL en un prompt para copiarla a mano) y **Ver
  publicación** (navega al detalle).
- **Del autor**: **Editar publicación** — abre en la propia tarjeta
  el editor rico con «/» (el mismo de «Mis borradores»; las
  encuestas editan su pregunta como texto). El `PUT
  /api/posts/[id]` ahora acepta también posts **ya publicados** del
  autor (antes era solo borradores/programados): sanitiza el cuerpo
  y marca `edited_at`, así la tarjeta muestra «Editado». El cambio
  se aplica al instante en la tarjeta (override local) y el padre
  refresca con `@changed` cuando escucha; feed, canal y detalle
  sirven el contenido nuevo.
- **Del autor y del staff**: **Desactivar comentarios / Activar
  comentarios** — nuevo `POST /api/posts/[id]/comments-toggle`
  (autor o `canModerate`; el resto, 403). No hay columna nueva:
  alterna la `allow_comments` que ya existía desde la Fase 7 (el
  autor podía cerrarlos al publicar) — una sola fuente de verdad.
  La API de comentarios ya respondía 403 «Los comentarios están
  desactivados en esta publicación.»; el detalle muestra el aviso
  y conserva visibles los comentarios previos; la tarjeta muestra
  el indicador «Comentarios desactivados» en el pie y su estado se
  actualiza sin recargar.
- **Del staff que modera** (admin y moderador): **Fijar
  publicación / Desfijar publicación** (antes «Fijar (anuncio)»,
  solo admin). El endpoint de fijar pasó de `requireAdmin` a
  `requireModerator`; la insignia «Fijado» y el comportamiento de
  anuncio se conservan intactos.
- **Eliminar publicación** (autor o staff, con su confirmación y
  la cascada de siempre) y, en posts ajenos, **Ocultar publicación**
  y **Reportar** (Fases 5 y 12) en el mismo menú, sin duplicar.

**Verificación (local, por contenido)**: build 0, typecheck 0,
suite `test-realtime.mjs` 5/5 PASS. Batería propia de 33 chequeos
contra `wrangler dev`, todos PASS: el autor edita su post
publicado y el feed y el detalle sirven el título/cuerpo nuevos
con la marca «Editado»; un miembro ajeno recibe 403 al editar,
cerrar comentarios o fijar por API (y el autor no-staff tampoco
fija); cerrar comentarios → comentar responde 403 con el mensaje,
el detalle muestra el aviso y el comentario previo sigue visible,
la tarjeta del feed muestra el indicador; reabrir → comentar
vuelve a funcionar; guardar se refleja en el feed
(`bookmarked=true`) y en la pestaña Guardados; el moderador fija y
cierra comentarios en un post ajeno y el fijado se refleja con
`pinned=true`; la URL del enlace sirve el detalle editado; el
autor elimina su post y el detalle responde 404. Datos de prueba
borrados y la semilla local restaurada (el post de bienvenida
quedó fijado y con comentarios abiertos, como al principio). Los
dos únicos FAIL iniciales fueron de la propia batería (asumió que
el post de bienvenida partía sin fijar, y venía fijado de la
semilla): se corrigió la prueba con un ciclo completo sobre un
post nuevo, no el producto.

## Fase 16-C (hecha) — la edición de un post usa EL MISMO compositor del proyecto

A pedido de Juan (con capturas): en la referencia, «Edit Post» abre
**el mismo compositor** de crear; el nuestro abría un modal aparte
tipo formulario («Editar publicación», «Título» en una caja con
borde, «Guardar cambios»). Eso quedó unificado: **hay un solo
editor de publicaciones en el proyecto** y es `PostComposer`, el
del feed, ahora con dos modos (`create` / `edit`) sobre el mismo
modal — imposible que crear y editar se desincronicen:

- **Modo edit**: precarga título, cuerpo rico, estado de anónimo y
  de comentarios, el adjunto principal y la encuesta. La cabecera
  es la del compositor: avatar + nombre del autor + «Publicando en
  # Canal» con el canal **fijo** (un post no se muda de canal, como
  en la referencia), iconos de anuncio (admin, en publicadas),
  anónimo y comentarios reflejando el estado del post, expandir y
  cerrar con la misma confirmación de descarte de siempre. El botón
  principal es **«Actualizar»**. Sin campos de formulario con
  etiqueta «Título»/«Contenido» en ninguna parte.
- **Una sola pieza, tres entradas**: «Editar publicación» de la
  tarjeta (feed, canal, detalle, perfil, búsqueda, guardados) y el
  «Editar» de **Mis borradores** abren ese modal en modo edit a
  través de `usePostEditor`, con el `PostComposer` anfitrión
  montado una vez en el layout de miembro. El modal de edición de
  la 16-B (en `PostCard`) y el de borradores (en `/drafts`) se
  retiraron del código: no quedan dos editores para lo mismo.
- **Datos que no se pierden al editar**: el `PUT /api/posts/[id]`
  acepta ahora también `allowComments` y el adjunto principal
  (`mediaType`/`mediaUrl`/`attachmentName`, con las validaciones
  de crear) cuando vienen en el cuerpo — el compositor manda
  siempre el estado actual, así que guardar solo un cambio de
  texto **conserva el adjunto**; quitarlo o reemplazarlo desde la
  fila de adjunto del modal también se guarda. Los clientes que no
  mandan esos campos no tocan ni el adjunto ni los comentarios. En
  un programado, la fecha se ajusta en el mismo modal («Publicar
  el») y se guarda con la misma edición. El fijado, si el admin lo
  cambia en la cabecera, se aplica con el endpoint de fijar de la
  tarjeta.
- **Reglas que se mantienen**: el **anónimo no se convierte al
  editar** (se fija solo al crear, Fase 8 — el PUT ni lo acepta; en
  el modal el icono refleja el estado y está deshabilitado con su
  explicación) y las **opciones de la encuesta no se editan** en un
  post ya creado (en el modal se listan en solo lectura, con el
  aviso de siempre; con votos, editarlas sería falsear resultados).
  La pregunta sí se edita, porque es el texto del editor.
- **Sincronización**: al actualizar, el compositor avisa por
  `usePostEditor` y la tarjeta aplica el contenido nuevo (título,
  cuerpo, «Editado», estado de comentarios) sin recargar — también
  en la búsqueda, que no escucha `@changed` —; «Mis borradores»
  refresca su lista y el detalle sirve el contenido nuevo.

**Verificación (local, por contenido)**: build 0, typecheck 0,
suite `test-realtime.mjs` PASS. Batería propia de 30 chequeos
contra `wrangler dev`, todos PASS, simulando los payloads exactos
del compositor: crear un post con adjunto de archivo, editarlo sin
tocar el adjunto → feed y detalle sirven título/cuerpo nuevos con
«Editado» y el adjunto **sigue**; cerrar comentarios en la misma
edición → el detalle lo refleja y comentar responde 403, reabrir
funciona; quitar el adjunto en la edición → el detalle queda sin
adjunto; un `PUT` viejo (sin los campos nuevos) no pierde ni el
adjunto ni el estado de comentarios; un miembro ajeno sigue con
403 al editar; `/api/drafts` trae los campos de precarga
(`allowComments`, `pinned`, adjunto), el programado cambia su hora
desde la edición y el borrador editado se publica con el flujo de
siempre. Greps estructurales: ningún modal `title="Editar
publicación"` ni «Guardar cambios» en `PostCard`, `/drafts` ni
`PostComposer` (el ítem del menú «Editar publicación» sigue, es el
modal el que cambió). Datos de prueba y subidas de la batería
borrados; la base local quedó en la semilla (7 posts, 0 uploads).
(La primera corrida de la batería marcó 9 FAIL concentrados en el
detalle: era la ruta de la prueba — el parámetro es `post`, no
`slug` —; corregida la prueba, 30/30 sin tocar el producto.)

## Fase 17 (hecha) — dinero visible: Ingresos y órdenes, moneda del tenant, pagos manuales y página de planes

La sección de dinero de la consola de la referencia, con código y
textos propios, y la regla de siempre intacta: **nada se finge**.
Stripe sigue EN OSCURO (sin claves) y ningún pago se marca cobrado
sin una confirmación real: la de Stripe por su webhook firmado, o
la de un administrador que revisa un pago manual declarado.

- **Ingresos** (`/admin/earnings`, entrada nueva en el riel):
  KPIs reales desde `payments` — ingresos totales (suma histórica
  de pagos `paid`), ingresos de este mes y órdenes de este mes — y
  la tabla de órdenes con las columnas de la referencia adaptadas a
  nuestros datos: Cliente, Producto (canal/curso/plan según el
  pago), Tipo de producto, Tipo de precio (único/suscripción),
  Pasarela (Stripe/Manual), Monto (en la moneda en que se registró
  el pago), Próxima renovación (si la suscripción sigue activa),
  Pago, Suscripción y Fecha. Sin buscador, sin filtros y sin
  exportar: la referencia tampoco los tiene (paridad honesta).
  Acceso: admin completo; **moderador solo lectura** (como en la
  referencia, donde Moderator tiene 1 permiso de Earnings: ver).
- **Moneda del tenant** (`tenants.currency`, default `USD`): se
  elige en **Ajustes → Pagos** entre USD, GTQ, MXN, EUR, COP, PEN,
  ARS, CLP, BRL y DOP. Un solo criterio de formato
  (`Intl.NumberFormat('es-419')` con símbolo angosto: USD se ve
  «$22.00», GTQ «Q 22.00») aplicado en la página de planes, las
  tarjetas de canales pagos y su checkout, el precio de cursos,
  Ingresos y el Panel. Cambiar la moneda cambia el formato y la
  interpretación de los montos guardados — **no convierte** entre
  monedas; la UI lo dice con una línea honesta. El checkout de
  Stripe ya crea la sesión en la moneda del tenant cuando se
  carguen las claves.
- **Pagos manuales** (encienden las ventas sin esperar a Stripe):
  tabla `manual_payment_methods` (tipo transferencia / billetera /
  enlace / otro, título e instrucciones que ve el comprador,
  activo) con CRUD en Ajustes → Pagos e interruptor
  `tenants.manual_payments_enabled` (default apagado). En los
  checkouts existentes (canal pago, plan, curso pago) el comprador
  elige «Pago manual», ve los métodos con sus instrucciones, paga
  POR FUERA y declara el pago con una referencia opcional: eso
  crea la orden en `payments` con `gateway='manual'` y
  `status='pending'` y **no concede nada**. La cola «Pagos
  pendientes» de Ingresos (solo admin) permite **Aprobar** — marca
  `paid` y concede reutilizando `grantPaymentAccess`, la misma
  función de concesión que usa el webhook de Stripe
  (`channel_access` / suscripción / inscripción) — o **Rechazar**
  (marca `rejected`, sin acceso). El comprador recibe notificación
  in-app en ambos casos. Con un pago pendiente para el mismo
  producto no se puede declarar otro: la UI muestra «Tu pago está
  en revisión». Sin ningún método activo (Stripe oscuro + manuales
  apagados) el checkout mantiene el mensaje honesto de siempre.
- **Página de planes por niveles**: `plans.display_order` y
  `plans.featured` (aditivos; el orden nace del que ya tenían). El
  admin ordena con flechas y destaca un plan con la estrella desde
  `/admin/plans`; `/pricing` renderiza las tarjetas en ese orden,
  con el destacado resaltado («Destacado»), los precios en la
  moneda del tenant y el botón según los métodos activos (Stripe /
  Pago manual / aviso honesto). La sección de canales pagos se
  llama ahora **«Accesos únicos»**. La página sigue siendo vitrina
  pública sin sesión, sin filtrar contenido.
- **Corrección que salió de la verificación**: el índice único de
  `payments.stripe_session_id` pasó a **parcial**
  (`WHERE stripe_session_id <> ''`). La unicidad protege la
  idempotencia de Stripe; los pagos manuales no tienen sesión
  (`''`), y con el índice pleno el *segundo* pago manual de la
  base devolvía 500 por violación de unicidad. Migración
  DROP + CREATE en cada init, sin tocar datos; las sesiones reales
  de Stripe siguen siendo únicas.
- Las órdenes suman `gateway` (default `stripe`, así las filas
  anteriores a la fase se leen como Stripe), `reference`,
  `method_id` y quién/cuándo decidió (`decided_by`, `decided_at`).
  La configuración de pagos vive en **Ajustes → Pagos** (una sola
  casa: moneda, estado de Stripe, interruptor y métodos), no en
  Planes.

Verificación local por contenido (`scripts/test-fase17.mjs`,
45 PASS / 0 FAIL, contra `wrangler dev` con D1 local; build y
typecheck en 0 y `scripts/test-realtime.mjs` en PASS): los KPIs y
la tabla de Ingresos coinciden con sumas cruzadas por SQL sobre
`payments`; el moderador lee la página (200) pero la cola de
pendientes y aprobar/rechazar le responden 403; moneda GTQ →
`/pricing` y la página del canal premium muestran «Q …», y volver
a USD restaura «$ …»; flujo manual completo con dos compradores
nuevos — declarar el pago del canal deja el canal BLOQUEADO
(teaser), el duplicado responde 409 sin crear fila, el admin lo ve
en la cola con comprador/producto/método/referencia y al aprobar
el comprador entra al canal completo, el pago figura `paid` en
Ingresos y el KPI sube el monto exacto; segundo caso (curso):
rechazar deja al comprador sin inscripción, el pago `rejected` y
la notificación de rechazo presente; reordenar y destacar planes
se refleja en el HTML de `/pricing`; con los defaults (manuales
apagados) el pago manual responde 409 y `/api/billing/status`
sigue `enabled:false`. La batería limpia todo lo que crea:
tenant de vuelta en USD con manuales apagados, sin pagos, métodos,
accesos, inscripciones ni usuarios de prueba (verificado por SQL).

- Diferencias con la referencia, a propósito: **una sola página
  de planes por tenant**, sin los «grupos de paywalls» múltiples
  de la referencia (cada tenant vende con una lista de planes, una
  de accesos únicos y sus cursos); Earnings sin buscador, filtros
  ni exportar, igual que la referencia; la moneda no convierte
  montos ya cargados (queda documentado en la propia UI).

## Fase 18 (hecha) — multilenguaje español/inglés reales

La interfaz habla español e inglés de verdad, con la resolución de
la referencia: **elección del usuario** (modal de Ajustes → sección
«Idioma», con «Predeterminado de la comunidad», «Español» y
«English») **> cookie de idioma** (visitantes; la fijan el login y
el cambio de idioma) **> idioma por defecto de la comunidad**
(Ajustes de la comunidad → General → «Idioma por defecto») **>
español**, el idioma base del producto. Sin dependencias nuevas:
catálogo propio y tipado en `app/i18n/es.ts` / `app/i18n/en.ts`
(916 claves, las mismas en ambos — un chequeo automático lo exige)
con un composable `useI18n` y `t(clave)`; la arquitectura admite
sumar idiomas agregando un diccionario. El contenido de los
miembros NO se traduce (publicaciones, cursos, eventos, nombres de
canal y de nivel son datos, como en la referencia).

- **Cobertura traducida (es/en)**: el marco completo de la app
  (barra superior, navegación, lateral, panel y barra móvil, menú
  del avatar), el feed con sus ordenamientos, el compositor
  (compacto y modal, crear y editar), el editor rico (barra, slash,
  formularios), la tarjeta de publicación con todos sus menús, el
  detalle de publicación y los comentarios, las páginas de canal,
  cursos (listado, detalle, lecciones, progreso y certificado),
  eventos, miembros y directorio, ranking, biblioteca, videos,
  mensajes y chat (lista, salas y conversación), notificaciones,
  búsqueda, borradores, perfil completo, el modal de Ajustes del
  usuario entero (incluida la sección nueva «Idioma»), y las
  páginas públicas: login, registro, precios, pendiente, invitación,
  acceso, verificar certificado, vuelta de pago, reglas/términos/
  privacidad (solo los títulos: el cuerpo es texto del tenant) y la
  página de error.
- **Servidor localizado**: los mensajes de error/validación de
  auth (login, registro, invitaciones, estados de membresía),
  posts y comentarios, y el checkout (manual y en línea) responden
  en el idioma resuelto del solicitante (`server/utils/i18n.ts`).
  Las guardas comunes (sesión, escritura restringida) también.
- **Fechas y dinero**: `Intl` según el idioma activo («hace 5 min» /
  «5 min ago», calendarios, fechas completas) y `formatMoney`
  respeta idioma (es-419 / en-US) además de la moneda del tenant.
- **SSR correcto**: el idioma resuelto viaja en `/api/tenant` y el
  HTML nace en ese idioma, con `<html lang>` acorde, sin parpadeo.
  (Al construirlo salió a la luz un detalle real: el `fetchMe` de
  `app.vue` no puede llamar composables después de su `await` — el
  contexto de Nuxt se pierde en SSR —; el composable de idioma se
  captura antes, en la creación de `useAuth`.)
- **Quedó SOLO en español, declarado** (lista cerrada): los
  **cuerpos de las páginas de la consola de administración**
  `/admin/**` — del cascarón de la consola SÍ se tradujeron los
  rótulos del riel y la cabecera —; los **títulos de las
  notificaciones ya generadas** (se escriben en la base al crearse,
  con los nombres y contenidos de los miembros: el marco de la
  pantalla de notificaciones sí se traduce); los **nombres de
  producto que el servidor guarda en los pagos** («Acceso al canal
  …», como cualquier dato guardado); los mensajes del endpoint de
  **enlaces de acceso** de un solo uso (la página sí está
  traducida; el aviso genérico de respaldo también); el **correo de
  bienvenida** del registro (la capa de correo sigue en oscuro); y
  dos validaciones de borde al guardar el idioma (textos de 400 en
  los endpoints de ajustes de idioma).
- **Verificación**: `scripts/test-fase18.mjs` (29 chequeos, todo
  PASS local): paridad de diccionarios importando ambos catálogos;
  visitante en /login y /pricing por defecto y por cookie; un
  usuario elige English y su feed SSR sale en inglés mientras el de
  otra usuaria sigue en español, sin claves crudas en el HTML;
  defecto de la comunidad en inglés → la usuaria sin elección lo ve
  en inglés al volver a entrar y quien eligió Español explícito se
  queda en español; mensajes de servidor en ambos idiomas (login
  inválido, encuesta sin pregunta, checkout manual deshabilitado);
  persistencia de la elección tras cerrar sesión y volver a entrar;
  y limpieza final (locales de usuarios en NULL, defecto del tenant
  en español, conteos de usuarios y posts intactos). Build y
  typecheck en cero; `test-realtime.mjs` PASS.

## Fase 16-D (hecha) — submenús de consola en columna, sin pestañas

La paridad también es CÓMO se navega: en la referencia, Settings (y
cada sección con subsecciones) abre una **columna de submenú
vertical** junto al riel de la consola, con el contenido a la
derecha; la nuestra repartía las subsecciones en **pestañas
horizontales**, y encima de forma inconsistente (cada sección con
su propio markup, y Cursos con una fila de pestañas escrita a
mano). Esta fase unifica el patrón:

- **Un solo componente, `AdminSubMenu`**: columna vertical en
  escritorio (riel de secciones → submenú → contenido, la columna
  queda fija al hacer scroll) y fila horizontal compacta
  desplazable SOLO en pantallas chicas. Dos modos según la forma
  de los ítems: `{ value }` para subsecciones de una misma página
  (el enlace escribe `?tab=` y la activa sale de la URL, como
  siempre: los enlaces que apuntan a `?tab=pagos` y demás siguen
  aterrizando en su subsección) y `{ to }` para subsecciones que
  son rutas propias (la activa sale del path).
- **Mapa final de navegación de la consola**:
  - **Ajustes de la comunidad** (`/admin/settings`, modo `?tab=`):
    General · Privacidad · Barra lateral del feed · Menú de
    navegación · Contacto · Pagos · Textos legales · Moderación ·
    Ingreso de miembros. Sigue siendo un solo formulario con un
    solo guardado; el selector de idioma de la Fase 18 y la
    moneda/métodos de la Fase 17 quedaron intactos.
  - **Gamificación** (modo `?tab=`): Niveles e insignias · Puntos
    por acción · Compuertas por nivel. Un solo guardado, como
    siempre.
  - **Miembros** (rutas): Miembros · Solicitudes de ingreso ·
    Invitaciones · Roles. «Solicitudes» se ofrece siempre al
    admin: la página avisa si la aprobación previa está apagada y
    muestra el historial. El moderador solo ve «Miembros».
  - **Contenido** (rutas): Publicaciones · Archivos (solo admin)
    · Canales.
  - **Cursos** (rutas): Cursos · Certificados. Las dos páginas
    decían «Administración» como título y traían su propia fila
    de pestañas escrita a mano: ahora titulan «Cursos» y usan el
    submenú común.
  - Las listas de ítems por rol viven en
    `composables/useAdminMenus.ts`: a nadie se le ofrece una
    subsección que el servidor le negaría, y la consola sigue
    filtrada por rol de punta a punta.
- **Lo que NO es navegación entre subsecciones y se queda** (la
  distinción importa): las **pestañas de cola de Moderación**
  (Reportes / En revisión, componente `AdminQueueTabs`) reparten
  UNA misma lista de trabajo en vistas — es el patrón de la
  referencia para esa pantalla, no subsecciones —; los **filtros
  de datos** de Contenido (estados de publicaciones, tipo de
  archivo en Medios, Activos/Archivados en Canales) filtran la
  lista que se está viendo; y las **pestañas del estudio de un
  curso** (Curriculum / Drip / Enrollments / Settings) son los
  paneles de trabajo de UN editor enfocado en un solo curso, no
  navegación de la consola. Los tres componentes horizontales
  viejos (`AdminSubNav`, `MembersSubNav`, `ContentSubNav`) se
  retiraron del código: no quedan dos implementaciones del mismo
  submenú.
- **Responsive**: por debajo de `lg` el submenú se pliega a la
  fila compacta; el contenido nunca queda tapado ni exige scroll
  horizontal de página.

Verificación local por contenido (`scripts/test-fase16d.mjs`,
**49 PASS / 0 FAIL**, contra `wrangler dev` con D1 local): el
HTML servido de `/admin/settings` muestra la columna con las 9
subsecciones y ninguna fila de pestañas; `?tab=pagos` aterriza en
Pagos con la moneda y los métodos de la Fase 17 y la subsección
marcada activa; `?tab=privacidad` muestra el teaser granular de
la Fase 15; General conserva el selector de idioma de la Fase 18;
guardar el correo de soporte desde Contacto persiste y se
restauró. Miembros, Contenido y Cursos muestran su submenú con la
subsección activa marcada en cada ruta; Moderación conserva su
`tablist` de cola y no tiene submenú; los filtros de datos de
Contenido siguen presentes. Con Diego promovido a moderador (y
devuelto a miembro al final): su submenú de Miembros trae solo
«Miembros» y el de Contenido no ofrece Archivos. Build y
typecheck en cero; `test-realtime.mjs` PASS. Base local limpia
al cerrar: 4 usuarios semilla y 7 publicaciones.

## Fase 16-E (hecha) — marco fijo: solo el centro se desplaza

En la referencia los lados quedan FIJOS (barra superior, lateral
de canales y riel derecho no se mueven) y la única zona que se
desplaza es la columna central con las publicaciones; acá el
documento entero era el desplazador y todo se iba con la página.
Esta fase cambia la arquitectura de scroll de los dos layouts de
app y barre el mismo error en todo el producto:

- **Layout de miembro (`default.vue`)**: la raíz pasa de
  `min-h-screen` a `flex h-dvh flex-col overflow-hidden` — el
  documento ya no se desplaza. El header es una fila fija superior
  (sin `sticky`: ya no hay página que arrastrar) y debajo vive una
  fila de alto completo con tres regiones independientes:
  - **Lateral de canales**: fijo con scroll interno propio
    (`overflow-y-auto` en su contenedor).
  - **Columna central**: el desplazador principal
    (`overflow-y-auto`); contiene la página, el pie (que bajó al
    final de este scroll, donde sigue alcanzable) y el respiro de
    la barra inferior móvil.
  - **Riel derecho: fijo con scroll interno propio** — su
    contenedor lleva el `overflow-y-auto`, con la altura de la
    zona bajo el header. Desplazar dentro del riel no mueve la
    columna central, y desplazar la columna central no mueve el
    riel. Sigue existiendo solo desde `xl` y nunca en el perfil.
  - Breakpoints intactos: 768–1279 lateral fijo sin riel ni
    pastillas; <768 el panel deslizable (`USlideover`, con su
    scroll interno de siempre) y la **barra inferior móvil queda
    fija** abajo (`position: fixed`, como ya estaba).
  - Al cambiar de página la columna central vuelve arriba
    (vigilado por ruta en el layout: el router solo sabe mover la
    ventana, que ya no se mueve). Un cambio de query dentro de la
    misma página no reinicia el scroll.
- **Consola (`admin.vue`)**: misma arquitectura — raíz `h-dvh`,
  header fijo, **riel de secciones fijo con scroll interno**
  (retirado el `sticky top-20`) y solo el contenido de la sección
  se desplaza; al cambiar de sección o de subsección (`?tab=`) el
  contenido vuelve arriba.
- **`AdminSubMenu`** (Fase 16-D): su columna queda fija con
  scroll interno propio — sticky DENTRO del desplazador de
  contenido de la consola, con tope a la altura de la zona bajo
  el header (`max-h` + `overflow-y-auto`). El panel lateral del
  estudio de un curso (currículum) se recalculó igual contra el
  mismo desplazador.
- **Mapa del barrido (antes → después)**:
  - Feed, canal, cursos, eventos, miembros, biblioteca, videos,
    ranking, notificaciones, borradores, búsqueda, detalle de
    post y perfil: scroll de página → columna central del marco.
  - Chat (canal y `/messages`): el hilo `ChatThread` YA tenía su
    propio scroll interno (`max-h` + `overflow-y-auto`) y lo
    conserva; la lista de conversaciones se desplaza con la zona
    central. Sin doble scroll nuevo.
  - Modales y diálogos (compositor de crear/editar, ajustes de
    usuario, buscador, reportes): se teletransportan fuera del
    marco y el documento no se desplaza, así que el fondo no se
    mueve al abrirlos; su contenido se desplaza por dentro, como
    hasta ahora.
  - Tablas anchas de la consola (Contenido, Medios, Canales,
    Ingresos): su scroll horizontal ya vivía dentro de su
    contenedor (`overflow-x-auto`) y sigue ahí, sin romper el
    ancho del marco.
  - Scroll infinito: NO hay en el producto (el feed y los
    listados cargan completos; no existe `IntersectionObserver`
    ni listener de scroll de ventana), así que no hay observador
    que re-apuntar al nuevo desplazador.
  - **Sin cambios a propósito**: el layout `auth` (login,
    registro, pendiente de ingreso, invitación, enlace de
    acceso y verificación pública de certificados) conserva su
    scroll de página — son páginas simples, no el marco de la
    app, igual que en la referencia. `/pricing`, términos,
    privacidad y reglas viven en el cascarón de la comunidad (no
    usan el layout `auth`), así que heredan el marco como ya
    heredaban el cascarón.

Verificación local por contenido (`scripts/test-fase16e.mjs`,
**24 PASS / 0 FAIL**, contra `wrangler dev` con D1 local): el
HTML servido del feed muestra la raíz `h-dvh`, las tres regiones
con su overflow propio en elementos distintos y en orden
(lateral · centro · **riel derecho con su overflow en su propio
contenedor**), el header sin `sticky`, el pie dentro del scroll
central y el perfil sin riel; la consola muestra riel y submenú
fijos con scroll interno y solo el contenido desplazable;
`/login` conserva su layout de página y la API del feed sigue
respondiendo. Build y typecheck en cero; `test-realtime.mjs`
PASS. Base local limpia al cerrar: 4 usuarios semilla, 7
publicaciones y cero mensajes de prueba QA-RT.

## Fase 16-F (hecha) — canales como el original: modal único, edición en contexto, grupos y tipo Imagen

Pedido de Juan con capturas del original (19-oct-2026): en canales
el original edita DIRECTO — menú «⋯» por canal en el lateral y en
la cabecera del canal, modal de creación con tarjetas de tipo,
visibilidad de tres estados y grupos — y la página de canal es
independiente, sin el lateral derecho del feed. Todo eso quedó
construido con código y textos propios.

**Los tres ejes del canal (no confundirlos).** `channels.type`
SIGUE siendo el eje de ACCESO de siempre (`free` / `private` =
solo miembros / `paid`), el que usan `canAccessChannel` y el
serializador de anticipos; no se tocó su significado. La fase suma
dos columnas aditivas:

- `content_type`: `'post' | 'image'` (default `'post'`) — qué se
  publica en el canal; el de imagen suma las vistas Galería/Álbum.
- `visibility`: `'public' | 'private' | 'secret'` (default
  `'public'`) — eje SEPARADO del acceso. Y `cover_url` para la
  portada. **Mapeo de la migración** (una sola vez, con marca en
  `app_meta`): cada canal conserva su comportamiento actual —
  `free`/`paid` quedan `'public'` (listados, con el anticipo y la
  compra de siempre) y `type='private'` queda `'private'`
  (listado para miembros, que es donde el lateral ya lo mostraba,
  con la membresía como acceso). Semántica nueva: `'private'` =
  listado (nombre y descripción visibles en lateral, directorio y
  búsqueda) pero **contenido bloqueado** hasta cumplir el acceso
  (membresía si el acceso es «solo miembros», compra/suscripción
  si es pago, acceso concedido si es gratuito) — su página abre
  como pantalla de bloqueo con portada y metadatos y **cero**
  publicaciones, y su contenido no sale por feed, búsqueda,
  videos, perfiles, detalle directo (404) ni notificaciones;
  `'secret'` = no listado para quien no tiene acceso y su página
  responde 404, como respondía un canal sin acceso.

**Modal único de canal** (`ChannelFormModal` + `useChannelEditor`,
montado en los layouts de miembro y de consola): tarjetas de tipo
(Publicación / Imagen, con sus textos), nombre con prefijo `#`,
descripción corta con contador `/280`, radios de visibilidad con
la explicación de cada estado, acceso (Gratuito / Solo miembros /
Pago) con precio en la moneda del tenant cuando es pago, quién
puede publicar, grupo y portada (subida nueva `kind='channel'` de
`/api/uploads`: imagen de hasta 5 MB que NO toca el perfil de
nadie; asignarla es del PUT de canales). La consola
(Administrar canales) abre ESTE modal para crear y editar — el
formulario básico anterior se retiró — y su tabla conserva
grupo, tipo de contenido, acceso, visibilidad, estado archivado
y seguidores. Un solo editor, un solo par de endpoints
(`POST`/`PUT /api/admin/channels`, solo admin).

**Edición en contexto (mapa de menús).** El menú «⋯» de un canal
es el mismo componente (`ChannelContextMenu`) en el lateral, el
panel móvil, el directorio y la cabecera de la página del canal:

| Entrada | Quién | Qué hace |
|---|---|---|
| Seguir canal / Dejar de seguir | miembro | el canal entra/sale de SU lateral |
| Copiar ID | miembro | copia el id numérico, con toast |
| Agregar/Cambiar portada | admin (solo en la cabecera) | subida directa + el mismo PUT |
| Editar canal | admin | el modal único |
| Precios | admin | el modal único enfocado en el precio |
| Gestionar miembros | equipo (admin/moderador) | modal con buscar, conceder y quitar acceso |
| Eliminar canal | admin | confirmación y la cascada de siempre |

**Seguir** usa la relación `follows` que ya existía (la consola ya
contaba «Seguidores»): seguir = el canal aparece en el lateral
del usuario; dejar de seguir lo quita del lateral **sin quitar el
acceso** (sigue en el directorio `/channels`, en la búsqueda y
abrible). El lateral y el panel móvil ahora filtran por
seguimiento. Para no vaciar laterales con el cambio, una semilla
de una sola vez hizo que cada membresía existente siguiera todos
los canales listados de su tenant, y las membresías nuevas nacen
igual (`ensureMembership`). Conceder acceso desde «Gestionar
miembros» también hace seguir el canal (si no, el acceso sería
invisible); quitar el acceso NO quita el seguimiento (es del
miembro). **Gestionar miembros** gestiona el ACCESO CONCEDIDO
(`channel_access`, la «invitación» de los canales cerrados) con
endpoints nuevos `GET/POST/DELETE /api/admin/channels/[id]/members`
con guard de equipo — verificado por API: conceder abre la página
y el feed del miembro, quitar devuelve el bloqueo.

**Grupos.** La tabla `channel_groups` y `channels.group_id` ya
existían (la consola ya agrupaba); lo nuevo es gestionarlos en
contexto: encabezado de grupo en el lateral y el panel móvil con
«+» (admin: crear canal con ese grupo preseleccionado) y menú
«⋯» (Ver canales → el directorio nuevo `/channels`; Editar grupo:
renombrar/reordenar; Eliminar grupo). El **grupo por defecto es
el primero del orden** (en la semilla, «General»): no se puede
eliminar y es el destino de los canales cuando se elimina otro
grupo — ningún canal se borra al borrar un grupo. Endpoints:
`POST /api/admin/channel-groups`, `PUT/DELETE
/api/admin/channel-groups/[id]` (solo admin).

**Página de canal independiente.** Cabecera propia: portada (o la
franja de marca), `# nombre`, distintivos (acceso, visibilidad,
tipo Imagen) y su menú «⋯». **Sin riel derecho** (el layout lo
suprime en `/channels/*`, como ya hacía en el perfil): el centro
se ensancha y el marco fijo de la 16-E queda intacto. La portada
se cambia desde el menú de la cabecera o desde el modal.

**Canal tipo Imagen.** Bajo la cabecera, el conmutador **Feed |
Galería | Álbum**: Feed = las tarjetas clásicas; Galería =
cuadrícula con la imagen de cada publicación que tenga una (clic
abre el detalle; las publicaciones sin imagen NO aparecen en la
galería, solo en el Feed); Álbum = las publicaciones agrupadas
por `posts.album` (columna aditiva; «Sin álbum» al final). El
compositor muestra el campo «Álbum» SOLO en canales de imagen
(crear y editar), y los endpoints de crear/editar post lo aceptan
solo si el canal es de imagen — en un canal de post se ignora.

**Mapeos honestos (decididos, no improvisados).** Sin entrada
«Paywalls» separada: el acceso pago ES el precio del canal y
«Precios» es su única puerta — la duplicada sería la redundancia
que se caza en QA. Sin «Lock Screen»: su función no está
verificada en nuestras auditorías del original, no se inventa;
queda documentado acá como NO construido y por qué.

**Dos fugas cerradas por la batería de esta fase** (seguir ≠
acceso): el perfil devolvía los canales que el dueño sigue sin
filtrar visibilidad — y esa respuesta viaja en el payload de
todas las páginas vía la tarjeta de nivel del panel móvil —, así
que un canal secreto seguido y revocado filtraba su nombre en
todo el sitio; ahora el perfil filtra por lo que el LECTOR puede
conocer. Y `notifyNewPost` avisaba el título de un post nuevo a
TODOS los seguidores del canal: en canales de visibilidad
privada/secreta ahora solo avisa a seguidores con acceso.

Verificación local por contenido (`scripts/test-fase16f.mjs`,
**78 PASS / 0 FAIL**, contra `wrangler dev` con D1 local): ejes y
migración (sala-privada → visibilidad privada con acceso por
membresía; free/paid → pública), crear canales tipo post e
imagen y editar nombre/precio/visibilidad por el MISMO endpoint
que usan el modal y la consola, visibilidad privada listada con
bloqueo y sin una sola fuga (feed, búsqueda, videos, detalle,
notificaciones, perfil y payload SSR), secreta con 404 y no
listada, gestionar miembros concediendo y quitando acceso real,
seguir/dejar de seguir sin perder acceso, grupos (crear, mover,
eliminar → grupo por defecto intacto, el por defecto no se
elimina), álbum aceptado solo en canal de imagen con galería
derivable (2 con imagen, la nota fuera) y agrupación correcta, la
página del canal SIN región `right-rail` en el HTML servido y el
feed con la suya, y limpieza total hasta la semilla (4 usuarios /
7 posts / 5 canales / 3 grupos). Regresiones: `test-realtime.mjs`
PASS, `test-fase16e` 24/24, `test-fase16d` 49/49, `test-fase17`
45/45 y `test-fase18` 29/29. Build y typecheck en cero.

## Pendiente a propósito (fuera de esta fase)

- Migraciones versionadas con `drizzle-kit` para D1 (hoy: esquema
  aditivo idempotente al primer request, suficiente para este alcance).
- La activación en vivo de Stripe, del proveedor de correo y de los
  dominios: es cargar los secretos/pasos de cuenta de arriba, sin tocar
  código.
- «Lock Screen» del menú de canal del original: función no
  verificada en las auditorías; no construido a propósito (ver
  Fase 16-F, mapeos honestos).
