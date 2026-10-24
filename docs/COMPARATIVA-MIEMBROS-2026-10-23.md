# Comparación de la experiencia de miembro: EzyCommunity / ServGT

Fecha: 23 de octubre de 2026. Revisión de navegación con sesión en ambas plataformas; vista inicial guest de ServGT y contraste con el código local. Solo lectura: no se publicaron mensajes, cambiaron preferencias, inscribieron usuarios ni crearon datos de prueba.

Referencia: https://josejuan-8nl.ezycommunity.com/feeds

ServGT: https://hub.servgt.me/feeds

## Límites de la comparación

La comunidad trial de referencia solo tiene un miembro, un canal y ningún curso, evento, publicación o archivo. Esto permite comparar estructura, controles, editores y estados vacíos; no demuestra entrega de notificaciones, conversación entre personas, reproducción, descarga, compra ni recorrido completo de aprendizaje. No se crearon datos para completar esas pruebas.

La sesión de referencia era administradora y la de ServGT también. Algunos botones visibles corresponden a administradores y no deben copiarse a miembros normales. No se inspeccionó una sesión guest independiente de Ezy ni una pantalla móvil en este recorrido.

## Hallazgos por pantalla

| Pantalla | Referencia observada | ServGT observado / código | Qué implementar o mejorar |
|---|---|---|---|
| Feed | Editor, orden, tarjetas laterales y sugerencia de canales cuando está vacío | Editor, orden y tarjetas ya existen | Estado vacío accionable con canales sugeridos y explicación del feed. |
| Preferencias del feed | Ajustes personales permiten elegir canales seguidos o todo lo accesible; guardado inmediato | El feed consulta canales accesibles; no se identificó selector personal equivalente | Agregar preferencia por usuario, conservando canales públicos visibles y respetando acceso en servidor. No convertir seguir en requisito para descubrir un canal público. |
| Primeros pasos | `/get-started`: bienvenida, progreso y tareas de perfil/configuración/lanzamiento | No se identificó guía equivalente | Separar onboarding de miembro del onboarding de propietario; progreso derivado de acciones reales. |
| Canal General | Editor, orden y flujo explícito de embed | Página con descripción, seguir, publicaciones y chat | Mantener la funcionalidad existente; agregar búsqueda/orden dentro del canal si se necesita. No hace falta reconstruir canales. |
| Editor | Texto, foto, video, encuesta, embed y Go Live | Editor rico con imagen, video, audio, GIF, emoji, encuesta, archivos, código, borradores y programación | No confundir diferencias de presentación con funciones ausentes. El embed genérico de referencia es una brecha concreta; ServGT limita iframes a YouTube/Vimeo. Ampliar solo con proveedores permitidos y validación. |
| Publicación y comentarios | No hay publicaciones para abrir en el trial | Detalle real, comentarios ordenables, adjuntos y reacciones | Base existente. Falta comparar respuestas e interacciones reales de referencia con contenido disponible. |
| Cursos | Búsqueda, control de orden y dos pestañas de presentación sin etiqueta accesible en la captura; catálogo vacío | Catálogo con búsqueda, nivel, precio, capítulos, lecciones y edición del equipo | Agregar orden visible y vistas accesibles. No se verificó a qué corresponden las dos pestañas de Ezy; no asumir funcionalidades por iconos. |
| Detalle de curso | No verificable: catálogo vacío | Inscripción y currículum por capítulos | El código ya contiene tipos de lección y certificados. No declarar que faltan solo porque no se probó el aprendizaje en esta revisión. |
| Eventos | Calendario/lista, todos/hosting, etiquetas, navegación por mes, señales de recurrencia/múltiples días y zona local | Lista/calendario ya existen; detalle con fecha, anfitrión, ubicación y RSVP | Filtros de participación/organización y etiquetas. Recurrencia y sesiones estructuradas requieren modelo de datos y reglas; una leyenda de Ezy no prueba su ejecución. |
| Miembros | Búsqueda, tabs todos/admin/moderador/miembro con conteos, orden y controles de vista | Búsqueda, todos/admin/miembros, conteo y tarjetas | Incluir filtros coherentes con nuestros cuatro roles y orden; mostrar actividad/estadísticas sin exponer datos privados. |
| Perfil | Portada, estado, actividad, comentarios, canales, eventos, guardados, insignias y progreso | Todas esas secciones principales ya existen; además seguidores y estadísticas de actividad | Mejorar jerarquía visual y sincronización. No reconstruir perfiles ni lista de canales seguidos. |
| Insignias del perfil | Insignias visuales por nivel y progreso | Insignias de nivel y actividad ya existen | Corregir semántica contradictoria: ServGT muestra una insignia Inicial ganada con 0 puntos y a la vez “Sin insignia aún”. El código usa el primer umbral positivo para ese mensaje; hay que unificar el criterio. |
| Videos | Vista dedicada, estado vacío con canales seguidos y Reload | Agregador de videos de canales con estado vacío simple | Añadir descubrimiento útil, filtros y paginación según volumen. Ezy muestra videos de canales seguidos; no copiar esa restricción si la decisión de ServGT es descubrimiento público. |
| Biblioteca | Categorías administrables, carpetas, agregar recursos, audiencia Members, orden, grid/lista y filtros de tipo | Subida admin, categoría textual, tipos, protección premium y descargas reales cuando existe archivo | Carpetas/categorías normalizadas, búsqueda, orden, vistas y permisos por recurso. El formulario de carga domina la página: moverlo a una acción/modal del equipo. |
| Datos de biblioteca | Biblioteca de referencia vacía | Varios registros seed se muestran como “Registro de referencia” sin archivo real | Archivar o reemplazar registros demo mediante decisión explícita del administrador; no ofrecerlos como descargas disponibles ni borrarlos automáticamente. |
| Mensajes | Bandeja con DMs/Rooms y accesos Threads/Mentions/Saved | DMs y salas, indicador de escritura y lectura implementados | Añadir respuestas/hilos reales, menciones y guardado de mensajes con permisos por conversación. El componente llamado ChatThread en nuestro código no implica hilos anidados. |
| Notificaciones | Popover con All/Community/Mention/Other y estado vacío | Panel con estado vacío claro y acceso a Ver todas | Ya hay base; comparar contenido real y entrega con dos usuarios. No llenar el estado vacío de filtros innecesarios. |
| Búsqueda | Modal con filtros All/Posts/Comments/People/Events/Courses/Lessons/Library, historial y ayuda de teclado | Modal/página para publicaciones, canales, cursos y miembros | Ampliar búsqueda a comentarios, eventos, lecciones y biblioteca; filtros, historial privado y navegación de teclado. Aplicar autorización antes de devolver resultados o fragmentos. |
| Ajustes personales | Perfil, Feed, Notification, Visibility, Security, Connected accounts, Blocked users, Hidden posts, Language | Perfil, notificaciones, privacidad, bloqueos y ocultos, idioma y seguridad existentes | Preferencias de feed y conexiones OAuth son las diferencias principales. Ocultos ya existe dentro de bloqueos: no es una ausencia funcional. |
| Pagos personales | Menú expone Billing; no se abrió en este recorrido | Precios y APIs de compras/suscripciones existentes | Comparar el centro de suscripción del miembro en otra pasada; no deducir equivalencia por la existencia de una API. |

## Problemas concretos vistos en ServGT

1. Tras iniciar sesión en el modal, el feed quedó con canales y widgets vacíos. Al navegar a Cursos reaparecieron. Es una observación de una transición, no una caída persistente de la API. Revisar invalidación/reobtención de datos tras login antes de concluir la causa.
2. El perfil muestra Inicial ganada y “Sin insignia aún” simultáneamente. Unificar regla del nivel base.
3. Los eventos conservados muestran un anfitrión “Cuenta eliminada” con enlace a perfil de identidad tombstone. Conservar el evento puede ser correcto; conviene permitir reasignar anfitrión y evitar enlaces sin destino útil.
4. Siguen existiendo cursos, eventos y recursos de demostración. Hace falta una limpieza administrable y explícita para lanzamiento, conservando contenido real.
5. En el DOM de ServGT la acción de comentarios aparece como enlace que contiene un botón; revisar HTML interactivo anidado, navegación por teclado y múltiples encabezados h1 de tarjetas. Son problemas de estructura, no solo de apariencia.

## Orden de implementación

### Prioridad 1 — consistencia de lo existente

- Corregir transición tras login y estados de carga/error; mantener datos coherentes entre feed, menú y rail.
- Unificar insignias/nivel base y revisar estados de cuentas eliminadas.
- Corregir semántica accesible de tarjetas y controles.
- Limpieza de demo con vista previa, selección y confirmación; nunca borrado automático de contenido real.

### Prioridad 2 — experiencia del miembro

- Preferencia personal del feed y guía de primeros pasos diferenciada por rol.
- Filtros/orden de miembros y cursos.
- Búsqueda ampliada con autorización común.
- Biblioteca organizada con carpetas, categorías, búsqueda y vistas.

### Prioridad 3 — funciones nuevas mayores

- Hilos, menciones y guardados en mensajería.
- Eventos recurrentes/sesiones y recordatorios.
- Integraciones de embeds permitidas y conexiones OAuth.
- Centro de compras/suscripciones del miembro y notificaciones comprobadas con datos reales.

No se modificó ni desplegó funcionalidad como parte de esta revisión. El inventario distingue funciones observadas de propuestas; no significa que todos los flujos hayan sido probados.

## Implementación posterior a la revisión

Implementado en esta entrega:

- Recarga de datos después de login/registro y sincronización de navegación.
- Regla coherente para insignia base; eliminación de controles interactivos anidados en comentarios.
- Preferencia personal de feed por canales seguidos, sin ocultar canales públicos del menú.
- Primeros pasos con progreso derivado de datos reales y tarea adicional para administradores.
- Orden/vistas de cursos, roles y orden del directorio, filtros de eventos por categoría/reserva/anfitrión.
- Búsqueda de comentarios, eventos, títulos de lecciones accesibles y biblioteca; filtros por tipo.
- Biblioteca con búsqueda, categorías existentes, orden/vistas, carpetas, movimiento y archivado/restauración. No se borraron registros demo automáticamente.
- Mensajería: respuestas agrupadas por raíz, guardado por usuario dentro de la conversación y menciones a participantes de salas. Los hilos se muestran dentro de la ventana de historial cargada (200 DM / 100 sala); no se implementó aún recuperación independiente de hilos antiguos.
- Borrador de mensajes conservado ante error; enlaces de menciones abren la sala.
- Nuevas etiquetas en español e inglés.

Quedan fuera de esta entrega: recurrencia/recordatorios de eventos, proveedores nuevos de embeds/OAuth, centro de suscripciones completo y los módulos SaaS del informe de administración. No se presentan como terminados.
