# Cómo se creó esta plataforma

Documento de origen y método: qué se encargó, con qué reglas se construyó, qué
decisiones técnicas se tomaron y cómo está organizada por dentro. El historial
de versiones está en [`CHANGELOG.md`](../CHANGELOG.md) y las rutas de
despliegue en [`DESPLIEGUE.md`](DESPLIEGUE.md).

## El encargo

El 18 de octubre de 2026 se encargó una **plataforma de comunidades propia**
con el mismo comportamiento y experiencia de uso del producto EzyCommunity
(canales, feed, cursos, eventos, biblioteca, ranking, canales pagos), para
usarla primero en proyectos propios y poder venderla después como SaaS
white-label sin reescribirla.

Dos reglas rigieron todo el trabajo:

1. **Paridad de comportamiento, código 100 % propio.** Cada sección se
   construyó para verse y funcionar como la referencia, pero sin copiar su
   código, sus textos largos, su marca ni sus recursos: componentes, modelo
   de datos, sanitizador y textos (en español) son originales de este repo.
2. **Lo no verificado no se construye.** Antes de construir cada sección se
   auditó el producto original por dentro, clic por clic, con una cuenta de
   prueba. Lo que no se pudo abrir o comprobar quedó fuera y documentado
   como «no verificado» (ejemplo: la opción *Lock Screen* de los canales),
   en vez de inventarlo.

Y una tercera regla de calidad, aplicada en cada fase: **ningún control
decorativo**. Todo botón o menú que se ve, funciona; lo que depende de
credenciales que aún no existen (pagos con tarjeta, envío de correos) queda
construido pero **en oscuro**: apagado, señalado en la interfaz y jamás
fingiendo operaciones reales.

## Método de paridad

- **Auditoría previa por rondas**: primero el interior de miembro (feed,
  compositor, perfil, chat, cursos) y después la consola de administración
  completa (17 áreas). Cada hallazgo fijó el alcance de una fase.
- **Unificar antes que duplicar**: cuando la referencia o el propio clon
  ofrecían dos puertas al mismo cuarto (dos editores de post, «Paywalls» y
  «Precios», pestañas y submenú para lo mismo), se dejó **una sola** vía y se
  retiró la otra del código.
- **La paridad incluye la experiencia, no solo las funciones**: navegación
  (submenús de consola en columna, no pestañas), arquitectura de
  desplazamiento (marco fijo con regiones de scroll independientes, como el
  original) y niveles de pantalla (escritorio completo → tableta sin riel
  derecho → teléfono con panel deslizable y barra inferior).

## Decisiones de stack

| Decisión | Por qué |
|---|---|
| **Nuxt 4 + TypeScript** (Vue 3) | El dueño del producto lee y hace QA en Vue/Nuxt; la plataforma debía poder mantenerse sin depender de terceros. |
| **@nuxt/ui v4** (plantilla oficial gratuita, MIT) | Sistema de componentes completo sin costo de licencia. |
| **100 % Cloudflare**: Workers, D1, R2, Durable Objects | Costo de arranque casi cero, despliegue en un comando y alcance global. El detalle y las alternativas están en `DESPLIEGUE.md`. |
| **Multi-tenant desde la base** | Cada comunidad es un `tenant` con su marca, dominio, moneda, idioma y ajustes; nacer así evita reescribir al venderla como SaaS. |
| **Auth propia** (scrypt + cookie httpOnly firmada con HMAC) | Sin depender de un proveedor externo de identidad ni de sus costos por usuario. |
| **Editor rico en dos modos** (TipTap) | La referencia usa dos editores: bloques con menú «/» solo en el compositor de publicaciones, y barra clásica en cursos/eventos. Se replicó esa división, con **sanitizador HTML propio de lista permitida** que genera el HTML guardado y su texto plano. |
| **i18n propio y tipado** (es/en) | Catálogo propio donde el compilador exige que inglés y español tengan exactamente las mismas claves (1045 al cierre de la Fase 16-G). Sin librerías nuevas. |
| **Pagos «en oscuro»** | Stripe completo (Checkout + webhook verificado e idempotente) y pagos manuales con aprobación del admin, apagados hasta que existan claves reales. |

## Arquitectura en breve

- **Tenants**: cada request resuelve su comunidad por el host; todos los
  datos cuelgan de `tenant_id`.
- **Datos**: capa asíncrona propia (`server/utils/db.ts`, interfaz
  `prepare().get/all/run`) sobre **D1** en producción y **SQLite local**
  (better-sqlite3) en desarrollo. El esquema se crea solo y las migraciones
  son **aditivas y automáticas** al primer request; si la base está vacía se
  siembra el tenant demo.
- **Archivos**: `server/utils/storage.ts` abstrae **R2** (binding `FILES`)
  en el Worker y disco local en Node.
- **Tiempo real**: un Durable Object (`RealtimeRoom`) con salas `chan:`
  (chat del canal), `dm:` (mensajes directos) y `user:` (notificaciones y
  presencia) por WebSocket. El entry desplegado es `worker-entry.mjs`, que
  envuelve el handler de Nitro para exportar la clase.
- **Permisos**: roles `admin`, `moderator`, `course_manager`, `member`; el
  acceso a canales combina el eje de acceso (`free|private|paid`) con la
  visibilidad (`public|private|secret`) y el paywall con teaser granular por
  tenant.
- **Puntos y niveles**: gamificación administrable por tenant; los puntos se
  recalculan desde las filas reales (publicar, comentar, reacciones
  recibidas en posts y en comentarios, cursos, eventos).

## Proceso de desarrollo

El trabajo se hizo **por fases** (ver `CHANGELOG.md`), cada una con:

1. Alcance fijado por la auditoría o por capturas del dueño comparando
   «ellos / nosotros».
2. Construcción y commits por etapa (servidor → cliente → cierre).
3. **Batería de regresión propia** (`scripts/test-fase*.mjs`) que ejercita la
   API real contra un servidor local, más las baterías de las fases
   anteriores para no romper lo ya entregado.
4. **Verificación en producción por contenido servido** (nunca solo por un
   código 200): se comprueba el HTML/JSON real que recibe un visitante.
5. Cierre en el README del repo con la sección honesta de la fase: qué se
   construyó, qué se decidió distinto y qué quedó fuera y por qué.

## Estructura del repo

| Ruta | Qué es |
|---|---|
| `app/` | Cliente Nuxt: páginas, layouts (miembro, consola, auth), componentes, composables, catálogos `app/i18n/`. |
| `server/api/` | Endpoints de la API por recurso (posts, comentarios, canales, cursos, admin…). |
| `server/utils/` | Núcleo del servidor: datos (`db.ts`), comunidad y permisos, privacidad, pagos, i18n, gamificación, sanitizador. |
| `realtime/` | La clase Durable Object de tiempo real. |
| `worker-entry.mjs` | Entry de producción: envuelve Nitro y exporta el Durable Object. |
| `wrangler.jsonc` | Configuración del Worker (bindings D1/R2/DO). Sin secretos: van con `wrangler secret`. |
| `scripts/` | Baterías de pruebas por fase (`test-fase*.mjs`). |
| `docs/` | Este documento y la guía de despliegue. |

## Qué quedó fuera a propósito

Por decisión del dueño o por la regla de no inventar: el generador de sitios
con IA y los blogs del producto de referencia, su facturación de SaaS, y —
como futuro lejano — marketing por correo masivo (se integra mejor con una
herramienta dedicada), automatizaciones, agente de IA, API pública para
desarrolladores y reuniones de video nativas. La app móvil se cubre con la
PWA instalable.
