# Comparación rápida EzyCommunity / ServGT

Fecha: 23 de octubre de 2026.

## Alcance y límites

Revisión de las páginas principales del panel EzyCommunity de la cuenta trial y del panel ServGT en producción, más lectura del código local. No se guardaron cambios en los paneles, enviaron campañas, contrataron planes ni crearon comunidades. Esto compara funciones y organización; no certifica seguridad ni funcionamiento completo de cada flujo.

Se recorrieron las 18 entradas principales habilitadas del menú EzyCommunity y las 14 secciones de ajustes. Analytics aparecía como “Soon”. Algunas páginas mostraban carga inicial; no se consideran funciones verificadas. Login/Auth e Integrations negaron acceso; Automations y varios ajustes estaban restringidos por el plan. Al ampliar la revisión de subpáginas apareció un límite temporal de solicitudes. Esas vistas quedan pendientes, no se presentan como revisadas a fondo.

Referencia: https://josejuan-8nl.ezycommunity.com/dashboard/settings/general

ServGT: https://comunidad-mvp.j94390833.workers.dev/admin/settings

## Comparación por página / sección

| Sección de referencia | ServGT actual | Diferencia o siguiente mejora |
|---|---|---|
| Dashboard | `/admin`: períodos, métricas, actividad, atención pendiente, canales y colaboradores | Base comparable. Corregir importes cero mostrados como “Gratis” en métricas financieras. |
| Website | No se identificó constructor de sitios equivalente | Ezy muestra constructor IA con staging/publicación; no se probó generar. Sería un producto adicional. |
| Reports | `/admin/moderation`: denuncias y revisión | Mejorar filtros y trazabilidad; no hay equivalente observado de cola IA. |
| Content | `/admin/content`: publicaciones, archivos, canales y estados | Base existente. Ezy separa además revisión de ediciones; validar necesidad antes de agregar. |
| Members | `/admin/members`: búsqueda, roles, estados, invitación y alta manual | Base existente; presentación y acciones masivas pueden ampliarse. |
| Invitations / Requests | Implementadas en miembros y APIs | No confundir ausencia de menú separado con ausencia de función. Subpáginas Ezy no verificadas a fondo. |
| Tags | Etiquetas privadas y gestión disponibles | Base existente. |
| Profile fields | Perfil con campos del sistema | Ezy muestra campos personalizados y exigencia de completar perfil. No se identificó constructor equivalente en ServGT. |
| Membership questions | Ajustes de ingreso | Ya hay hasta seis preguntas ligadas a aprobación previa. Vista Ezy pendiente de verificar. |
| Auto-join channels | Ajustes de ingreso y registro | Ya existe, limitado a dos canales. Ampliar selector múltiple si el producto lo requiere. Vista Ezy pendiente. |
| Level gates | Gamificación y acceso por nivel | Base existente; vista Ezy pendiente de verificar. |
| Course tools / Certificates | `/admin/courses`, plantillas y emisión de certificados | No es una función ausente. Comparar diseñador y verificación en una segunda pasada. |
| Gamification: badges | Niveles editables, umbral, icono, insignias | Faltan biblioteca visual, presets, paletas y control global equivalente al observado. |
| Gamification: activity XP | Siete acciones configurables en código | Ezy distingue acciones de perfil/ingreso, asistir a evento y unirse a directo. ServGT premia RSVP, no asistencia real. También difiere dar vs recibir reacciones. Definir reglas, evitar copiar valores sin ajustar semántica. |
| Gamification: notifications | No se verificó editor equivalente | Subpágina Ezy no terminó de cargar; comparar antes de implementar. |
| Meetings | `/admin/events` gestiona eventos y sesiones | No equivale a motor de directos/webinars, grabaciones y leads. Ezy muestra esos controles; ejecución no probada. |
| Paywalls | Canales de pago, planes y acceso directo | Separar productos y recursos: planes actuales habilitan todos los canales de pago. |
| Paywall groups | Planes ordenables/destacados | Falta agrupación flexible de paywalls y recursos por paquete. |
| Earnings and orders | `/admin/earnings`: pedidos, pagos manuales y Stripe | Stripe no estaba configurado. Corregir “Gratis” para ingresos cero. No confundir cobros de miembros con facturación de la plataforma. |
| Community app | Web actual | Ezy permite configurar enlaces de descarga. No se verificó creación real de apps nativas. |
| Marketing | `/admin/emails`: registro operativo | No equivale a campañas, plantillas, segmentos, temas, supresiones y entregabilidad. Proveedor de correo de ServGT no configurado en la vista revisada. |
| Automations | Sin constructor identificado | Ezy lo bloqueó por plan; no se inspeccionaron flujos. |
| Roles & permissions | Cuatro roles fijos | Falta matriz editable y roles personalizados. El código declara explícitamente este límite. |
| Billing | Cobros de miembros existentes | Falta facturación del dueño de una comunidad: plan SaaS, prueba, límites, consumo y cambios de plan. |
| Developers: webhooks | Webhook entrante de Stripe | Falta suite general de eventos, destinos, historial y reenvíos. Ezy declara entrega única sin reintentos automáticos: no copiar esa limitación. |
| Developers: API keys / apps / data-in | No se identificó suite pública equivalente | Subpáginas no verificadas por límite de solicitudes. No publicar APIs sin permisos por comunidad y control de uso. |
| Settings: general / branding | Nombre ES/EN, descripción, color, logos claro/oscuro, icono y favicon | Presets, preview y sincronización real del color. `app.config.ts` mantiene primary azul; el color del tenant no debe quedar limitado a portadas/certificados. |
| Settings: payment | Pagos manuales y Stripe | Configuración de proveedores debe tener estado claro por comunidad. Referencia no cargó detalle suficiente para comparar gateways. |
| Settings: domain & SEO | `/admin/domains`: registro de host | Activación DNS/certificado sigue manual en Cloudflare. Falta onboarding/verificación y SEO centralizado equivalente. |
| Settings: email | Registro operativo y proveedor por entorno | Ezy muestra reply-to y dominio remitente (plan pago). ServGT necesita configuración validada, estado DNS y entregabilidad por comunidad si será SaaS. |
| Settings: notifications | Preferencias personales y notificaciones existentes | Ampliar configuración administrativa por evento/canal; Ezy muestra avisos de ingreso/compra, restringidos por plan. |
| Settings: contact | Ajustes de contacto | Base existente; normalizar validación y presentación. |
| Settings: advanced / privacy | Ajustes de privacidad | Ya existe control de acceso; comparar matrices con servidor y vista guest. No declarar equivalente exacto sin probar cada combinación. |
| Settings: sidebar | Pestaña barra lateral | Base existente: ordenar/mostrar widgets. Mejorar preview y estados vacíos. |
| Settings: navigation menu | Pestaña menú | Base existente; revisar consistencia de audiencia, orden y superficies web/móvil. |
| Settings: login & auth | Login, registro y modal actuales | Ezy negó permiso: proveedores OAuth no comprobados. |
| Settings: integrations | Sin catálogo equivalente identificado | Ezy negó permiso: contenido no comprobado. |
| Settings: AI agent | Moderación manual | Ezy describe agente que marca contenido, sin borrarlo automáticamente. No se activó. |
| Settings: guidelines / legal | Reglas, términos y privacidad editables | Base existente; revisar internacionalización y reutilización consistente en registro/footer. |

## Crear comunidad vs registrarse como miembro

ServGT ya tiene separación de usuarios y membresías por comunidad y resolución de tenant por dominio/slug. Eso es una base multi comunidad, pero no constituye un SaaS listo para autoservicio.

El registro actual (`server/api/auth/register.post.ts`) resuelve una comunidad existente y crea o agrega su miembro. No se identificó un flujo público para crear una comunidad, reservar subdominio, asignar propietario, iniciar prueba y aplicar cuotas.

Para abrir ese servicio hacen falta:

1. Registro de propietario separado del ingreso a una comunidad; posibilidad de una cuenta en varias comunidades.
2. Reserva única de slug y creación transaccional/idempotente de comunidad, propietario y configuración mínima, sin contenido demo.
3. Dominio base propio con wildcard/DNS/TLS y validación de dominios personalizados. El host `workers.dev` actual no reemplaza ese flujo.
4. Planes de plataforma separados de planes que vende cada comunidad; trial, cuotas, facturación, suspensión y restauración.
5. Verificación de correo, límites de creación/uso y protección contra abuso.
6. Aislamiento revisado para consultas, archivos, búsquedas, cachés, sesiones, mensajes, tareas de correo y permisos entre tenants.
7. Panel de plataforma con auditoría y operaciones de soporte, separado del administrador de cada comunidad.

## Orden recomendado

### Primero: producto actual consistente

- Centralizar identidad y tokens visuales por comunidad, con preview claro/oscuro y traducciones.
- Configurar correo y pagos antes de ofrecer funciones que dependen de ellos.
- Corregir importes financieros y mejorar estados vacíos: la portada muestra un post mientras widgets de recientes/miembros estaban vacíos; revisar sus filtros y audiencia antes de atribuirlo a falta de datos.
- Revisar textos de administración: hay etiquetas/descripciones en español dentro del código; no asumir que toda la consola ya es multidioma.

### Después: multi comunidad de autoservicio

Implementar el flujo de propietario y provisión con el aislamiento y límites anteriores. Priorizarlo antes de automatizaciones, IA o constructor de sitios si la meta es que terceros creen comunidades.

### Luego: ampliar capacidades

Paquetes de acceso por recurso, roles personalizables, gamificación visual con reglas claras, campos de perfil, campañas y webhooks. Directos y constructor de sitios deben tratarse como módulos grandes con costos y operación propios.

## Evidencia local principal

- `app/pages/admin/settings.vue`: ajustes y límites de preguntas/auto ingreso.
- `app/pages/admin/members/roles.vue`: cuatro roles fijos, sin matriz editable.
- `server/utils/gamification.ts`: acciones y cálculo actual de puntos.
- `app/app.config.ts`: color primary base.
- `server/api/auth/register.post.ts`: registro de miembro en tenant existente.
- `shared/access.ts`: resolución de comunidad por host y decisiones de acceso.
- `server/api/admin/domains.post.ts`: registro de dominio; activación de infraestructura manual.

No se modificó funcionalidad ni se desplegó código durante esta comparación.
