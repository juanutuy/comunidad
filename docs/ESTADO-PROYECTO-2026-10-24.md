# Estado de implementación — 24 de octubre de 2026

## Despliegue actual

El Worker `comunidad-mvp` quedó publicado el 24 de octubre de 2026 en la versión `3cf2c037-856c-420c-9d9e-5d3428251d99`. Incluye los cambios de código hasta `23877f8` y la migración D1 aplicada (`event-oauth-billing-v1`). El destino workers.dev es `https://comunidad-mvp.j94390833.workers.dev`; el dominio de comunidad configurado es `hub.servgt.me`.

Se compiló para producción antes de desplegar. Por instrucción del usuario no se corrieron suites de pruebas ni se hizo navegación visual. El despliegue confirma que Cloudflare aceptó y publicó el Worker, no que cada flujo se haya validado de extremo a extremo.

## Cambios incluidos

- Marca ServGT y nombres localizados por idioma, navegación multilingüe, enlaces legales y canales públicos accesibles según su visibilidad.
- Moderación y gestión de miembros: desactivar, restringir, eliminar membresía o eliminar/anomizar contenido según la acción elegida. Se conserva el contenido cuando se elimina una membresía con anonimización.
- Panel `/admin` protegido antes de renderizar; visitantes se redirigen a `/login`.
- Acceso invitado a canales y publicaciones públicas; acciones que requieren cuenta muestran el modal de acceso.
- Enlaces de publicaciones, vista individual y comentarios; perfiles y comentarios muestran acceso al invitado.
- Navegación de canales con un mismo fondo activo/hover a lo ancho de la fila, con las acciones de tres puntos superpuestas en el extremo.
- Eventos recurrentes, recordatorios, vinculación de Google y centro de facturación de miembros, con detalles en [Activación de eventos, Google y facturación](ACTIVAR-EVENTOS-GOOGLE-FACTURACION.md).
- Remediación de seguridad documentada en [Remediación de seguridad](REMEDIACION-2026-10-23.md).

## Pendiente de configuración operativa

- **Recordatorios:** definir `NUXT_CRON_SECRET` y `NUXT_REMINDER_ORIGIN`, y crear un Cron Trigger de 15 minutos. Sin el trigger no se procesan recordatorios de forma programada.
- **Correo de recordatorios:** configurar proveedor, token y remitente válidos; comprobar que el proveedor respeta `Idempotency-Key`.
- **Google OAuth:** registrar el callback y cargar `NUXT_GOOGLE_CLIENT_ID`, `NUXT_GOOGLE_CLIENT_SECRET` y `NUXT_GOOGLE_OAUTH_ORIGIN`.
- **Portal Stripe:** cargar `NUXT_BILLING_PORTAL_CONFIGURATION` y revisar la configuración del portal Stripe.
- **Subdominios y creación autoservicio:** la creación pública de comunidades sigue apagada (`NUXT_COMMUNITY_CREATION_ENABLED=false`). El dominio base está preparado como `servgt.me`, pero el flujo completo de alta de propietarios, reserva/validación de subdominio, planes SaaS, trials, cuotas y facturación de propietarios no está implementado/activado.
- **Dominios propios:** la activación DNS y certificados para subdominios/dominos de clientes aún requiere la configuración de Cloudflare descrita en la comparativa.

## Pendientes de producto identificados en la comparación

La comparación estática con EzyCommunity se encuentra en [Comparativa EzyCommunity / ServGT](COMPARATIVA-EZY-SERVGT-2026-10-23.md). Entre las diferencias pendientes anotadas allí están:

- constructor de perfiles con campos personalizados y reglas de perfil completo;
- biblioteca de insignias, presets y controles visuales adicionales de gamificación;
- agrupación flexible de paywalls/recursos y matriz de roles/permisos editables;
- suite de webhooks para otros eventos, destinos, historial y reenvíos;
- onboarding centralizado de dominios y SEO;
- completar la comparación de vistas de EzyCommunity que no cargaron o estaban restringidas.

Estos puntos son hallazgos de producto, no errores de seguridad confirmados. No se agregan al alcance automáticamente.

## Registro de correcciones y límites

El detalle cronológico vive en [CHANGELOG](../CHANGELOG.md) y en [Historial de implementación](HISTORIAL-IMPLEMENTACION.md). La auditoría de seguridad del 23 de octubre corresponde a una base anterior; consultar su informe junto a la remediación. No debe interpretarse como certificación de que la aplicación está libre de defectos.
