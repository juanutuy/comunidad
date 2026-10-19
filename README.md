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
| Archivos | **Cloudflare R2** (binding preparado en `wrangler.jsonc`; la subida real es fase 2) |
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
- **Canales:** grupos (General, Ayuda, Recursos) y canales `free` / `private` / `paid`. Seguir / dejar de seguir. El canal **pago ($22)** muestra solo el *teaser* con candado a quien no tiene acceso; el acceso se concede con el botón **«Acceso demo»**, claramente etiquetado, que registra una fila `channel_access` con `source='demo'`. **No hay checkout falso:** Stripe real es fase 2 y usará la misma tabla con `source='stripe'`.
- **Feed `/feeds`:** publicaciones de canales públicos + seguidos, fijadas primero; compositor funcional (canal, título, cuerpo, adjunto imagen/video) solo para miembros.
- **Publicación `/p/[canal]/[post]`:** detalle, reacciones (love/like/fire/clap, toggle con conteo), comentarios (crear/listar), guardar (bookmark) y fijar (admin).
- **Cursos:** catálogo con búsqueda, detalle con currículum por capítulos/lecciones (lecciones gratis marcadas, el resto con candado si no estás inscrito) e inscripción persistente.
- **Eventos:** lista de próximos/pasados, detalle con anfitrión, asistentes y RSVP funcional («Asistiré», toggle).
- **Biblioteca `/library`:** recursos con filtro por tipo (PDF/Docs/Video/Imagen/Audio/Enlace) y distintivo de bloqueado para miembros premium. Son **metadatos**: los archivos reales vivirán en R2 (fase 2).
- **Ranking `/leaderboard`:** puntos calculados de la actividad real — publicar 10, comentar 3, reacción recibida 2.
- **Perfil `/profile/[slug]`:** portada, bio, y tabs de publicaciones, comentarios y canales que sigue.
- **Videos `/videos`:** agregador de publicaciones con video (YouTube embebido).
- **Reglas `/guidelines`:** salen del campo `guidelines` del tenant.
- **Admin mínimo `/admin/channels`:** el administrador crea canales (nombre, descripción, tipo, precio) desde la UI; fijar publicaciones se hace desde cada post. Las rutas de servidor están protegidas por rol.

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
                          CREATE_SQL, auto-creación de tablas y disparo del seed
  utils/seed.ts           semilla original en español (tenant, 4 usuarios, 5 canales,
                          7 publicaciones, 2 cursos, 2 eventos, 6 recursos)
  utils/auth.ts           scrypt + cookie de sesión firmada
  utils/community.ts      tenant por host, permisos de canal, serialización de posts
  api/                    rutas REST (auth, feed, canales, posts, cursos, eventos,
                          biblioteca, ranking, perfiles, admin)
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

## Fase 2 (pendiente, a propósito)

- **Stripe real** para canales pagos y cursos pagos (webhook que concede `channel_access` / inscripción con `source='stripe'`).
- **Tiempo real** con Durable Objects (chat, presencia, notificaciones en vivo).
- **Subida real de archivos a R2** para la biblioteca y adjuntos de publicaciones.
- **Correos** transaccionales (bienvenida, digest semanal) vía Amazon SES.
- Migraciones versionadas con `drizzle-kit` para D1 y dominios personalizados por tenant (Cloudflare for Platforms).
