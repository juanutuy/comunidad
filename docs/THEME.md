# Sistema visual de ServGT

La configuración compartida está en `app/app.config.ts`: inputs, selectores, textarea, botones, etiquetas, tarjetas y modales. Los tamaños `md` y `lg` tienen alturas mínimas de 44 y 48 px; `xs` y `sm` siguen disponibles para herramientas compactas. No aumentar el tamaño raíz del documento para escalar controles.

`app/assets/css/main.css` define superficies semánticas claras y oscuras (`--ui-bg`, `--ui-bg-muted`, `--ui-bg-elevated`, bordes), el lienzo, la navegación y la portada. La portada conserva el color configurable de cada comunidad. Los layouts de comunidad, autenticación y administración comparten el lienzo.

Los componentes heredan el theme automáticamente. Las propiedades `size`, `class` y `:ui` locales siguen teniendo prioridad: usarlas solo cuando la función del componente lo necesita. Por ejemplo, el login usa campos grandes y un modal más amplio; los formularios de edición conservan sus anchos y scroll propios.

El feed conserva su política de acceso pública. La columna derecha respeta la configuración de audiencia y orden que entrega el servidor; eventos y publicaciones muestran estados vacíos cuando están habilitados pero no tienen datos. Los bloques de miembros sin datos siguen ocultos para invitados.

Antes de cambiar estos valores, revisar feed, acceso, registro y un formulario de edición en claro/oscuro, escritorio y teléfono. Verificar foco, campos con iconos, selectores, scroll de modales largos y navegación móvil.
