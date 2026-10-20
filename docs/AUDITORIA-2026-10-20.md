# Auditoría técnica — 20 de octubre de 2026

> Informe sobre el commit original. Estado de correcciones y verificaciones posteriores: [remediación](REMEDIACION-2026-10-20.md).

Repositorio: `juanutuy/comunidad`. Base: `d82f8fc`, rama `main`.

## Resultado

La aplicación compila, pero tiene fallos de autorización, identidad e integridad de datos que impiden considerarla lista para producción con comunidades reales. La prioridad es corregir esos fallos antes de una limpieza general.

Se registran **20 hallazgos**: 1 crítico, 8 altos, 9 medios y 2 bajos. Las prioridades expresan impacto de aplicación, no puntuaciones CVSS.

## Alcance y evidencia

- Revisión de autenticación, resolución de comunidades, autorización REST/WebSocket, pagos, almacenamiento, migraciones, feed, administración de medios y estado del cliente.
- Búsqueda de consumidores de exports y componentes en fuentes `.ts`, `.vue` y `.mjs`, excluyendo dependencias y archivos generados. Ningún componente Vue apareció sin referencias; esto no demuestra que todos sus caminos sean alcanzables.
- `npm run build`: éxito, preset Cloudflare, aproximadamente 21 segundos. Compilar no valida los permisos.
- `npm run typecheck`: salida 0, pero registra `Load plugin failed: vue-router/volar/sfc-route-blocks` y `TypeError: plugin is not a function`.
- `npm audit --omit=dev --json`: 12 entradas afectadas: 11 altas y 1 baja. Varias son propagaciones de la misma cadena, no 12 vulnerabilidades independientes.
- Reproducciones HTTP contra Nuxt/SQLite local, con usuarios, comunidad y registros temporales. Los registros y archivos temporales se eliminaron al finalizar. La base demo local permanece ignorada por Git.
- Prueba del módulo real `realtime/upgrade.mjs` con D1 y Durable Object simulados; valida decisiones del handler, no conexiones reales de Cloudflare.
- Inyección de fallo en el handler real del webhook, transpilado con TypeScript, con base y firma simuladas para aislar el comportamiento posterior a la validación de firma.
- No se hicieron cambios funcionales, despliegues ni pruebas contra producción. No se ejecutaron las baterías históricas de Wrangler. No se midió carga real ni se completó una auditoría visual.

## Hallazgos críticos y altos

### A01 — Crítico: reaplicar permite tomar una cuenta global

**Ubicación:** `server/api/auth/register.post.ts:63–82`.

Si el correo existe y su membresía está `declined`, el registro reemplaza `users.password_hash`, cambia el nombre e incrementa `token_version` sin exigir contraseña anterior, sesión del titular ni verificación del correo. `users` es global: el cambio afecta todas las comunidades de esa persona.

**Reproducción:** cuenta temporal rechazada, registro público habilitado y cooldown cumplido. Solicitar `/api/auth/register` con ese correo y una contraseña nueva devuelve 200. Después, iniciar sesión en el tenant demo con la contraseña nueva devuelve 200. Nunca se presentó la contraseña anterior durante la reaplicación.

**Corrección:** reaplicar debe exigir identidad verificada y modificar solo la solicitud/membresía. Separar recuperación de contraseña y no modificar credenciales globales desde un registro público.

### A02 — Alto: inicio de sesión y requireUser crean membresías sin aprobación

**Ubicación:** `server/api/auth/login.post.ts:24`, `server/utils/community.ts:120–145`, `server/utils/privacy.ts:268`.

`ensureMembership` crea membresía activa por defecto. Se llama al iniciar sesión y desde `requireUser`, sin consultar registro cerrado, aprobación ni invitación. Además, la barrera de comunidad privada comprueba la existencia de usuario, no una membresía activa en el tenant.

**Reproducción:** tenant temporal con `anyone_can_register=0` y `join_approval=1`. `/api/join-info` confirma registro cerrado y aprobación requerida. Una cuenta global sin membresía inicia sesión allí con 200; aparece `{role:'member', status:'active'}`.

**Corrección:** autenticar no debe inscribir. Centralizar entrada explícita y comprobar pertenencia válida en cada lectura/escritura protegida.

### A03 — Alto: WebSocket omite estado y permisos actuales de canales

**Ubicación:** `realtime/upgrade.mjs:68–98`, `realtime/room.mjs:99`.

El upgrade consulta solo `role`: ignora `pending`, `declined` y `suspended`. Para canales `free` concede acceso sin comprobar `visibility`, y tampoco comprueba archivo del canal. En sentido inverso, rechaza suscriptores que REST sí acepta porque no consulta `member_subscriptions`. Los sockets abiertos tampoco tienen un mecanismo de revocación de sesión/acceso al cambiar permisos.

**Reproducción del handler:** miembro suspendido y canal gratuito secreto/archivado llegan al stub del Durable Object. Un miembro con suscripción y sin `channel_access` recibe 403 en canal pago. El 200 del stub es una marca de autorización aceptada, no un handshake real 101.

**Corrección:** compartir resolución de identidad y política de acceso entre REST y upgrades; definir revocación y comprobación de sesiones abiertas.

### A04 — Alto: dominios personalizados conectan al tenant equivocado en tiempo real

**Ubicación:** `realtime/upgrade.mjs:51–59`; contraste con `server/utils/community.ts:62–80`.

REST resuelve `tenant_domains`; WebSocket solo usa primer segmento del host y después primer tenant de la base. Un dominio personalizado puede mostrar una comunidad mientras sus sockets apuntan a otra, si el usuario tiene membresía allí. La autenticación restante sigue existiendo: no implica acceso universal a todas las salas.

**Evidencia:** ejecución instrumentada del handler nunca consulta `tenant_domains` y usa el tenant de fallback cuando no coincide slug.

**Corrección:** un único resolver de tenant para HTTP y WebSocket; rechazar hosts desconocidos según política explícita.

### A05 — Alto: secreto de sesión público usado como fallback de producción

**Ubicación:** `nuxt.config.ts:11`, `server/utils/auth.ts:21`, `realtime/upgrade.mjs:18`.

Sin configuración, se firma con `dev-only-cambiar-en-produccion`, conocido por estar en el repositorio. No existe un corte de arranque para producción. Con esa configuración, es posible construir cookies firmadas para identificadores conocidos. La guía dice que sin secreto no autentica; el código sí tiene fallback. Además, el seed crea cuentas con credenciales conocidas automáticamente, incluso para una base nueva de producción.

**Evidencia:** inspección del camino de firma; login demo local devuelve 200. No se verificó la configuración de secretos de producción.

**Corrección:** abortar producción sin secreto válido y separar seed demo de instalación real. Agregar `secure` a la cookie en HTTPS de producción (`auth.ts:34–35`).

### A06 — Alto: webhook y aprobación manual pierden acceso ante fallo parcial

**Ubicación:** `server/api/stripe/webhook.post.ts:29–52`; `server/api/admin/earnings/[id]/approve.post.ts:25–55`.

El webhook inserta `stripe_events` antes de procesar, marca pago `paid` antes de conceder acceso y no usa operación atómica. Si falla la concesión, Stripe reintenta y el evento se descarta como duplicado. Si llega antes de que exista su fila de pago, también queda marcado sin conceder. La aprobación manual marca `paid` antes del grant; el reintento se rechaza porque ya no está `pending`.

**Reproducción con dependencias simuladas:** la concesión arroja `injected DB grant failure` después de marcar el pago. Segundo intento devuelve `{received:true, duplicate:true}`; pago permanece `paid` y la concesión solo se intentó una vez. La aprobación manual se revisó por inspección. No se inyectó un fallo en Stripe real.

**Corrección:** transacción/batch apropiado para cada backend o estado de procesamiento recuperable; concesión idempotente y reconciliable. Marcar completado solo cuando el acceso esté persistido.

### A07 — Alto: suscripción manual vencida conserva acceso indefinido

**Ubicación:** `server/utils/community.ts:213,228`; `server/utils/privacy.ts:283`; `server/utils/payments.ts:79`.

Los permisos consultan solo `status='active'`, ignorando `current_period_end`. Los pagos manuales calculan vencimiento, pero no hay un proceso que haga efectivo ese vencimiento. El webhook tampoco sincroniza renovaciones o estados de impago de suscripciones; solo contempla borrado.

**Reproducción:** suscripción manual activa con fin `2000-01-01T00:00:00.000Z`. Detalle de canal pago devuelve 200 y `hasAccess:true`.

**Corrección:** resolver entitlement efectivo con fuente, vencimiento e intervalo; admitir pago único sin vencimiento y sincronizar ciclo de Stripe.

### A08 — Alto: adjuntos protegidos tienen URL pública permanente

**Ubicación:** `server/api/files/[...key].get.ts:7–18`, `server/api/uploads.post.ts:65–67`.

La ruta de archivos verifica solo clave y prefijo `library/`. Los adjuntos de posts y archivos de lecciones almacenados en `posts/` se entregan sin comprobar tenant, publicación, acceso o sesión. Quien tenga la URL conserva acceso después de salir o perder la compra. La respuesta permite caché pública durante un año. No se afirma que las claves aleatorias sean enumerables.

**Reproducción:** archivo temporal subido por usuario autenticado se descarga sin cookie con 200 y `cache-control: public, max-age=31536000, immutable`.

**Corrección:** separar archivos públicos de privados; autorizar descargas por recurso propietario y evitar caché pública de contenido protegido.

### A09 — Alto: dependencias de producción con avisos de seguridad

**Ubicación:** `package-lock.json`, `package.json:1`.

`npm audit --omit=dev` reporta 11 entradas altas y 1 baja; cadenas incluyen Nuxt/Nitro, `node-forge` y `braces`. La exposición real depende de qué caminos alcanzan el bundle/runtime. El informe automático propone incluso retroceder Nuxt a 4.1.3; no es una solución aceptable sin analizar compatibilidad y avisos.

**Corrección:** revisar avisos y versiones resueltas, actualizar por grupos, verificar build, tipos y regresiones. Evitar `npm audit fix --force` indiscriminado.

## Hallazgos medios

### A10 — Medio: borrar canal deja datos huérfanos

**Ubicación:** `server/api/admin/channels/[id].delete.ts:13–19`; contraste con `server/utils/moderation.ts:47`.

La cascada propia del canal no usa la función compartida y omite reacciones de comentarios, opciones/votos de encuestas y chat, entre otras referencias. `foreign_keys=ON` no compensa tablas creadas sin claves foráneas.

**Reproducción:** crear canal temporal con post, comentario, reacción, encuesta y chat. DELETE devuelve 200; quedan 1 `comment_reactions`, 1 `poll_options`, 1 `poll_votes` y 1 `chat_messages` asociados a entidades eliminadas. Se limpiaron después de la prueba.

**Corrección:** servicio único de borrado con todas las referencias, atomicidad y estrategia de integridad del esquema.

### A11 — Medio: restricción de escritura incompleta

**Ubicación:** `server/api/uploads.post.ts:51–53`, `server/api/posts/[id].put.ts:17–25`.

Subidas y edición de posts usan `requireUser`, pero no `requireCanWrite`. En edición tampoco se revalida acceso al canal, archivo ni revisión previa. Un miembro restringido puede subir archivos y seguir modificando contenido propio publicado; retirar acceso al canal no corta esta edición.

**Reproducción:** cambiar usuario temporal a `restricted` y subir archivo devuelve 200. La ausencia de barreras en PUT se confirmó por inspección, no por prueba HTTP específica.

**Corrección:** aplicar autorización de escritura y política de edición/moderación compartidas.

### A12 — Medio: biblioteca no reconoce suscripción premium

**Ubicación:** `server/utils/levels.ts:87–92`, `server/api/library.get.ts:33`, `server/api/library/[id]/download.get.ts:30`.

`hasPremiumAccess` solo reconoce compra directa de canal; `hasPaidEntitlement` y `canAccessChannel` también reconocen suscripciones. El mismo comprador tiene resultados diferentes según superficie.

**Evidencia:** usuario con suscripción y sin acceso directo recibe recursos bloqueados sin permiso de descarga; la función no consulta suscripciones en ningún estado.

**Corrección:** una política de entitlement compartida por biblioteca, directorio, canales y WebSocket, incluyendo vencimiento.

### A13 — Medio: migraciones pesadas y errores silenciados en arranque

**Ubicación:** `server/utils/db.ts:357–379,497–517`.

Cada inicialización de adaptador ejecuta todas las migraciones, incluyendo actualizaciones de reacciones, deduplicación y eliminación/recreación del índice único. `catch` ignora cualquier error, no solo columna duplicada. Bajo múltiples isolates puede existir una ventana sin índice o una migración parcialmente aplicada sin diagnóstico. Una promesa de inicialización rechazada queda cacheada sin reintento en ese proceso.

**Corrección:** migraciones versionadas fuera del tráfico normal, errores clasificados y observables, reintentos controlados. La duración y contención en D1 no se midieron.

### A14 — Medio: N+1 y consultas seriales multiplican coste

**Ubicación:** `server/api/feed.get.ts:40–64`, `server/utils/community.ts:282–302`, `server/api/admin/media.get.ts:50`, `server/utils/media.ts:46–61`.

Por post autenticado ordinario, el feed ejecuta consulta del canal y cuatro consultas de metadatos; 50 posts pueden sumar unas 250 consultas adicionales, más controles de acceso y configuración. El gestor hace nueve consultas de ubicación por archivo, secuencialmente: 50 archivos implican 450 consultas adicionales y 100 implican 900. No son mediciones de latencia, son conteos derivados del código.

**Corrección:** cargar canales/accesos por lote, agregar reacciones/comentarios/guardados por conjunto y consultar referencias de archivos por lote. Paralelizar sin reducir consultas no resuelve el coste.

### A15 — Medio: feed limita antes de filtrar visibilidad y otros listados no paginan

**Ubicación:** `server/api/feed.get.ts:22,40–64`, `server/api/channels/[slug].get.ts:47–55`, `server/api/leaderboard.get.ts:23–45`.

El feed selecciona los 50 posts antes de excluir canales secretos o archivados. Si esos ocupan los primeros 50, el usuario recibe feed vacío aunque existan publicaciones visibles más antiguas. No hay cursor para recuperarlas. El detalle de canal carga todos sus posts y el ranking todos los miembros, calculando agregados y ordenando en memoria.

**Reproducción:** agregar 50 posts recientes en un canal secreto temporal sin acceso para el miembro demo. El feed devuelve solo 1 post visible —el fijado—, aunque siguen existiendo 7 posts publicados fuera de ese canal. Se eliminaron los datos temporales.

**Corrección:** mover visibilidad a selección SQL y agregar paginación estable con cursor; limitar/agregar ranking en base de datos.

### A16 — Medio: gestor de medios omite referencias y consulta columna inexistente

**Ubicación:** `server/utils/media.ts:46–61`, `server/api/admin/media/[id].delete.ts:17`.

No busca `channels.cover_url` ni adjuntos de `comments`, agregados en fases posteriores. Puede mostrar archivo en uso como sin ubicación, y el admin borrarlo con información incompleta. **Corrección del informe inicial:** `lessons.tenant_id` sí existe; la afirmación anterior de que esa columna era inexistente fue incorrecta. La remediación resuelve lecciones mediante capítulos/cursos y conserva el aislamiento por tenant.

**Corrección:** buscar lecciones mediante capítulos/cursos y sumar canales/comentarios/contenido de lecciones; mantener referencias explícitas o un índice de uso. No ignorar errores estructurales.

### A17 — Medio: caché de comentarios sobrevive cambio de cuenta

**Ubicación:** `app/composables/usePostComments.ts:30–55`, `app/composables/useAuth.ts:102–106`.

El estado compartido se indexa solo por post. `loaded` impide recarga, mientras logout limpia usuario/estado/compuertas pero no comentarios. En navegación SPA, otra cuenta o visitante puede conservar comentarios previamente autorizados y `myReaction` del usuario anterior. También crece sin política de expulsión.

**Evidencia:** inspección del ciclo de estado y logout; no se reprodujo visualmente en navegador.

**Corrección:** invalidar estado privado al cambiar identidad/tenant, separar caché por contexto y definir límites/expulsión.

### A18 — Medio: comprobación de tipos produce un éxito engañoso

**Ubicación:** `package.json:1`, configuración de tipos generada por Nuxt.

`npm run typecheck` sale con 0 aunque el plugin `vue-router/volar/sfc-route-blocks` no se carga y arroja `TypeError: plugin is not a function`. No equivale a validación limpia; tampoco demuestra que toda la comprobación TypeScript esté desactivada.

**Corrección:** alinear versiones del comprobador Vue y su plugin, y hacer que validación detecte fallos de inicialización. Añadir comprobación automatizada de build/tipos/regresiones; no existe workflow CI en el checkout revisado.

## Limpieza y mantenimiento

### A19 — Bajo: helpers sin consumidores y fuentes de verdad duplicadas

**Ubicación:** `server/utils/community.ts:102,413`, `app/utils/reactions.ts:4`, `server/utils/reactions.ts:11`, `app/utils/embeds.ts:5`, `server/utils/sanitize.ts:96`, `server/db/schema.ts`, `server/utils/db.ts`.

- `canManageCourses` y `postAccess` no tienen consumidores en las fuentes revisadas; candidatos concretos a eliminación. No confundir exports de esquema o convenciones de autoimport con funciones muertas automáticamente.
- Catálogo de emojis duplicado entre cliente y servidor. Normalización de embeds duplicada con validación distinta.
- Drizzle/schema no participa en persistencia ni migraciones ejecutables; solo sirve como referencia. No hay configuración Drizzle en el checkout. Tener el esquema SQL y referencia Drizzle sin generación ni verificación facilita divergencias. `drizzle-kit` no tiene invocaciones en scripts del proyecto.
- `PostComposer.vue` tiene 649 líneas; configuración admin, 763; editor de cursos, 819. El tamaño no es por sí solo un bug: conviene extraer políticas y responsabilidades con contratos estables.

**Corrección:** retirar helpers realmente sin uso; mover constantes y transformaciones puras a módulo compartido; elegir esquema canónico y generación verificable. No hacer una eliminación masiva guiada solo por búsquedas de texto.

### A20 — Bajo: documentación y scripts prometen comportamiento diferente

**Ubicación:** `docs/DESPLIEGUE.md`, `package.json:1`, `scripts/check-db.mjs:1–5`.

- Guía apunta webhook a `/api/billing/webhook`; ruta existente es `/api/stripe/webhook`.
- Guía pide Node 20+, pero `engines` exige `^22.21.0 || ^24.11.0 || >=26.0.0`.
- `npm run db:seed` solo imprime mensajes; no siembra ni comprueba base.
- Guía afirma que sin secreto no autentica, contradiciendo fallback del código.

**Corrección:** sincronizar guía con rutas/configuración y dar nombres veraces a scripts.

## Observaciones pendientes, sin elevar a bugs confirmados

- Los enlaces de un solo uso hacen SELECT y después UPDATE sin condición `used_at=''`: patrón vulnerable a concurrencia. Prueba local con cinco solicitudes produjo `[200,400,400,400,400]`; no se reprodujo consumo doble. Debe comprobarse bajo concurrencia de D1 y resolverse con consumo condicional atómico.
- No aparece limitación de intentos de login en la aplicación. No se conoce si Cloudflare aplica controles externos. Revisar límites por cuenta/IP y límites de cuerpo antes de leer multipart completo.
- La validación de tipos del cuerpo se basa frecuentemente en TypeScript y llamadas como `.trim()`; datos JSON con tipos inesperados pueden terminar en 500. Falta validación runtime común.
- Varias operaciones de cascada son múltiples escrituras sin atomicidad. Se confirmó la cascada incompleta del canal; no se inyectaron fallos en todas las rutas.

## Fortalezas observadas

- SQL mayormente parametrizado y comprobaciones de rol presentes en rutas administrativas inspeccionadas.
- Contraseñas con salt aleatorio y scrypt; cookies httpOnly; versión de sesión para invalidación tras cambio de contraseña.
- Sanitización de HTML en servidor y concesión de pagos separada de vuelta del navegador.
- Capas propias para persistencia y almacenamiento, y algunos servicios compartidos de moderación/pagos.
- Componentes de comentarios/reacciones reutilizados; el problema principal es consistencia de políticas y evolución de esquema, no ausencia total de estructura.

## Orden de remediación

1. A01–A05: identidad, pertenencia, WebSocket y configuración segura.
2. A06–A08 y A10–A12: pagos, expiración, archivos, integridad y permisos de escritura.
3. A13–A18: migraciones, consultas por lote, paginación, referencias y validación fiable.
4. A09: actualizar dependencias en paralelo con comprobaciones de compatibilidad.
5. A19–A20: eliminar código sin consumidores, consolidar módulos y corregir documentación.

La aceptación de las correcciones debe incluir regresiones específicas de cada escenario descrito y pruebas reales de D1/Durable Objects. Esta auditoría local no certifica ausencia de otros fallos.
