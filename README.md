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

## Pendiente a propósito (fuera de esta fase)

- Migraciones versionadas con `drizzle-kit` para D1 (hoy: esquema
  aditivo idempotente al primer request, suficiente para este alcance).
- La activación en vivo de Stripe, del proveedor de correo y de los
  dominios: es cargar los secretos/pasos de cuenta de arriba, sin tocar
  código.
