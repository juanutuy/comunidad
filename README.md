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
| Deploy | Cloudflare Workers, preset Nitro `cloudflare_module` |
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
- **Canales:** grupos (General, Ayuda, Recursos) y canales `free` / `private` / `paid`. Seguir / dejar de seguir. El canal **pago ($22)** muestra solo el *teaser* con candado a quien no tiene acceso; el acceso se concede con el botón **«Acceso demo»**, claramente etiquetado, que registra una fila `channel_access` con `source='demo'`. **No hay checkout falso:** Stripe real es fase 3 y usará la misma tabla con `source='stripe'`.
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
  composables/            useAuth (sesión), useApi (reenvía cookie en SSR), useFormat
  pages/                  feeds, channels/[slug], p/[canal]/[post], courses, events,
                          library, leaderboard, profile, videos, guidelines, admin
server/
  db/schema.ts            esquema Drizzle (referencia de tipos; compatible con D1)
  utils/db.ts             capa de datos asíncrona unificada (D1 ⇄ SQLite local),
                          CREATE_SQL, migraciones aditivas idempotentes,
                          auto-creación de tablas y disparo del seed
  utils/seed.ts           semilla original en español (tenant, 4 usuarios, 5 canales,
                          7 publicaciones, 2 cursos con contenido, 2 eventos,
                          6 recursos) + backfill de contenido de lecciones
  utils/auth.ts           scrypt + cookie de sesión firmada
  utils/community.ts      tenant por host, permisos de canal, serialización de posts
  utils/storage.ts        archivos: R2 (binding FILES) o disco local data/uploads/
  utils/notify.ts         creación de notificaciones (reacción, comentario,
                          post nuevo en canal seguido, menciones @slug)
  utils/levels.ts         niveles por puntos, insignias y estadísticas de miembro
  api/                    rutas REST (auth, feed, canales, posts, comentarios,
                          reacciones, cursos + lecciones + certificado, eventos,
                          biblioteca + descarga, subidas, archivos, notificaciones,
                          búsqueda, ranking, perfiles, admin)
wrangler.jsonc            Worker + bindings D1 y R2 (IDs placeholder)
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
generado `scripts/d1-init.sql` (esquema + los 74 INSERT del seed), que se
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

## Deploy en Cloudflare (pasos exactos)

`wrangler.jsonc` ya declara el Worker `comunidad-mvp`, el binding D1 `DB`
(base `comunidad-db`) y el bucket R2 `FILES` (`comunidad-files`); el
`database_id` está como placeholder y hay que reemplazarlo por el real.

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

# 5. Build y deploy
npm run build && npx wrangler deploy
```

Probar el build localmente contra D1 emulado antes de desplegar:

```bash
npm run build
npx wrangler dev .output/server/index.mjs --assets .output/public --port 8787
```

## Fase 2 (hecha)

Notificaciones in-app, subidas reales a R2/disco (imagen de post, avatar
y archivos de biblioteca con descarga protegida), admin completo
(ajustes, miembros, canales CRUD y moderación), cursos con contenido,
progreso y certificado, eventos con vista calendario, búsqueda global y
niveles e insignias. Detalle en «Qué funciona» y en «Migración a la
Fase 2».

## Fase 3 (pendiente, a propósito)

- **Stripe real** para canales pagos y cursos pagos (webhook que concede `channel_access` / inscripción con `source='stripe'`).
- **Tiempo real** con Durable Objects (chat, presencia, notificaciones en vivo).
- **Correos** transaccionales (bienvenida, digest semanal) vía Amazon SES.
- Migraciones versionadas con `drizzle-kit` para D1 y dominios personalizados por tenant (Cloudflare for Platforms).
