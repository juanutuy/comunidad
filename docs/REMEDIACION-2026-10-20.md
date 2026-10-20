# Remediación de la auditoría

Base auditada: `d82f8fc`. Remediación preparada el 20 de octubre de 2026. La publicación se registra en el historial de Git y versiones de Cloudflare.

## Estado por hallazgo

| ID | Estado | Cambio y evidencia |
|---|---|---|
| A01 | Corregido | Reaplicación acredita contraseña existente; no reemplaza hash, nombre ni versión global. Regresión HTTP. |
| A02 | Corregido | Login y `requireUser` no crean membresías. Registro explícito respeta aprobación/invitación. Sesión global sin pertenencia no abre API privada. |
| A03 | Corregido | Política compartida REST/WebSocket; comprueba estado, archivo, acceso y suscripción. DO revalida antes de entregar eventos y al recibir mensajes; cierra socket revocado con 1008. |
| A04 | Corregido | Resolver compartido de dominios personalizados y slug; hosts desconocidos no caen en primera comunidad. |
| A05 | Corregido | Secreto obligatorio fuera de desarrollo; payload validado, cookies `secure` en HTTPS. Semilla demo limitada al desarrollo; bootstrap explícito. |
| A06 | Corregido | Concesión, pago y recepción de webhook en lote atómico. Fallos o eventos antes de su fila devuelven error recuperable. Pruebas de rollback SQLite y D1 real local. |
| A07 | Corregido | Estado y vencimiento efectivo en permiso compartido. Fecha vacía solo representa permanencia en plan de pago único. Eventos de suscripción sincronizan período/estado y preservan cancelaciones frente a eventos antiguos. |
| A08 | Corregido | Descarga de adjuntos vinculada a autorización de post, comentario, canal o lección. Archivos privados con `private, no-store`; identidad gráfica pública separada. |
| A09 | Corregido con parches locales | Parches versionados para braces y node-forge, aplicados al instalar con fallo obligatorio si no aplican. Regresiones reproducen ambos defectos. El escáner por versión sigue mostrando avisos upstream; detalle debajo. |
| A10 | Corregido | Cascada compartida y transaccional; limpia reacciones de comentarios, encuestas, chat, guardados, ocultos, reportes y notificaciones pertinentes. |
| A11 | Corregido | Subidas y edición/publicación exigen permiso de escritura; revalidan canal, archivo, acceso y revisión. |
| A12 | Corregido | Biblioteca usa el mismo entitlement vigente que canales/directorio. |
| A13 | Corregido | Esquema canónico y migraciones versionadas explícitas. Producción solo comprueba versión. Errores no se silencian como columnas duplicadas; inicialización fallida se puede reintentar. |
| A14 | Corregido en superficies auditadas | Metadatos de 50 posts: hasta 5 consultas incluidas comprobación de esquema y datos propios. Referencias de 50 archivos: 1 consulta. Presupuesto comprobado por pruebas. Currículum carga capítulos/lecciones por lote. |
| A15 | Corregido | Feed filtra visibilidad antes de límite. Feed, canal y ranking tienen paginación validada con offset y orden determinista; interfaz incluye controles. Ranking agrega y ordena en SQL. |
| A16 | Corregido | Ubicaciones incluyen canales, comentarios, adjuntos y HTML de lecciones, con aislamiento por tenant. El informe inicial se corrigió: `lessons.tenant_id` sí existía. |
| A17 | Corregido | Logout/cambio de identidad limpia caché privada; carga tardía no restaura datos anteriores. Máximo 100 conversaciones en caché. Sockets de cliente se cierran al cambiar identidad. |
| A18 | Corregido | `vue-tsc` 3 y router alineado con Nuxt; errores reales de plantilla corregidos con componentes de edición pequeños. Wrapper convierte fallo de plugin en salida distinta de cero. CI agrega tipos, pruebas y build. |
| A19 | Corregido | Eliminados helpers sin consumidores, script ficticio de seed, esquema Drizzle duplicado y snapshots demo obsoletos. Catálogo y normalizador de embeds compartidos; adaptador SQLite único. |
| A20 | Corregido | README actual, documentación histórica separada y guía con ruta real de webhook, versiones de Node, migraciones y bootstrap seguros. |

## Verificación

- Revisión de cierre: la validación de origen cubre POST, PUT, PATCH y DELETE. La regresión HTTP comprueba que un DELETE desde otro origen devuelve 403 y conserva el canal.
- `npm run typecheck`: comprobación Vue/TypeScript sin errores de plugin ni de código.
- `npm test`: pruebas de políticas, migraciones, rollback, planes, caché de cliente y presupuesto de consultas.
- `npm run test:integration`: servidor Nuxt real con SQLite y almacenamiento temporales; escenarios de identidad, permisos, archivos, pagos, cascadas, concurrencia y límites de intentos.
- `npm run build`: artefacto Cloudflare compilado.
- `npm run test:worker`: Worker compilado con D1, R2 y Durable Objects en Wrangler local aislado; autenticación, permisos de socket, revocación y rollback D1.
- `npm audit --omit=dev`: sin vulnerabilidades reportadas en dependencias de producción.
- `git diff --check`: sin errores de espacios.

Las suites usan fixtures temporales y terminan sus procesos. No requieren cuentas de Stripe ni Cloudflare remoto. Los pagos con tarjeta y renovaciones contra Stripe real deben comprobarse en un entorno de staging con las claves y eventos reales de la cuenta.

## Dependencias reparadas mediante parches locales

Los avisos [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) y [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) no tienen release upstream corregido. Esta versión aplica parches explícitos y revisables con `patch-package`:

- `patches/braces+3.0.3.patch`: límite de profundidad en parser y recorridos compile/expand/stringify, incluidos AST proporcionados directamente. Rechazo controlado antes de agotar pila; patrones normales siguen funcionando.
- `patches/node-forge+1.4.0.patch`: valida cantidad de elementos del AlgorithmIdentifier anidado. Prueba con envoltorio RSA válido confirma que el DigestInfo normal verifica y el que añade elementos se rechaza.

`postinstall` aplica parches con `--error-on-fail` antes de preparar Nuxt. Las pruebas fallan si se reinstala una versión vulnerable sin parche. No se cambian números de versión ni se silencian avisos: `npm audit` identifica paquetes por versión, por lo que mantiene las entradas upstream aunque los archivos instalados estén corregidos. `npm audit --omit=dev` queda sin avisos. Las herramientas no se incluyen como módulos ejecutables en el artefacto Cloudflare.

Reemplazar los parches por releases oficiales cuando existan exige revisión y pruebas, como cualquier futura actualización; no queda un defecto conocido sin mitigación dentro de este alcance.

## Cambios operativos antes de desplegar

1. Respaldar base y archivos; aplicar migración en ventana sin escrituras concurrentes.
2. Configurar secreto de sesión aleatorio de 32+ caracteres; no existe fallback en producción.
3. Ejecutar `npm run db:migrate -- --remote` antes del nuevo Worker. Instalar administrador nuevo solo mediante bootstrap explícito.
4. Registrar dominios propios. Hosts desconocidos ahora responden 404.
5. Revisar suscripciones antiguas con fecha vacía: solo pago único conserva permanencia; planes recurrentes necesitan período confirmado.
6. Configurar webhook `/api/stripe/webhook` y sus eventos de suscripción/pagos diferidos.
7. Desactivar cuentas demo antiguas si la instalación previa las creó. La actualización no borra usuarios existentes.

## Límites

La remediación cubre los hallazgos y regresiones descritos; no certifica ausencia absoluta de bugs. Se verificó Cloudflare en emulación local, no un despliegue remoto. La paginación usa offset: nuevas publicaciones entre solicitudes pueden desplazar posiciones. No se realizó prueba de carga de producción ni revisión visual exhaustiva de todas las pantallas.

## Referencias técnicas consultadas

- [D1 batch y rollback](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).
- [Stripe: cumplimiento de Checkout](https://docs.stripe.com/checkout/fulfillment).
- [Stripe: eventos de suscripciones](https://docs.stripe.com/billing/subscriptions/webhooks).
