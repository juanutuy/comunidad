-- Comunidad MVP — esquema + seed inicial para Cloudflare D1.
-- Generado con scripts/gen-d1-init.mjs desde la base local sembrada.
-- Aplicar: wrangler d1 execute comunidad-db --remote --file=scripts/d1-init.sql
-- Es idempotente en tablas (IF NOT EXISTS); los INSERT asumen base vacía.

CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, tagline TEXT NOT NULL DEFAULT '', brand_color TEXT NOT NULL DEFAULT '#2563eb', guidelines TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, avatar_url TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS memberships (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'member');
CREATE TABLE IF NOT EXISTS channel_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS channels (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, group_id INTEGER, slug TEXT NOT NULL, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'i-lucide-hash', description TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT 'free', price_cents INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS follows (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, channel_id INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS channel_access (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, channel_id INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'demo', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, channel_id INTEGER NOT NULL, author_id INTEGER NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', teaser TEXT NOT NULL DEFAULT '', media_type TEXT NOT NULL DEFAULT 'none', media_url TEXT NOT NULL DEFAULT '', pinned INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reactions (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL, type TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, post_id INTEGER NOT NULL, author_id INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bookmarks (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS courses (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', level TEXT NOT NULL DEFAULT 'Principiante', price_cents INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chapters (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, course_id INTEGER NOT NULL, title TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS lessons (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, chapter_id INTEGER NOT NULL, title TEXT NOT NULL, duration_min INTEGER NOT NULL DEFAULT 0, is_free INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0, content TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS lesson_progress (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, lesson_id INTEGER NOT NULL, completed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS enrollments (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, course_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, location TEXT NOT NULL DEFAULT 'En línea', category TEXT NOT NULL DEFAULT 'General', host_id INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rsvps (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, event_id INTEGER NOT NULL, user_id INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS library_items (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'General', size_label TEXT NOT NULL DEFAULT '', downloads INTEGER NOT NULL DEFAULT 0, locked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, file_key TEXT NOT NULL DEFAULT '', file_name TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, actor_id INTEGER, type TEXT NOT NULL, title TEXT NOT NULL, link TEXT NOT NULL DEFAULT '', is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS uploads (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, key TEXT NOT NULL, filename TEXT NOT NULL DEFAULT '', content_type TEXT NOT NULL DEFAULT '', size INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS bookmarks_unique ON bookmarks (tenant_id, post_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS channel_access_unique ON channel_access (tenant_id, user_id, channel_id);
CREATE UNIQUE INDEX IF NOT EXISTS channels_tenant_slug ON channels (tenant_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS courses_tenant_slug ON courses (tenant_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_unique ON enrollments (tenant_id, course_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS events_tenant_slug ON events (tenant_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS follows_unique ON follows (tenant_id, user_id, channel_id);
CREATE UNIQUE INDEX IF NOT EXISTS lesson_progress_unique ON lesson_progress (tenant_id, user_id, lesson_id);
CREATE UNIQUE INDEX IF NOT EXISTS memberships_tenant_user ON memberships (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS notifications_user_read ON notifications (user_id, is_read, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS posts_channel_slug ON posts (channel_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS reactions_unique ON reactions (post_id, user_id, type);
CREATE UNIQUE INDEX IF NOT EXISTS rsvps_unique ON rsvps (tenant_id, event_id, user_id);

INSERT INTO tenants (id, slug, name, tagline, brand_color, guidelines, created_at) VALUES (1, 'demo', 'Comunidad Demo', 'Un espacio para aprender, compartir y crecer en comunidad.', '#2563eb', '["Respetá a todas las personas: debatí ideas, no ataques a quien las propone.","Nada de spam ni autopromoción fuera de los canales habilitados.","Mantené cada tema en su canal para que la comunidad encuentre todo fácil.","No compartas datos personales de terceros sin su permiso.","Si ves algo que incumple las reglas, reportalo a un administrador."]', '2026-10-19T02:40:11.141Z');
INSERT INTO users (id, name, slug, email, password_hash, bio, location, created_at, avatar_url) VALUES (1, 'Valeria Ríos', 'valeria-rios', 'admin@demo.local', 'scrypt:2a95188eb7c4c8e36d1a55bc9d661c1a:7d0a2e7931462837fc48d7616b724cf000f7c3aa35f23ee42b0d54054cec3e78c1a3adde7707208be963a7d1b84b90bd2457eb234bfe55d240344aade2e37549', 'Fundadora de la comunidad. Me gusta conectar personas y documentar lo que aprendemos.', 'Ciudad', '2026-07-21T10:30:00.141Z', '');
INSERT INTO users (id, name, slug, email, password_hash, bio, location, created_at, avatar_url) VALUES (2, 'Marco Solís', 'marco-solis', 'member@demo.local', 'scrypt:517c3bf922f7bb8487b49222a44decc8:c7d5c2e6b84acc4397cff0dc06f8c3fc099bed4a947a1e0e498744eb0b2129f56982ced5b41c44dda2ad0389ca1fc932cbe297eb6be155b62335dd763e1481ef', 'Creador de contenido y miembro desde el primer día.', 'Ciudad', '2026-07-21T10:30:00.141Z', '');
INSERT INTO users (id, name, slug, email, password_hash, bio, location, created_at, avatar_url) VALUES (3, 'Lucía Fernández', 'lucia-fernandez', 'lucia@demo.local', 'scrypt:66069b7900da6590fd7b199bff8f4154:141f5a89d544f7c4b41e331d919da6b37349c217882f1e6b117c11bc55e309a6949de52c597a03a2fb5312f2b8ac451353df6477c707fd2dec39ee21a896747c', 'Diseñadora. Comparto recursos y respondo dudas de herramientas.', 'Remoto', '2026-07-21T10:30:00.141Z', '');
INSERT INTO users (id, name, slug, email, password_hash, bio, location, created_at, avatar_url) VALUES (4, 'Diego Chen', 'diego-chen', 'diego@demo.local', 'scrypt:08ff28f3b940aea00c334d71b0ece332:2135c15dd211c8ab930acd0ea2e57d5e4b6706d7881236959596d5388d3d46383c88b0949715db66f5f1fb40400691b75e92d3be3a4b5a807f6373b901f96a33', 'Emprendedor. Aquí aprendo de ventas y de video corto.', 'Ciudad', '2026-07-21T10:30:00.141Z', '');
INSERT INTO memberships (id, tenant_id, user_id, role) VALUES (1, 1, 1, 'admin');
INSERT INTO memberships (id, tenant_id, user_id, role) VALUES (2, 1, 2, 'member');
INSERT INTO memberships (id, tenant_id, user_id, role) VALUES (3, 1, 3, 'member');
INSERT INTO memberships (id, tenant_id, user_id, role) VALUES (4, 1, 4, 'member');
INSERT INTO channel_groups (id, tenant_id, name, sort) VALUES (1, 1, 'General', 1);
INSERT INTO channel_groups (id, tenant_id, name, sort) VALUES (2, 1, 'Ayuda', 2);
INSERT INTO channel_groups (id, tenant_id, name, sort) VALUES (3, 1, 'Recursos', 3);
INSERT INTO channels (id, tenant_id, group_id, slug, name, icon, description, type, price_cents, sort) VALUES (1, 1, 1, 'general', 'General', 'i-lucide-messages-square', 'Conversación abierta para toda la comunidad.', 'free', 0, 1);
INSERT INTO channels (id, tenant_id, group_id, slug, name, icon, description, type, price_cents, sort) VALUES (2, 1, 1, 'anuncios', 'Anuncios', 'i-lucide-megaphone', 'Novedades oficiales de la comunidad.', 'free', 0, 2);
INSERT INTO channels (id, tenant_id, group_id, slug, name, icon, description, type, price_cents, sort) VALUES (3, 1, 2, 'ayuda', 'Ayuda y dudas', 'i-lucide-life-buoy', 'Preguntá y ayudá: nadie se queda sin respuesta.', 'free', 0, 3);
INSERT INTO channels (id, tenant_id, group_id, slug, name, icon, description, type, price_cents, sort) VALUES (4, 1, 3, 'premium', 'Recursos Premium', 'i-lucide-crown', 'Plantillas, guías y sesiones exclusivas para miembros pagos.', 'paid', 2200, 4);
INSERT INTO channels (id, tenant_id, group_id, slug, name, icon, description, type, price_cents, sort) VALUES (5, 1, 3, 'sala-privada', 'Sala privada', 'i-lucide-lock', 'Espacio solo para miembros registrados.', 'private', 0, 5);
INSERT INTO follows (id, tenant_id, user_id, channel_id) VALUES (1, 1, 1, 1);
INSERT INTO follows (id, tenant_id, user_id, channel_id) VALUES (2, 1, 1, 2);
INSERT INTO follows (id, tenant_id, user_id, channel_id) VALUES (3, 1, 1, 3);
INSERT INTO follows (id, tenant_id, user_id, channel_id) VALUES (4, 1, 2, 1);
INSERT INTO follows (id, tenant_id, user_id, channel_id) VALUES (5, 1, 2, 2);
INSERT INTO follows (id, tenant_id, user_id, channel_id) VALUES (6, 1, 2, 3);
INSERT INTO follows (id, tenant_id, user_id, channel_id) VALUES (7, 1, 3, 1);
INSERT INTO follows (id, tenant_id, user_id, channel_id) VALUES (8, 1, 3, 2);
INSERT INTO follows (id, tenant_id, user_id, channel_id) VALUES (9, 1, 3, 3);
INSERT INTO follows (id, tenant_id, user_id, channel_id) VALUES (10, 1, 4, 1);
INSERT INTO follows (id, tenant_id, user_id, channel_id) VALUES (11, 1, 4, 2);
INSERT INTO follows (id, tenant_id, user_id, channel_id) VALUES (12, 1, 4, 3);
INSERT INTO channel_access (id, tenant_id, user_id, channel_id, source, created_at) VALUES (1, 1, 3, 4, 'demo', '2026-10-19T02:40:11.141Z');
INSERT INTO posts (id, tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at) VALUES (1, 1, 1, 1, 'bienvenida-a-la-comunidad', '¡Bienvenidas y bienvenidos a la Comunidad Demo!', 'Este es nuestro espacio para compartir avances, hacer preguntas y celebrar logros.

Presentate en los comentarios: contanos quién sos, qué estás construyendo y qué esperás aprender aquí. Cada semana elegimos las mejores preguntas y las respondemos en vivo.', 'Presentate y conocé al resto de la comunidad.', 'none', '', 1, '2026-10-13T10:30:00.141Z');
INSERT INTO posts (id, tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at) VALUES (2, 1, 1, 2, 'asi-grabe-mi-primer-video', 'Así grabé mi primer video sin equipo caro', 'Grabé esta charla de ejemplo para mostrar que con buena luz y un guion corto se puede empezar hoy. Dejo el video que usamos de referencia en el taller y mis tres aprendizajes:

1. El guion manda: 5 líneas claras valen más que una hora improvisada.
2. Grabá en bloques cortos y editá después.
3. Publicá aunque no sea perfecto: la constancia vence al equipo.', 'Video y aprendizajes del taller de video corto.', 'video', 'https://www.youtube.com/embed/aqz-KE-bpKQ', 0, '2026-10-15T10:30:00.141Z');
INSERT INTO posts (id, tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at) VALUES (3, 1, 2, 1, 'calendario-de-octubre', 'Calendario: dos encuentros en vivo este mes', 'Este mes tenemos dos encuentros: una sesión de preguntas y respuestas y un taller práctico de planificación de contenido. Ambos quedan grabados y subidos a la biblioteca para miembros.

Revisá la sección de Eventos para reservar tu lugar.', 'Reservá tu lugar en los encuentros del mes.', 'none', '', 0, '2026-10-16T10:30:00.141Z');
INSERT INTO posts (id, tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at) VALUES (4, 1, 3, 4, 'como-organizo-mi-contenido', '¿Cómo organizan su contenido de la semana?', 'Estoy probando planificar el domingo pero me quedo sin ideas a mitad de semana. ¿Usan alguna plantilla o método simple que les funcione? Gracias por compartir.', 'Busco un método simple para planificar la semana.', 'none', '', 0, '2026-10-17T10:30:00.141Z');
INSERT INTO posts (id, tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at) VALUES (5, 1, 4, 3, 'plantilla-de-planificacion-2026', 'Plantilla completa de planificación de contenido 2026', 'Aquí está la plantilla completa que uso con mis clientes: calendario mensual, banco de ideas con puntuación, guiones por formato y una hoja de revisión semanal.

Incluye el paso a paso para adaptarla a una sola persona o a un equipo, y los errores más comunes al planificar (con su corrección). Descargala desde la biblioteca, sección Recursos Premium.', 'La plantilla completa, con el paso a paso, está disponible solo para miembros con acceso a este canal.', 'none', '', 0, '2026-10-18T10:30:00.141Z');
INSERT INTO posts (id, tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at) VALUES (6, 1, 4, 1, 'sesion-exclusiva-revision', 'Sesión exclusiva: revisión de proyectos de miembros', 'Cada mes reviso en detalle tres proyectos de miembros de este canal. Dejá el tuyo en los comentarios de esta publicación para entrar en la selección de este mes.', 'Traé tu proyecto a la revisión mensual.', 'none', '', 0, '2026-10-18T12:30:00.141Z');
INSERT INTO posts (id, tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at) VALUES (7, 1, 5, 1, 'notas-de-la-sala-privada', 'Notas de la sala privada', 'Este canal es solo para miembros registrados. Aquí coordinamos las pruebas internas y los adelantos antes de publicarlos en el resto de la comunidad.', 'Coordinación interna de miembros.', 'none', '', 0, '2026-10-19T09:30:00.141Z');
INSERT INTO reactions (id, tenant_id, post_id, user_id, type) VALUES (1, 1, 1, 2, 'love');
INSERT INTO reactions (id, tenant_id, post_id, user_id, type) VALUES (2, 1, 1, 3, 'love');
INSERT INTO reactions (id, tenant_id, post_id, user_id, type) VALUES (3, 1, 1, 4, 'clap');
INSERT INTO reactions (id, tenant_id, post_id, user_id, type) VALUES (4, 1, 2, 1, 'fire');
INSERT INTO reactions (id, tenant_id, post_id, user_id, type) VALUES (5, 1, 2, 3, 'like');
INSERT INTO reactions (id, tenant_id, post_id, user_id, type) VALUES (6, 1, 2, 4, 'fire');
INSERT INTO reactions (id, tenant_id, post_id, user_id, type) VALUES (7, 1, 5, 3, 'love');
INSERT INTO comments (id, tenant_id, post_id, author_id, body, created_at) VALUES (1, 1, 1, 2, '¡Hola! Soy Marco, creo contenido para pequeños negocios y quiero mejorar mi constancia al publicar.', '2026-10-13T11:30:00.141Z');
INSERT INTO comments (id, tenant_id, post_id, author_id, body, created_at) VALUES (2, 1, 1, 3, 'Lucía por aquí, diseñadora. Feliz de ayudar con recursos visuales cuando los necesiten.', '2026-10-13T12:30:00.141Z');
INSERT INTO comments (id, tenant_id, post_id, author_id, body, created_at) VALUES (3, 1, 2, 4, 'El punto del guion corto me cambió la forma de grabar. Gracias por compartirlo.', '2026-10-15T16:30:00.141Z');
INSERT INTO comments (id, tenant_id, post_id, author_id, body, created_at) VALUES (4, 1, 5, 2, 'La plantilla se ve justo como lo que necesito para ordenar mi mes.', '2026-10-18T13:30:00.141Z');
INSERT INTO courses (id, tenant_id, slug, title, description, level, price_cents, created_at) VALUES (1, 1, 'crea-tu-comunidad', 'Creá tu primera comunidad en línea', 'De cero a una comunidad activa: estructura, reglas, canales y los primeros 90 días de contenido.', 'Principiante', 0, '2026-10-19T02:40:11.141Z');
INSERT INTO courses (id, tenant_id, slug, title, description, level, price_cents, created_at) VALUES (2, 1, 'video-corto-que-conecta', 'Video corto que conecta', 'Guion, grabación y edición de videos cortos que la gente sí termina de ver.', 'Intermedio', 2900, '2026-10-19T02:40:11.141Z');
INSERT INTO chapters (id, tenant_id, course_id, title, sort) VALUES (1, 1, 1, 'Fundamentos', 1);
INSERT INTO chapters (id, tenant_id, course_id, title, sort) VALUES (2, 1, 1, 'Puesta en marcha', 2);
INSERT INTO chapters (id, tenant_id, course_id, title, sort) VALUES (3, 1, 2, 'Guion y grabación', 1);
INSERT INTO chapters (id, tenant_id, course_id, title, sort) VALUES (4, 1, 2, 'Edición y publicación', 2);
INSERT INTO lessons (id, tenant_id, chapter_id, title, duration_min, is_free, sort, content) VALUES (1, 1, 1, 'Qué hace que una comunidad funcione', 9, 1, 1, 'Una comunidad no funciona por la plataforma: funciona porque la gente vuelve. Y la gente vuelve por tres cosas: sentirse vista, aprender algo útil y conocer a otras personas como ella.

En esta lección revisamos ejemplos reales de comunidades que crecieron sin publicidad y detectamos el patrón común: rituales semanales simples, respuestas rápidas a cada nuevo miembro y un espacio claro para compartir logros.

Ejercicio: escribí en una frase qué obtiene alguien que participa activamente durante un mes en tu comunidad. Esa frase va a guiar todo lo demás.');
INSERT INTO lessons (id, tenant_id, chapter_id, title, duration_min, is_free, sort, content) VALUES (2, 1, 1, 'Definí tu promesa y tu audiencia', 12, 0, 2, 'La promesa es el resultado concreto que tu comunidad ayuda a lograr: no "un espacio para emprendedores", sino "salir con tu primer cliente en 90 días". Cuanto más específica, mejor filtra y mejor retiene.

Tu audiencia inicial debería ser un grupo pequeño y reconocible: las primeras 50 personas definen la cultura. Hablales en su idioma, con sus problemas reales, y evitá mezclar públicos que no se hablan entre sí.

Al terminar, completá esta plantilla: "Ayudo a [audiencia] a lograr [resultado] mediante [método o dinámica de la comunidad]".');
INSERT INTO lessons (id, tenant_id, chapter_id, title, duration_min, is_free, sort, content) VALUES (3, 1, 2, 'Canales y reglas claras desde el día uno', 14, 0, 1, 'Menos canales, mejor comunidad: empezá con tres a cinco espacios con propósito evidente (presentaciones, dudas, logros y un canal social). Cada canal nuevo se crea cuando el contenido ya existe y no encuentra lugar, nunca antes.

Las reglas deben ser cortas, positivas y visibles: qué se celebra, qué se mueve a otro canal y qué se elimina. Publicalas dentro de la comunidad y enlazalas en el mensaje de bienvenida.

Checklist de lanzamiento: canal de presentaciones con una pregunta rompehielos, reglas fijadas, primer evento agendado y tres publicaciones semilla tuyas.');
INSERT INTO lessons (id, tenant_id, chapter_id, title, duration_min, is_free, sort, content) VALUES (4, 1, 2, 'Tu plan de contenido de 90 días', 18, 0, 2, 'Noventa días es el horizonte mínimo para que una comunidad despegue: tiempo suficiente para crear hábito sin quemarte. El plan combina cuatro tipos de contenido en rotación: enseñar (tutoriales cortos), conversar (preguntas abiertas), celebrar (logros de miembros) y reunir (eventos en vivo).

Armá una grilla semanal repetible — por ejemplo: lunes de pregunta, miércoles de recurso, viernes de logros — y prepará el contenido en bloques de dos horas.

Regla de oro: tu contenido siembra, pero la meta es que en el día 90 la mitad de las publicaciones nazcan de los miembros. Medilo cada mes.');
INSERT INTO lessons (id, tenant_id, chapter_id, title, duration_min, is_free, sort, content) VALUES (5, 1, 3, 'El gancho de los primeros 3 segundos', 8, 1, 1, 'Nadie decide ver tu video por el tema: decide por la primera frase. Un buen gancho promete un resultado, abre una pregunta o contradice una creencia común: "Estás editando tus videos al revés y por eso nadie los termina".

Escribí el gancho antes que el resto del guion y grabalo en dos versiones. Si el gancho no te genera curiosidad a vos, no va a generársela a nadie.

Práctica: tomá tu último video y reescribí solo los primeros 3 segundos con estas tres fórmulas. Grabá la versión nueva y compará la retención.');
INSERT INTO lessons (id, tenant_id, chapter_id, title, duration_min, is_free, sort, content) VALUES (6, 1, 3, 'Luz y sonido con lo que ya tenés', 11, 0, 2, 'La gente perdona una imagen regular; no perdona un audio malo. Acercate al micrófono del teléfono o de los auriculares, grabá en el cuarto con más muebles y cortinas de tu casa, y apagá ventiladores y notificaciones.

Para la luz: enfrentá una ventana o una lámpara suave, nunca la tengas detrás. Si grabás de noche, una lámpara con pantalla frente a vos, levemente elevada, alcanza.

Antes de grabar en serio, hacé una toma de prueba de 15 segundos y escuchala con auriculares. Ese hábito simple evita el 90% de los videos que hay que repetir.');
INSERT INTO lessons (id, tenant_id, chapter_id, title, duration_min, is_free, sort, content) VALUES (7, 1, 4, 'Cortes que mantienen la atención', 15, 0, 1, 'Editar video corto es, sobre todo, sacar: silencios mayores a medio segundo, muletillas y cualquier frase que no agregue información o emoción. Cada corte debe ganarse su lugar.

Trabajá en dos pasadas: primero la estructura (que la historia se entienda sin mirar la pantalla) y después el ritmo (acercamientos, textos en pantalla y cambios de plano cada pocos segundos).

Cerrá siempre con una sola llamada a la acción: comentar una palabra, guardar el video o seguirte para la parte dos. Una sola.');
INSERT INTO lessons (id, tenant_id, chapter_id, title, duration_min, is_free, sort, content) VALUES (8, 1, 4, 'Títulos y portadas que invitan a ver', 10, 0, 2, 'El título no resume el video: vende el clic. Prometé un resultado específico o una tensión concreta, en menos de ocho palabras: "3 errores que matan tu primer video" funciona mejor que "Consejos de grabación".

La portada se lee en un segundo: un rostro con expresión clara, tres palabras grandes como máximo y contraste fuerte. Evitá repetir el título entero en la portada: se complementan, no se duplican.

Publicá, medí el porcentaje de clics a las 48 horas y ajustá un solo elemento por vez. Así aprendés qué mueve la aguja en TU audiencia.');
INSERT INTO events (id, tenant_id, slug, title, description, starts_at, ends_at, location, category, host_id, created_at) VALUES (1, 1, 'sesion-preguntas-en-vivo', 'Sesión de preguntas en vivo', 'Traé tus dudas sobre comunidad, contenido y ventas. Respondemos en orden de llegada y la grabación queda en la biblioteca.', '2026-10-28T15:00:00.141Z', '2026-10-28T16:00:00.141Z', 'En línea · sala de la comunidad', 'En vivo', 1, '2026-10-19T02:40:11.141Z');
INSERT INTO events (id, tenant_id, slug, title, description, starts_at, ends_at, location, category, host_id, created_at) VALUES (2, 1, 'taller-planificacion-contenido', 'Taller: planificá un mes de contenido en una tarde', 'Taller práctico con plantilla incluida. Salís con tu calendario del próximo mes listo.', '2026-11-04T17:00:00.141Z', '2026-11-04T19:00:00.141Z', 'En línea · sala de la comunidad', 'Taller', 3, '2026-10-19T02:40:11.141Z');
INSERT INTO rsvps (id, tenant_id, event_id, user_id) VALUES (1, 1, 1, 2);
INSERT INTO rsvps (id, tenant_id, event_id, user_id) VALUES (2, 1, 1, 3);
INSERT INTO rsvps (id, tenant_id, event_id, user_id) VALUES (3, 1, 2, 4);
INSERT INTO rsvps (id, tenant_id, event_id, user_id) VALUES (4, 1, 2, 2);
INSERT INTO library_items (id, tenant_id, title, kind, category, size_label, downloads, locked, created_at, file_key, file_name) VALUES (1, 1, 'Guía de bienvenida de la comunidad (PDF)', 'pdf', 'Guías', '1.2 MB', 42, 0, '2026-09-29T10:30:00.141Z', '', '');
INSERT INTO library_items (id, tenant_id, title, kind, category, size_label, downloads, locked, created_at, file_key, file_name) VALUES (2, 1, 'Plantilla de planificación de contenido', 'doc', 'Recursos Premium', '86 KB', 17, 1, '2026-10-14T10:30:00.141Z', '', '');
INSERT INTO library_items (id, tenant_id, title, kind, category, size_label, downloads, locked, created_at, file_key, file_name) VALUES (3, 1, 'Grabación: taller de video corto', 'video', 'Talleres', '48 min', 23, 0, '2026-10-11T10:30:00.141Z', '', '');
INSERT INTO library_items (id, tenant_id, title, kind, category, size_label, downloads, locked, created_at, file_key, file_name) VALUES (4, 1, 'Banco de portadas editables', 'image', 'Recursos Premium', '24 MB', 9, 1, '2026-10-16T10:30:00.141Z', '', '');
INSERT INTO library_items (id, tenant_id, title, kind, category, size_label, downloads, locked, created_at, file_key, file_name) VALUES (5, 1, 'Audio: rutina de enfoque para crear', 'audio', 'Bienestar', '12 min', 31, 0, '2026-10-07T10:30:00.141Z', '', '');
INSERT INTO library_items (id, tenant_id, title, kind, category, size_label, downloads, locked, created_at, file_key, file_name) VALUES (6, 1, 'Directorio de herramientas recomendadas', 'link', 'Guías', 'Enlace', 56, 0, '2026-09-24T10:30:00.141Z', '', '');
