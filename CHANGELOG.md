# Historial de cambios

## 2026-10-20 — Compatibilidad de medios con D1 remoto

Consultas de referencias de medios divididas en tres grupos, con nombres de columnas explícitos. Evita el límite remoto de términos UNION; mantiene coste acotado para toda la página. Regresión Worker con referencias de canal y biblioteca.

## 2026-10-20 — Cierre de dependencias

Parches locales versionados para profundidad de braces y validación estructural de DigestInfo de node-forge. Se aplican en instalación con fallo obligatorio y regresiones específicas; se conservan versiones upstream para que la auditoría sea transparente.


## 2026-10-20 — Remediación de auditoría

Correcciones de identidad y membresía, política REST/WebSocket compartida, pagos atómicos y expiración, descargas protegidas, cascadas completas, esquema SQL canónico con migración explícita, consultas por lote, paginación, limpieza de caché privada y comprobación de tipos fiable. Nuevas regresiones locales SQLite/D1/Durable Objects y CI. Véase [remediación](docs/REMEDIACION-2026-10-20.md) para validación y parches de dependencias.


Todas las versiones se desplegaron y verificaron en producción
(https://comunidad-mvp.j94390833.workers.dev) el mismo día de su construcción,
comprobando el contenido real servido, no solo el código de respuesta.
El detalle honesto de cada fase (qué se construyó, qué se decidió distinto y
qué quedó fuera) vive en el `README.md`. Cómo se creó el proyecto:
[`docs/COMO-SE-CREO.md`](docs/COMO-SE-CREO.md).

## 19 de octubre de 2026

### Fase 16-G — Comentarios y reacciones como el original
- Paleta de **21 emojis** para reaccionar a publicaciones **y comentarios**
  (antes: 4 reacciones fijas). Una reacción por persona y objetivo: elegir
  otro emoji lo reemplaza. Migración automática de las antiguas
  (like→👍, love→❤️, fire→🔥, clap→👏) conservando los conteos.
- **Respuestas anidadas** en comentarios (un nivel), orden «Más recientes /
  Más antiguos», **adjuntos** (imagen, video, archivo) en comentarios y
  respuestas, y comentarios que se **expanden dentro de la tarjeta**.
- Editar comentario propio (no existía). Puntos: reaccionar a un comentario
  suma 1 a su autor (acción administrable `comment_reaction`).
- Worker `11519fc5` · batería de 49 chequeos.

### Fase 16-F — Canales como el original
- Los canales ganan dos ejes nuevos, separados del acceso: **tipo de
  contenido** (Post / Imagen) y **visibilidad** (Pública / Privada /
  Secreta), conservando la semántica de cada canal existente.
- **Un solo modal** de crear/editar canal (tarjetas de tipo, descripción
  corta, visibilidad, precio con la moneda de la comunidad, quién puede
  publicar, grupo), abierto desde el lateral, la cabecera del canal, el
  directorio y la consola; se retira el formulario básico de administración.
- Menús «⋯» en contexto (seguir, editar, precios, miembros, copiar ID,
  eliminar), **página de canal independiente sin riel derecho**, grupos de
  canales en el lateral, directorio `/channels`, portada de canal y vistas
  **Feed / Galería / Álbum** en canales de imagen.
- Worker `9fc6c1d5` · batería de 78 chequeos.

### Fase 16-E — Marco fijo
- Miembro y consola pasan de scroll de página completa a **marco fijo**
  (`h-dvh`): encabezado fijo y regiones con scroll independiente (lateral de
  canales, centro, riel derecho y contenido de consola). El riel derecho es
  fijo **con su propio scroll interno**.
- Worker `57ff46a7` · batería de 24 chequeos.

### Fase 16-D — Submenús de consola
- Un solo componente de submenú en columna para Ajustes (9 subsecciones),
  Miembros, Contenido, Cursos y Gamificación; componentes de navegación
  anteriores retirados. Las pestañas de la cola de Moderación se quedan por
  ser vistas de datos, no navegación.
- Worker `fdeeeae7` · batería de 49 chequeos.

### Fase 18 — Multilenguaje español/inglés
- Catálogo propio tipado con paridad exacta de claves (916 al cierre);
  resolución: idioma del usuario → defecto de la comunidad → español.
  Fechas y moneda con `Intl` según el idioma. El contenido de los miembros
  no se traduce. Declarado solo en español: los cuerpos de `/admin/**`.
- Worker `081f73da` · batería de 29 chequeos.

### Fase 16-C — Un solo compositor para crear y editar
- «Editar publicación» abre **el mismo compositor** que crear (el modal
  básico y el editor aparte de borradores se eliminaron). Editar solo el
  texto ya no pierde adjuntos ni el estado de comentarios.
- Worker `75660602` · batería de 30 chequeos.

### Fase 17 — Dinero visible
- Sección **Ingresos** en la consola (órdenes reales), **moneda de la
  comunidad** configurable, **pagos manuales** con aprobación del admin
  (el acceso se concede al aprobar, con la misma función que usa el webhook
  de Stripe), planes ordenables y destacados en `/pricing`.
- Worker `a251eb5e` · batería de 45 chequeos.

### Fase 16-B — Menú de la publicación
- Menú completo por tarjeta según contexto: guardar, copiar enlace, ver
  publicación, editar, desactivar comentarios, fijar (staff).
- Worker `a186202b` · 33 chequeos.

### Fase 16 — Contenido central
- Sección **Contenido** (tabla de publicaciones con estados reales),
  **gestor de medios** (uso real, borrar limpia R2 y la base), canales
  archivados y «quién puede publicar», y **Certificate Blueprints** con
  verificación pública de certificados en `/verify`.
- Worker `711e9522`.

### Endurecimiento post-Fase 15
- Sin sesión y con comunidad privada, la API responde 401 en 16 rutas que
  antes servían datos a visitantes.
- Worker `6e386797`.

### Fase 15 — Privacidad y presentación
- Privacidad de la comunidad (privada/pública con lectura de visita),
  **teaser granular** del paywall (porcentaje, tope, título, dónde se
  bloquea), leer ≠ participar, riel derecho configurable, **menú de
  navegación editable**, marca completa (logos, icono y favicon del tenant)
  y datos de contacto/redes.
- Worker `8208e19d`.

### Fase 14 — Miembros a fondo
- Roles **Moderador** y **Gestor de cursos**, consola filtrada por rol,
  **aprobación previa de ingreso** con preguntas, invitaciones por correo y
  por enlace, alta manual, **Level Gates** por puntos, etiquetas privadas,
  auto-ingreso a canales, suspender/restringir y enlaces de acceso de un
  solo uso.
- Worker `516e22d5`.

### Fase 13 — Panel como el original
- Selector de período (7/30/90 días · 12 meses), gráficas propias,
  «Publicaciones sin respuesta» en la atención y pie «Datos al…».
- Worker `843513d2`.

### Correcciones del 19 de octubre
- **Fase 12 — Moderación completa**: reportes en posts y comentarios,
  sección Moderación, bloque «Necesita tu atención» y **revisión previa
  opcional** de publicaciones (los puntos se otorgan al aprobar).
- **Fase 11 — Consola dedicada**: layout propio para `/admin/**` y ajustes
  de usuario como **modal** (la página `/settings` quedó como atajo).
- Unificación del editor de perfil (un solo lugar), buscador como icono con
  diálogo en vivo y Ctrl+K, y corrección del conflicto de rutas anidadas
  que tapaba el visor de lecciones y el estudio de cursos.

## 18 de octubre de 2026

### Paridad con el original — Fases 6 a 10
- **Fase 6/9 — Perfil completo**: portada, seguir miembros, estadísticas,
  pestañas y **gamificación administrable por tenant** (niveles y puntos).
- **Fase 7 — Feed estilo original**: pastillas de orden, riel derecho con
  eventos/recientes/líderes.
- **Fase 10 — Navegación por niveles**: breakpoints en 3 niveles; en
  teléfono, panel deslizable y barra inferior.
- **Fase 8 — Editor rico en dos modos** (bloques con «/» en el compositor,
  barra clásica en cursos/eventos) con sanitizador propio, **post anónimo**
  real y **página-estudio de cursos** con los 7 tipos de lección (Video,
  Text, Audio, PDF, Slides, Download, Embedded), drip y visibilidad Secret.

### Plataforma base — MVP y Fases 2 a 5
- **MVP**: tenant demo multi-tenant, auth propia (scrypt + cookie firmada),
  canales (incluido uno pago con teaser), feed con publicaciones,
  reacciones y comentarios, cursos, eventos con RSVP, biblioteca, ranking,
  perfiles y administración de canales.
- **Fase 2**: notificaciones, subidas reales a R2, cursos con progreso y
  certificado imprimible, calendario, búsqueda y niveles e insignias.
- **Fase 3**: **tiempo real con Durable Objects** (chat por canal, mensajes
  directos, presencia) — el despliegue pasa a ser `wrangler deploy` con el
  entry `worker-entry.mjs`.
- **Fase 4**: **Stripe completo en oscuro** (Checkout + webhook verificado;
  sin claves no cobra), planes y `/pricing`, capa de correos en oscuro,
  dominios por tenant y PWA instalable.
- **Fase 5**: encuestas con voto cambiable, borradores y publicaciones
  programadas, directorio de miembros, gestión completa de cursos y
  eventos, salas grupales, textos legales editables y bloqueos entre
  miembros.
