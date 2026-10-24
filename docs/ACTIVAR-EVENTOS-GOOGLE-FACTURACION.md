# Activación de eventos, Google y facturación

Implementación incluida en Cloudflare el 24 de octubre de 2026, versión Worker `0774a26c-a971-40f2-9365-a37890ad7b6a`. La compilación de producción terminó y la migración D1 remota se aplicó. No se ejecutaron pruebas automatizadas ni navegación manual. La infraestructura externa descrita abajo sigue requiriendo configuración.

## Base de datos y despliegue

La versión de esquema de esta fase fue `event-oauth-billing-v1`; posteriormente el esquema avanzó a `community-banner-pinned-v1`. Las migraciones remotas se aplicaron antes de cada despliegue. Incluyen identidades/flujos OAuth, registro de recordatorios, series, estado de renovación y la portada del tenant. No necesitan usuarios ni contenido seed.

No desplegar solamente los archivos de interfaz: estos cambios requieren servidor y esquema compatibles.

## Eventos

Al crear un evento, el administrador puede elegir una fecha o una serie diaria, semanal o mensual de hasta 52 fechas. Se conserva la hora local en la zona del navegador del administrador; se rechazan fechas inexistentes por cambio de hora. Los meses cortos usan su último día válido. Cada fecha tiene su propio enlace y reservas. Editar/eliminar afecta solo la fecha seleccionada; no modifica toda la serie.

El editor de fechas existente ahora muestra las fechas UTC guardadas en hora local, evitando reinterpretarlas como otra hora al editar.

## Recordatorios

- Endpoint: `POST /api/cron/event-reminders`.
- Autorización: `x-cron-secret`, usando el secreto `NUXT_CRON_SECRET`.
- Configurar `NUXT_REMINDER_ORIGIN=https://hub.servgt.me` como variable del Worker.
- Agregar un Cron Trigger cada 15 minutos desde Cloudflare o usar un programador externo. El código del Worker incluye el handler, pero no se creó ningún trigger en esta entrega.
- Ventanas: durante las 24 horas previas y durante la última hora. No se envían avisos de eventos ya iniciados.
- Solo reservas vigentes y miembros activos/restringidos. Preferencias separadas para avisos en app y correo en Ajustes → Notificaciones.
- Lotes de hasta 50 destinatarios por ventana y canal, bloqueo temporal y máximo tres intentos.
- Los avisos en app se insertan junto con su marcador de entrega en una transacción. El correo envía `Idempotency-Key`; el relay debe respetar ese header para deduplicar también si se corta la conexión después de aceptar el envío.
- El correo requiere un proveedor real y dominio registrado de la comunidad. No se presenta como enviado si falta el proveedor o este falla.

## Google

Configurar un cliente OAuth de aplicación web en Google y registrar esta URL exacta:

`https://hub.servgt.me/api/auth/google/callback`

Configurar mediante variables/secretos del servidor, sin poner credenciales en el repositorio:

- `NUXT_GOOGLE_CLIENT_ID`
- `NUXT_GOOGLE_CLIENT_SECRET` (secreto)
- `NUXT_GOOGLE_OAUTH_ORIGIN=https://hub.servgt.me`

El botón aparece solo en ese origen cuando hay configuración. Alcance: entrar con una identidad previamente vinculada. El miembro se registra por el flujo actual y vincula Google desde Ajustes → Seguridad confirmando su contraseña. No se crean ni fusionan usuarios por coincidencia de correo. La identidad se limita a la comunidad; vincular/desvincular exige contraseña y no elimina el acceso con contraseña.

Los flujos usan estado de un solo uso, cookie HttpOnly, PKCE y vencimiento de diez minutos. No se guardan tokens de acceso de Google. El soporte de otros proveedores y el alta automática con Google no forman parte de este cambio.

## Facturación del miembro

Ruta: `/billing`, enlazada desde Precios y Ajustes → Seguridad.

- Historial de los últimos 30 pagos, con moneda de cada operación.
- Suscripciones, estado, fin de período y renovación.
- Cancelación al fin del período o reactivación de renovación mediante confirmación. El servidor exige propiedad de la suscripción local y metadata de Stripe coincidente con usuario y comunidad.
- El acceso continúa dependiendo de los eventos firmados de Stripe y del período confirmado; el botón no concede permisos ni realiza reembolsos.
- El portal requiere `NUXT_BILLING_PORTAL_CONFIGURATION` y las credenciales Stripe existentes. Crear una configuración del portal que permita facturas/métodos de pago y desactive cambios de plan entre productos ajenos a esta comunidad.
- No se abre el portal si el mismo cliente Stripe aparece vinculado a otra comunidad o usuario. Stripe presenta información a nivel cliente; cada comunidad debe usar clientes separados.
- Los pagos manuales conservan su vencimiento; no se presentan como renovaciones automáticas de Stripe.

Esto gestiona compras de miembros. No implementa facturación SaaS de propietarios, cuotas de plataforma ni planes comerciales para crear comunidades.
