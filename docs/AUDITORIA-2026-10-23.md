# Auditoría de la base dee99fe — 23 de octubre de 2026

Estado histórico: los hallazgos siguientes corresponden a `dee99fe`, antes de las correcciones. Véase [remediación](REMEDIACION-2026-10-23.md) para el estado posterior y las nuevas regresiones.

Base: `dee99fe`. Revisión de código y pruebas locales con SQLite temporal; emulación de Cloudflare con D1/R2/Durable Objects. No se ejecutaron ataques, borrados ni cobros en producción. Este documento describe problemas abiertos, no una remediación.

## Resultado

Se identificaron siete hallazgos: dos críticos, tres altos y dos medios. Cinco pruebas HTTP específicas reprodujeron seis hallazgos (una prueba comprueba dos defectos de anonimización). El digest se revisó estáticamente; no se enviaron correos reales.

Las pruebas existentes pasan y no cubren estos abusos. Una compilación correcta no acredita aislamiento ni seguridad funcional.

## Hallazgos

### N01 — Crítico: un administrador de comunidad puede obtener una sesión global de otro usuario

Evidencia: `server/api/admin/members/[id]/access-link.post.ts:19-36`, `server/api/auth/access.post.ts:28`, `server/utils/auth.ts:35`, `server/api/admin/members/create.post.ts:31-37`.

El administrador recibe la URL de acceso de un miembro. Consumir ese token emite una sesión global sin límite de comunidad. En la prueba, el miembro del tenant A también era administrador de B: un administrador de A generó el enlace, lo consumió y utilizó esa cookie contra `/api/admin/stats` de B, con HTTP 200. No se necesitó su contraseña ni acceso al correo. Además, el alta administrativa permite agregar una identidad existente conociendo su correo, ampliando la superficie de este abuso.

Corrección: recuperación de identidad controlada por la plataforma, con entrega del secreto exclusivamente al propietario; no devolver credenciales al administrador del tenant. Si se necesita impersonación de soporte, emitir una sesión explícita, auditada, limitada a un tenant y sin acceso a credenciales globales. Revisar también enlaces ya emitidos.

### N02 — Crítico: eliminación global de cuentas sin autoridad sobre el objetivo

Evidencia: `server/api/admin/members/[id]/delete-account.post.ts:20-32,72-76`.

La comprobación valida al administrador en su propia comunidad, pero selecciona al objetivo desde `users` global y no exige pertenencia al tenant actual. La operación borra membresías, cambia credenciales y puede cancelar suscripciones en todas las comunidades. La protección del último administrador solo detiene algunos objetivos; no corrige la falta de autorización.

Reproducción HTTP: administrador de A elimina mediante `content=anonymize` una cuenta que solo pertenece a B; respuesta 200, nombre anonimizado y membresía de B eliminada.

Corrección: limitar gestión comunitaria a membresías y contenido de ese tenant. Reservar eliminación global al propio titular o a un rol de plataforma con autorización y auditoría explícitas. Comprobar pertenencia es necesario, pero no basta para autorizar el borrado en otras comunidades.

### N03 — Alto: acceso a canales sin pago mediante endpoint demo

Evidencia: `server/api/channels/[slug]/access.post.ts:7-14`.

Cualquier miembro válido puede concederse `channel_access` enviando POST a esta ruta. No valida pago, invitación, compra, rol administrativo ni modo de desarrollo. La ruta se incluye en el servidor de producción.

Reproducción HTTP: el miembro no tiene acceso al canal pago; POST a `/api/channels/<slug>/access` devuelve 200 con `source=demo`; consultar el canal devuelve `hasAccess=true`.

Corrección: retirar esta concesión de la API pública. Solo los pagos verificados y las concesiones administrativas autorizadas deben crear el permiso. Revisar permisos históricos `source=demo` antes de revocarlos, para distinguir datos demo de accesos legítimos.

### N04 — Alto: “anonimizar y conservar” destruye el contenido

Evidencia: `server/api/admin/members/[id]/delete-account.post.ts:66-67`.

Los UPDATE que vacían publicaciones y sustituyen comentarios se ejecutan para ambas políticas. La opción `anonymize` conserva las filas, pero borra su contenido y referencias a adjuntos; luego la limpieza puede borrar los archivos sin referencias. Esto incumple el comportamiento solicitado de conservar publicaciones y comentarios bajo identidad anónima.

Reproducción HTTP: una publicación con texto y HTML queda con `body=''` después de solicitar `content=anonymize`.

Corrección: separar conservación con autor anónimo de eliminación de contenido y adjuntos. Revisar copia de respaldo antes de intentar recuperar contenido ya eliminado.

### N05 — Medio: perfil consultable desde una comunidad a la que el objetivo no pertenece

Evidencia: `server/api/profiles/[slug].get.ts:20-25`.

Se busca al usuario por slug global, sin comprobar su membresía en el tenant consultado. La compuerta de privacidad valida al visitante, pero no la pertenencia del perfil objetivo.

Reproducción HTTP: un perfil que solo existe en B se solicita desde A y devuelve HTTP 200, incluido su sitio web. La prueba utiliza un administrador de A, sin privilegios en B. No se reprodujo filtración del cuerpo de publicaciones privadas: estas tienen comprobaciones adicionales.

Corrección: comprobar pertenencia y política de visibilidad del perfil en el tenant actual; si se desean perfiles globales, definir esa función como superficie independiente y explícita.

### N06 — Medio: la anonimización deja datos identificativos en el perfil

Evidencia: `server/api/admin/members/[id]/delete-account.post.ts:76`, `server/api/profiles/[slug].get.ts:101`.

La actualización limpia nombre, correo, biografía y fotos, pero omite `users.website`. La prueba confirmó que el sitio identificativo sigue almacenado después de eliminar la cuenta; el serializador del perfil incluye ese campo.

Corrección: definir el inventario de datos personales y limpiar `website` y cualquier otro dato identificativo conservado fuera de registros operativos con retención explícita. La omisión comprobada es `website`; no se afirma aquí que todos los registros financieros puedan borrarse.

### N07 — Alto: el resumen de correo no aplica los permisos de los destinatarios

Evidencia: `server/api/cron/digest.post.ts:36-58`.

El digest arma una única lista de títulos y nombres de canales de todas las publicaciones recientes publicadas. No filtra visibilidad secreta, archivo ni acceso por destinatario. La lista de destinatarios tampoco filtra estado: incluye pendientes, rechazados, suspendidos y baneados que tengan membresía.

Impacto condicionado: si se activa el cron y existe proveedor de correo, un destinatario sin acceso puede recibir metadatos de canales y publicaciones restringidos. El defecto está confirmado por lectura del código; no se activó el cron ni se enviaron mensajes reales en esta auditoría.

Corrección: seleccionar solo destinatarios permitidos y generar el contenido según sus permisos vigentes. Los títulos y nombres de canales secretos también son datos protegidos.

## Verificación y alcance

- `npm test`: 11/11 pruebas existentes correctas.
- `npm run test:integration`: 13/13 pruebas HTTP existentes correctas con base y archivos temporales.
- Versión inicial de `TEST_PORT=3107 npx tsx scripts/audit-2026-10-23.ts` (antes de su conversión a regresiones): 5/5 comprobaciones reprodujeron los comportamientos inseguros descritos; “ok” significa que se confirmó el defecto, no que el sistema sea seguro. No utiliza la base productiva.
- `npm run typecheck`: correcto.
- `npm run build`: correcto, artefacto Cloudflare generado.
- `npm audit --omit=dev`: cero avisos de dependencias de producción al ejecutar la auditoría. No equivale a revisar todas las dependencias de construcción ni elimina los defectos de lógica documentados.
- `npm run test:worker`: 5/5 pruebas correctas con Worker, D1, R2 y Durable Objects en emulación local; incluye revocación de sockets y rollback de pagos.

Se revisaron identidad/sesión, roles, aislamiento por tenant, ciclo de miembros, acceso a canales, flujo de invitados y login compartido, autorización de archivos/subidas, validación de solicitudes, webhook/pagos, digest y políticas de tiempo real. Se usaron las suites existentes para cascadas, rollback, consultas acotadas y revocación. No se revisó exhaustivamente cada pantalla, cada endpoint ni cada combinación de configuración.

No se probaron Stripe, correo ni cobros reales; no se hizo prueba de carga, pentest externo, revisión de infraestructura/DNS/secrets ni comprobación visual de todos los dispositivos. No se verificó si hubo explotación histórica. Para analizar incidentes hacen falta registros y datos productivos con alcance de solo lectura definido.

## Prioridad de remediación

1. Cerrar N01 y N02; son cruces de la frontera entre administración comunitaria e identidad global.
2. Cerrar N03 y N04 antes de usar concesiones de acceso o eliminación de cuentas con datos reales.
3. Resolver N05–N07 y añadir regresiones negativas: las rutas deben rechazar estos casos, no solo comprobar sus caminos normales.
4. Repetir las pruebas de aislamiento y ciclo de usuarios después de los cambios y verificar configuración operativa en staging.

La fase de auditoría no modificó la aplicación ni desplegó cambios. La revisión anterior no cubrió estos defectos con sus regresiones; el estado actual no debe describirse como completamente auditado o libre de fallos.
