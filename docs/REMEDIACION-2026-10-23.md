# Remediación de seguridad — 23 de octubre de 2026

Referencia: auditoría sobre `dee99fe`, en `AUDITORIA-2026-10-23.md`.

## Correcciones

| Hallazgo | Corrección | Evidencia |
|---|---|---|
| N01 — Suplantación mediante enlaces | El secreto se entrega exclusivamente al correo del titular; la API administrativa no devuelve URL/token. Sin proveedor se rechaza; si falla el envío se revoca el token. Los tokens legados dejan de admitirse. | Regresión HTTP con relay local: respuesta sin secreto, entrega al destinatario, consumo único, token antiguo rechazado, envío fallido sin token utilizable. |
| N02 — Eliminación global desde un tenant | Se exige membresía del objetivo en el tenant. La eliminación afecta solo a esa comunidad: membresía, suscripciones locales, mensajes privados y referencias de identidad. La cuenta de acceso global permanece bajo control del titular. La consola describe este alcance. | Regresión con dos comunidades y prueba Worker/D1. Objetivo ajeno rechazado; datos y membresías de la otra comunidad intactos. |
| N03 — Concesión demo | Endpoint retirado funcionalmente: HTTP 410 en todos los entornos. Migración elimina permisos históricos `source=demo`. | Regresión HTTP: no se crea permiso y canal pago sigue bloqueado. Migración conserva permisos Stripe. |
| N04 — Pérdida de contenido al anonimizar | Autoría local reasignada a una identidad anónima sin credencial usable ni membresía. Se conservan texto, HTML y adjuntos. La política de borrado usa cascadas dentro del mismo lote transaccional. | Regresión conserva publicaciones, comentarios y archivo; política de borrado elimina archivo sin referencias; fallo inyectado conserva contenido y membresía. |
| N05 — Perfiles entre comunidades | Perfil requiere membresía activa o restringida del objetivo en el tenant consultado. | Regresión: 404 desde tenant ajeno, 200 desde comunidad propia. |
| N06 — Sitio web identificativo | La autoría anónima local tiene perfil vacío, incluido `website`, y no tiene perfil público navegable. La identidad global original no se modifica por orden de un administrador comunitario. | Regresión verifica identidad anónima sin sitio/biografía y preservación del perfil global del propietario. |
| N07 — Metadatos privados por digest | Solo se envía a membresías activas/restringidas. Publicaciones y conteos se seleccionan por permisos del destinatario antes del límite; se excluyen canales archivados. | Relay local: destinatario baneado no recibe correo; miembro sin permiso no recibe título/nombre de canal secreto; administrador autorizado sí lo recibe. |

## Migración y operación

Nueva versión: `security-audit-2026-10-23-v1`. Una marca persistente evita repetir la revocación:

- Incrementa `users.token_version`: todas las sesiones anteriores dejan de valer, incluidas las que pudieron obtenerse por enlaces administrativos.
- Elimina enlaces de acceso existentes.
- Elimina únicamente concesiones de canal marcadas `demo`, conservando las de pago y otras fuentes.
- No cambia contraseñas ni crea administradores ni usuarios demo.

Antes de migrar se exportó D1 a una copia local con permisos 0600, fuera del repositorio. La revocación exige iniciar sesión de nuevo. Los enlaces de recuperación requieren un proveedor de correo operativo; ya no se ofrecen enlaces copiables a administradores.

La acción de consola es “Eliminar de la comunidad”, con conservación anónima o borrado de contenido local. No es una eliminación de la identidad global del titular. El sitio web global se conserva deliberadamente para sus otras comunidades; nunca se copia a la identidad anónima. El borrado global de identidad requeriría un flujo separado autorizado por su titular o por administración de plataforma.

No se puede reconstruir automáticamente texto o archivos que la implementación anterior ya borró. Recuperarlos requiere un respaldo anterior y revisión de los registros concretos.

## Verificación

- `npm run typecheck`: correcto.
- `npm test`: 12 pruebas correctas, incluida migración de revocación y ejecución única.
- `npm run test:integration`: 13 regresiones HTTP correctas.
- `npm run test:audit`: 7 regresiones correctas para los siete hallazgos; SQLite y almacenamiento temporales, relay de correo local sin envíos reales.
- `npm run build`: correcto, Worker compilado.
- `npm run test:worker`: 6 pruebas correctas, incluida la ejecución de anonimización local de identidad en un lote D1.
- CI incluye las nuevas regresiones de auditoría.

La auditoría original describe el estado anterior. `scripts/audit-2026-10-23.ts` se convirtió en una suite negativa: ahora un resultado correcto significa que el abuso queda rechazado o que la operación autorizada conserva los límites esperados. No apunta a producción.

Stripe y correo externos no se ejercitan con cobros/envíos reales. Las cancelaciones de suscripción externa ocurren antes del lote local y no pueden formar parte de la transacción SQL; si el proveedor falla, la eliminación se detiene para poder reintentar. La limpieza física de archivos es posterior al lote: un fallo conserva la fila para poder reintentarlo.
