# Comunidad

Plataforma de comunidades con canales, publicaciones, comentarios, chat, cursos, eventos, biblioteca, gamificación, moderación y cobros. Nuxt 4, Vue 3 y Nuxt UI; Cloudflare Workers, D1, R2 y Durable Objects en producción. SQLite y almacenamiento local para desarrollo.

## Desarrollo

Node `^22.21.0`, `^24.11.0` o `>=26`.

```bash
npm ci --legacy-peer-deps
npm run dev
```

Solo desarrollo crea esquema y datos demo automáticamente. Cuentas `admin@demo.local`, `member@demo.local`, `lucia@demo.local` y `diego@demo.local`, contraseña `demo1234`. Para desactivar la semilla: `NUXT_DEMO_SEED=false`.

Variables locales opcionales: `DB_PATH` y `NUXT_UPLOADS_PATH`. Sus valores predeterminados son `data/comunidad.db` y `data/uploads/`.

## Comprobaciones

```bash
npm run typecheck
npm test
npm run test:integration
npm run build
npm run test:worker
npm audit --omit=dev
```

`test:integration` crea base y archivos temporales, inicia su propio servidor y limpia sus recursos. Debe ejecutarse sin otro `npm run dev` abierto en el mismo checkout. Las baterías históricas `scripts/test-fase*.mjs` están orientadas a la semilla demo antigua y no sustituyen las regresiones actuales de seguridad.

El comprobador de tipos falla también si no puede cargar un plugin Vue. La suite cubre identidad, membresía, acceso REST/WebSocket, expiración, pagos atómicos, referencias de archivos, cascadas y paginación.

## Producción

Seguir [guía de despliegue](docs/DESPLIEGUE.md). Requiere secreto de sesión aleatorio de al menos 32 caracteres. Sin él, la autenticación falla de forma cerrada. Producción no crea usuarios demo ni ejecuta migraciones dentro de solicitudes.

```bash
npm run db:migrate -- --remote
npm run build
npx wrangler deploy
```

Para instalación nueva, crear administrador explícitamente mediante `npm run db:bootstrap -- --remote`, proporcionando credenciales por variables de entorno. Nunca usar datos demo como instalación de producción.

Webhook de Stripe: `/api/stripe/webhook`. Confirmación de pago, concesión e idempotencia se guardan juntas en una transacción. Suscripciones se evalúan por estado y vencimiento; las renovaciones de Stripe llegan mediante eventos de suscripción.

## Arquitectura

| Ruta | Responsabilidad |
|---|---|
| `app/` | Interfaz, páginas, componentes y estado de sesión |
| `shared/` | Políticas de acceso, sesión y transformaciones puras compartidas |
| `server/api/` | API HTTP, validación y autorización |
| `server/utils/db.ts` | Adaptadores asíncronos y lotes atómicos D1/SQLite |
| `database/schema.ts` | Esquema SQL canónico y cambios pendientes versionados |
| `database/migrate.ts` | Planificador de migraciones explícitas |
| `database/local.ts` | Adaptador SQLite compartido por servidor, scripts y pruebas |
| `realtime/` | Upgrades y Durable Objects con revalidación de permisos |
| `server/utils/fileAccess.ts` | Descarga por permisos del recurso propietario |
| `server/utils/postMetadata.ts` | Agregados de posts por lote |
| `tests/` | Regresiones vigentes |

Los usuarios son globales; sus membresías pertenecen a cada comunidad. Iniciar sesión no crea membresías. Ingresar a otra comunidad exige registro explícito, invitación o alta administrativa; una cuenta existente acredita su contraseña y conserva su identidad global.

Los adjuntos de posts, comentarios y lecciones no son públicos por conocer su URL. Avatares, portadas de perfil y marca usan una política pública separada. Los archivos protegidos responden con `private, no-store`.

El feed y los canales paginan antes de serializar; las reglas de visibilidad se aplican antes del límite. Reacciones, comentarios, guardados y encuestas se consultan por lote. El ranking agrega y ordena en SQL. El gestor de medios resuelve referencias de toda su página en una consulta.

## Dependencias

Nuxt, Vue, UI, editores y herramientas pertenecen a construcción/desarrollo; los artefactos de Cloudflare incluyen su código compilado. `better-sqlite3` es dependencia del modo Node. Para compilar se deben instalar dependencias de desarrollo.

La auditoría de producción se comprueba con `npm audit --omit=dev`. Los defectos upstream de `braces` y `node-forge` están reparados mediante parches locales versionados, aplicados obligatoriamente en instalación y cubiertos por regresiones. El escáner completo sigue reportando versiones upstream porque no inspecciona parches. Ver [remediación](docs/REMEDIACION-2026-10-20.md).

## Documentación

- [Despliegue, actualización y copias](docs/DESPLIEGUE.md).
- [Auditoría original](docs/AUDITORIA-2026-10-20.md).
- [Remediación y validación](docs/REMEDIACION-2026-10-20.md).
- [Cómo se creó](docs/COMO-SE-CREO.md).
- [Referencia histórica de fases](docs/HISTORIAL-IMPLEMENTACION.md).
- [Changelog](CHANGELOG.md).
