# Despliegue y actualización

## Requisitos

Node `^22.21.0`, `^24.11.0` o `>=26`; npm y cuenta Cloudflare con Workers, D1, R2 y Durable Objects. Autenticar `npx wrangler login` o proporcionar token de API por entorno.

Instalar con `npm ci --legacy-peer-deps`; construir requiere dependencias de desarrollo.

## Cloudflare: instalación nueva

1. Crear `npx wrangler d1 create comunidad-db` y `npx wrangler r2 bucket create comunidad-files`.
2. Actualizar identificadores y nombres en `wrangler.jsonc`. Mantener `main: worker-entry.mjs`, assets y binding `REALTIME`.
3. Guardar `npx wrangler secret put NUXT_SESSION_SECRET`: secreto aleatorio de al menos 32 caracteres. No usar valores `dev-only`. Nunca incluirlo en Git.
4. Aplicar esquema explícitamente: `npm run db:migrate -- --remote`. `DB_NAME` permite cambiar el nombre de base.
5. Crear comunidad y administrador. Definir `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12+ caracteres), `COMMUNITY_SLUG` y `COMMUNITY_NAME` mediante entorno seguro y ejecutar `npm run db:bootstrap -- --remote`. El script no imprime credenciales ni crea usuarios demo. Registrar dominio personalizado del tenant cuando corresponda.
6. Ejecutar `npm run typecheck`, `npm test`, `npm run test:integration` y `npm run build`.
7. Desplegar `npx wrangler deploy`.

El dominio predeterminado `*.workers.dev` y localhost usan primera comunidad como fallback. Dominios propios deben existir en `tenant_domains`; un host desconocido devuelve 404. HTTP y WebSocket comparten esta resolución.

## Actualizar una instalación existente

Exportar respaldo antes de migrar:

```bash
npx wrangler d1 export comunidad-db --remote --output respaldo.sql
```

Durante una ventana de mantenimiento sin escrituras concurrentes:

```bash
git pull
npm ci --legacy-peer-deps
npm run db:migrate -- --remote
npm run typecheck
npm test
npm run test:integration
npm run build
npx wrangler deploy
```

La migración reconoce columnas existentes, aplica los cambios pendientes y registra versión de esquema. No elimina comunidades ni reemplaza contraseñas. Una base sin versión actual produce un error explícito en producción; las solicitudes no ejecutan DDL, backfills ni semillas.

Esta versión cambia permisos: login ya no inscribe en comunidades, adjuntos protegidos exigen autorización, suscripciones manuales vencidas dejan de funcionar y dominios desconocidos se rechazan. Verificar dominios y fechas de suscripción antes del despliegue. Si una instalación anterior contenía usuarios demo, desactivarlos explícitamente: la actualización no borra cuentas existentes.

## Pagos y correo

| Variable | Uso |
|---|---|
| `NUXT_STRIPE_SECRET_KEY` | Crear y conciliar sesiones/suscripciones |
| `NUXT_STRIPE_WEBHOOK_SECRET` | Verificar eventos en `/api/stripe/webhook` |
| `NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Identificación pública de Stripe |
| `NUXT_EMAIL_PROVIDER_URL`, `NUXT_EMAIL_PROVIDER_TOKEN`, `NUXT_EMAIL_FROM` | Proveedor HTTP de correo |
| `NUXT_CRON_SECRET` | Endpoint de digest |

Configurar Stripe para `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` y cambios/borrado de suscripción. Un evento recibido antes de su fila local devuelve 503 para que Stripe reintente. Un pago diferido no concede acceso hasta confirmar `payment_status`.

Los pagos manuales requieren activación administrativa. Aprobar crea acceso y marca el pago en el mismo lote atómico. El vencimiento de un plan manual se comprueba al leer permisos, sin depender de cron.

## Desarrollo y pruebas de Worker

```bash
npm run dev
# Worker compilado, con D1/R2 locales:
npm run db:migrate -- --d1
npm run build
npx wrangler dev --port 8787
```

Wrangler necesita secreto local en `.dev.vars`, archivo ignorado por Git. No reutilizar secretos de producción. Inicializar administrador local con las mismas variables anteriores y `npm run db:bootstrap -- --d1`.

`npm run test:worker` prepara su fixture local y comprueba Worker/Durable Objects. No modifica Cloudflare remoto.

## Node/VPS

```bash
npm run db:migrate
# Primera instalación: variables de administrador + npm run db:bootstrap
NITRO_PRESET=node-server npm run build
node .output/server/index.mjs
```

Definir `NUXT_SESSION_SECRET`, `DB_PATH` y `NUXT_UPLOADS_PATH` en entorno. Mantener volúmenes para base y archivos, y proxy HTTPS. El preset admite `NITRO_PRESET`; Durable Objects requieren servicio equivalente o se usa fallback REST/polling. Otras plataformas serverless requieren adaptadores persistentes; no están verificadas.

## Respaldos

D1: exportación SQL indicada arriba. R2: cliente S3 con credenciales de cuenta. Node: copia consistente de SQLite y directorio de archivos. Conservar respaldo anterior hasta verificar la versión nueva.
