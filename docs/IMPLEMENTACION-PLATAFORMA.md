# Implementación de mejoras

## Entregado en esta fase

- Color por comunidad aplicado al tema Nuxt UI en SSR y cliente; contraste claro/oscuro y presets.
- Formato monetario de ingresos separado de precios gratuitos.
- Barra lateral actualizada al cambiar sesión/comunidad; publicaciones según permisos, miembros activos y puntos consistentes con reacciones de comentarios.
- Auto ingreso configurable hasta cien canales, validado dentro de la comunidad.
- Selector visual de iconos para insignias.
- `/admin/readiness`: estado de configuración sin exponer credenciales.
- Base de provisión `/communities/new`: usuario autenticado, propietario, subdominio único/reservado, creación atómica e intentos idempotentes; comunidades nuevas vacías.
- Dominio base configurable. Destino preparado: `hub.servgt.me`; `hub` reservado. El despliegue conserva la URL de Workers.
- Resolución por slug limitada al dominio base, además de dominios registrados explícitamente.

## Antes de habilitar creación pública

La creación permanece desactivada con `NUXT_COMMUNITY_CREATION_ENABLED=false`. La página informa este estado: no crea direcciones que todavía no funcionan.

- DNS/ruta wildcard y certificado de `*.servgt.me`; no sustituir el portal existente en el dominio raíz.
- Verificación del correo de propietarios y registro de propietario separado del registro de miembros.
- Trial y facturación SaaS; límites de recursos y panel de plataforma. El límite actual es una comunidad nueva por cuenta; no representa un plan comercial.
- Validar aislamiento y funcionamiento de extremo a extremo antes de ofrecer autoservicio.
- Reentrada de sesión en nuevo subdominio: las cookies actuales son por host; no se amplía su alcance a todo el dominio. Usar login existente hasta incorporar un intercambio de sesión seguro.

## Pendientes del informe completo

- Roles personalizados con autorización aplicada a todas las APIs.
- Paquetes con selección de recursos y su sincronización de acceso/cobros.
- Campos personalizados de perfil y obligatoriedad.
- Gamificación ampliada: control global, reglas de asistencia real, hitos de perfil y notificaciones.
- Campañas, segmentos, plantillas, supresiones y entregabilidad.
- Webhooks generales con firma, reintentos, registro e idempotencia.
- Automatizaciones, motor de directos y constructor de sitios como módulos independientes.
- Traducción completa de cuerpos de administración existentes.
- Verificación/activación automática de dominios personalizados.

La comparación original sigue siendo un inventario, no una lista de funcionalidades ya implementadas. Esta entrega no completa toda la plataforma descrita allí.

## Activar hub.servgt.me posteriormente

La zona `servgt.me` existe y está activa en Cloudflare. La credencial disponible puede consultar Workers pero no registros DNS ni certificados. No se alteró DNS ni el portal que ya usa `servgt.me` y `portal.servgt.me`.

1. En Cloudflare, abrir **Workers & Pages → comunidad-mvp → Settings → Domains & Routes → Add → Custom domain**.
2. Escribir `hub.servgt.me`. Revisar si Cloudflare avisa de un registro existente; no sustituirlo sin comprobar su uso.
3. Esperar a que DNS y certificado figuren activos.
4. En ServGT, entrar a `/admin/domains` y registrar `hub.servgt.me` en nuestra comunidad.
5. Abrir `https://hub.servgt.me/login`, iniciar sesión y comprobar marca, navegación y acceso. Las sesiones son por host: se pide login de nuevo y se conserva la URL antigua.
6. Añadir al archivo `wrangler.jsonc`, junto a `workers_dev`, para conservar el dominio en despliegues futuros:

```json
"routes": [{ "pattern": "hub.servgt.me", "custom_domain": true, "zone_id": "270dd3a56b0e9ac3335c1b47c314e05c" }]
```

Activar solo `hub` no activa `*.servgt.me`. Para comunidades de terceros se necesita además wildcard DNS/ruta/certificado o provisión controlada de cada hostname. Mantener la creación pública desactivada hasta completar también registro de propietarios, verificación, cuotas y facturación.
