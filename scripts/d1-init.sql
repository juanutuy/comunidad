-- Comunidad MVP — esquema + seed inicial para Cloudflare D1.
-- Generado con scripts/gen-d1-init.mjs desde la base local sembrada.
-- Aplicar: wrangler d1 execute comunidad-db --remote --file=scripts/d1-init.sql
-- Es idempotente en tablas (IF NOT EXISTS); los INSERT asumen base vacía.

CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, tagline TEXT NOT NULL DEFAULT '', brand_color TEXT NOT NULL DEFAULT '#2563eb', guidelines TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
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
CREATE TABLE IF NOT EXISTS lessons (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, chapter_id INTEGER NOT NULL, title TEXT NOT NULL, duration_min INTEGER NOT NULL DEFAULT 0, is_free INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS enrollments (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, course_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, location TEXT NOT NULL DEFAULT 'En línea', category TEXT NOT NULL DEFAULT 'General', host_id INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rsvps (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, event_id INTEGER NOT NULL, user_id INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS library_items (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'General', size_label TEXT NOT NULL DEFAULT '', downloads INTEGER NOT NULL DEFAULT 0, locked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS bookmarks_unique ON bookmarks (tenant_id, post_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS channel_access_unique ON channel_access (tenant_id, user_id, channel_id);
CREATE UNIQUE INDEX IF NOT EXISTS channels_tenant_slug ON channels (tenant_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS courses_tenant_slug ON courses (tenant_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_unique ON enrollments (tenant_id, course_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS events_tenant_slug ON events (tenant_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS follows_unique ON follows (tenant_id, user_id, channel_id);
CREATE UNIQUE INDEX IF NOT EXISTS memberships_tenant_user ON memberships (tenant_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS posts_channel_slug ON posts (channel_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS reactions_unique ON reactions (post_id, user_id, type);
CREATE UNIQUE INDEX IF NOT EXISTS rsvps_unique ON rsvps (tenant_id, event_id, user_id);

INSERT INTO tenants (id, slug, name, tagline, brand_color, guidelines, created_at) VALUES (1, 'demo', 'Comunidad Demo', 'Un espacio para aprender, compartir y crecer en comunidad.', '#2563eb', '["Respetá a todas las personas: debatí ideas, no ataques a quien las propone.","Nada de spam ni autopromoción fuera de los canales habilitados.","Mantené cada tema en su canal para que la comunidad encuentre todo fácil.","No compartas datos personales de terceros sin su permiso.","Si ves algo que incumple las reglas, reportalo a un administrador."]', '2026-10-19T01:48:52.413Z');
INSERT INTO users (id, name, slug, email, password_hash, bio, location, created_at) VALUES (1, 'Valeria Ríos', 'valeria-rios', 'admin@demo.local', 'scrypt:bbd3b9b1178f8a9747366ec787ce8266:9a242e43de7a6b084c4cbd0396651ea9ea6b245dcdfeb276199d72ec77db47341092cc68cd6d88f9d477880266aaea71590c6b5d9ada3b1f4dd0660ba0d4f003', 'Fundadora de la comunidad. Me gusta conectar personas y documentar lo que aprendemos.', 'Ciudad', '2026-07-21T10:30:00.413Z');
INSERT INTO users (id, name, slug, email, password_hash, bio, location, created_at) VALUES (2, 'Marco Solís', 'marco-solis', 'member@demo.local', 'scrypt:769d31068a491afde75e364f56c60739:08875be5c15afc0dc3bdadea6624611b9b46a8e40b9c4f426f18cbd5a3321f9987f91869d283c10a411d620b4ac13583979359f3aa83e54647210bccd1e27468', 'Creador de contenido y miembro desde el primer día.', 'Ciudad', '2026-07-21T10:30:00.413Z');
INSERT INTO users (id, name, slug, email, password_hash, bio, location, created_at) VALUES (3, 'Lucía Fernández', 'lucia-fernandez', 'lucia@demo.local', 'scrypt:6b1d8a350bd8eff6caa8adc9a1bd2b17:f5211674c282cfce8847b66cd93040e7898ead9658c2fe9aa18892d006ce8d8d68976ae1440ef0ade6047e88166619fe7f7589e9c4780990451bea813b07fa07', 'Diseñadora. Comparto recursos y respondo dudas de herramientas.', 'Remoto', '2026-07-21T10:30:00.413Z');
INSERT INTO users (id, name, slug, email, password_hash, bio, location, created_at) VALUES (4, 'Diego Chen', 'diego-chen', 'diego@demo.local', 'scrypt:4d677b3054a8d3812f4e3e7c44c46109:22d1bcf75d248b60e2bfe36f2bfd1c18f5622c72dfb5667deb43705ee1edb79d3bd8b971849639566bbfb08b13ad7c2c2176f68b25ff75f75f7f15e07a7499ac', 'Emprendedor. Aquí aprendo de ventas y de video corto.', 'Ciudad', '2026-07-21T10:30:00.413Z');
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
INSERT INTO channel_access (id, tenant_id, user_id, channel_id, source, created_at) VALUES (1, 1, 3, 4, 'demo', '2026-10-19T01:48:52.413Z');
INSERT INTO posts (id, tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at) VALUES (1, 1, 1, 1, 'bienvenida-a-la-comunidad', '¡Bienvenidas y bienvenidos a la Comunidad Demo!', 'Este es nuestro espacio para compartir avances, hacer preguntas y celebrar logros.

Presentate en los comentarios: contanos quién sos, qué estás construyendo y qué esperás aprender aquí. Cada semana elegimos las mejores preguntas y las respondemos en vivo.', 'Presentate y conocé al resto de la comunidad.', 'none', '', 1, '2026-10-13T10:30:00.413Z');
INSERT INTO posts (id, tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at) VALUES (2, 1, 1, 2, 'asi-grabe-mi-primer-video', 'Así grabé mi primer video sin equipo caro', 'Grabé esta charla de ejemplo para mostrar que con buena luz y un guion corto se puede empezar hoy. Dejo el video que usamos de referencia en el taller y mis tres aprendizajes:

1. El guion manda: 5 líneas claras valen más que una hora improvisada.
2. Grabá en bloques cortos y editá después.
3. Publicá aunque no sea perfecto: la constancia vence al equipo.', 'Video y aprendizajes del taller de video corto.', 'video', 'https://www.youtube.com/embed/aqz-KE-bpKQ', 0, '2026-10-15T10:30:00.413Z');
INSERT INTO posts (id, tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at) VALUES (3, 1, 2, 1, 'calendario-de-octubre', 'Calendario: dos encuentros en vivo este mes', 'Este mes tenemos dos encuentros: una sesión de preguntas y respuestas y un taller práctico de planificación de contenido. Ambos quedan grabados y subidos a la biblioteca para miembros.

Revisá la sección de Eventos para reservar tu lugar.', 'Reservá tu lugar en los encuentros del mes.', 'none', '', 0, '2026-10-16T10:30:00.413Z');
INSERT INTO posts (id, tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at) VALUES (4, 1, 3, 4, 'como-organizo-mi-contenido', '¿Cómo organizan su contenido de la semana?', 'Estoy probando planificar el domingo pero me quedo sin ideas a mitad de semana. ¿Usan alguna plantilla o método simple que les funcione? Gracias por compartir.', 'Busco un método simple para planificar la semana.', 'none', '', 0, '2026-10-17T10:30:00.413Z');
INSERT INTO posts (id, tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at) VALUES (5, 1, 4, 3, 'plantilla-de-planificacion-2026', 'Plantilla completa de planificación de contenido 2026', 'Aquí está la plantilla completa que uso con mis clientes: calendario mensual, banco de ideas con puntuación, guiones por formato y una hoja de revisión semanal.

Incluye el paso a paso para adaptarla a una sola persona o a un equipo, y los errores más comunes al planificar (con su corrección). Descargala desde la biblioteca, sección Recursos Premium.', 'La plantilla completa, con el paso a paso, está disponible solo para miembros con acceso a este canal.', 'none', '', 0, '2026-10-18T10:30:00.413Z');
INSERT INTO posts (id, tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at) VALUES (6, 1, 4, 1, 'sesion-exclusiva-revision', 'Sesión exclusiva: revisión de proyectos de miembros', 'Cada mes reviso en detalle tres proyectos de miembros de este canal. Dejá el tuyo en los comentarios de esta publicación para entrar en la selección de este mes.', 'Traé tu proyecto a la revisión mensual.', 'none', '', 0, '2026-10-18T12:30:00.413Z');
INSERT INTO posts (id, tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at) VALUES (7, 1, 5, 1, 'notas-de-la-sala-privada', 'Notas de la sala privada', 'Este canal es solo para miembros registrados. Aquí coordinamos las pruebas internas y los adelantos antes de publicarlos en el resto de la comunidad.', 'Coordinación interna de miembros.', 'none', '', 0, '2026-10-19T09:30:00.413Z');
INSERT INTO reactions (id, tenant_id, post_id, user_id, type) VALUES (1, 1, 1, 2, 'love');
INSERT INTO reactions (id, tenant_id, post_id, user_id, type) VALUES (2, 1, 1, 3, 'love');
INSERT INTO reactions (id, tenant_id, post_id, user_id, type) VALUES (3, 1, 1, 4, 'clap');
INSERT INTO reactions (id, tenant_id, post_id, user_id, type) VALUES (4, 1, 2, 1, 'fire');
INSERT INTO reactions (id, tenant_id, post_id, user_id, type) VALUES (5, 1, 2, 3, 'like');
INSERT INTO reactions (id, tenant_id, post_id, user_id, type) VALUES (6, 1, 2, 4, 'fire');
INSERT INTO reactions (id, tenant_id, post_id, user_id, type) VALUES (7, 1, 5, 3, 'love');
INSERT INTO comments (id, tenant_id, post_id, author_id, body, created_at) VALUES (1, 1, 1, 2, '¡Hola! Soy Marco, creo contenido para pequeños negocios y quiero mejorar mi constancia al publicar.', '2026-10-13T11:30:00.413Z');
INSERT INTO comments (id, tenant_id, post_id, author_id, body, created_at) VALUES (2, 1, 1, 3, 'Lucía por aquí, diseñadora. Feliz de ayudar con recursos visuales cuando los necesiten.', '2026-10-13T12:30:00.413Z');
INSERT INTO comments (id, tenant_id, post_id, author_id, body, created_at) VALUES (3, 1, 2, 4, 'El punto del guion corto me cambió la forma de grabar. Gracias por compartirlo.', '2026-10-15T16:30:00.413Z');
INSERT INTO comments (id, tenant_id, post_id, author_id, body, created_at) VALUES (4, 1, 5, 2, 'La plantilla se ve justo como lo que necesito para ordenar mi mes.', '2026-10-18T13:30:00.413Z');
INSERT INTO courses (id, tenant_id, slug, title, description, level, price_cents, created_at) VALUES (1, 1, 'crea-tu-comunidad', 'Creá tu primera comunidad en línea', 'De cero a una comunidad activa: estructura, reglas, canales y los primeros 90 días de contenido.', 'Principiante', 0, '2026-10-19T01:48:52.413Z');
INSERT INTO courses (id, tenant_id, slug, title, description, level, price_cents, created_at) VALUES (2, 1, 'video-corto-que-conecta', 'Video corto que conecta', 'Guion, grabación y edición de videos cortos que la gente sí termina de ver.', 'Intermedio', 2900, '2026-10-19T01:48:52.413Z');
INSERT INTO chapters (id, tenant_id, course_id, title, sort) VALUES (1, 1, 1, 'Fundamentos', 1);
INSERT INTO chapters (id, tenant_id, course_id, title, sort) VALUES (2, 1, 1, 'Puesta en marcha', 2);
INSERT INTO chapters (id, tenant_id, course_id, title, sort) VALUES (3, 1, 2, 'Guion y grabación', 1);
INSERT INTO chapters (id, tenant_id, course_id, title, sort) VALUES (4, 1, 2, 'Edición y publicación', 2);
INSERT INTO lessons (id, tenant_id, chapter_id, title, duration_min, is_free, sort) VALUES (1, 1, 1, 'Qué hace que una comunidad funcione', 9, 1, 1);
INSERT INTO lessons (id, tenant_id, chapter_id, title, duration_min, is_free, sort) VALUES (2, 1, 1, 'Definí tu promesa y tu audiencia', 12, 0, 2);
INSERT INTO lessons (id, tenant_id, chapter_id, title, duration_min, is_free, sort) VALUES (3, 1, 2, 'Canales y reglas claras desde el día uno', 14, 0, 1);
INSERT INTO lessons (id, tenant_id, chapter_id, title, duration_min, is_free, sort) VALUES (4, 1, 2, 'Tu plan de contenido de 90 días', 18, 0, 2);
INSERT INTO lessons (id, tenant_id, chapter_id, title, duration_min, is_free, sort) VALUES (5, 1, 3, 'El gancho de los primeros 3 segundos', 8, 1, 1);
INSERT INTO lessons (id, tenant_id, chapter_id, title, duration_min, is_free, sort) VALUES (6, 1, 3, 'Luz y sonido con lo que ya tenés', 11, 0, 2);
INSERT INTO lessons (id, tenant_id, chapter_id, title, duration_min, is_free, sort) VALUES (7, 1, 4, 'Cortes que mantienen la atención', 15, 0, 1);
INSERT INTO lessons (id, tenant_id, chapter_id, title, duration_min, is_free, sort) VALUES (8, 1, 4, 'Títulos y portadas que invitan a ver', 10, 0, 2);
INSERT INTO events (id, tenant_id, slug, title, description, starts_at, ends_at, location, category, host_id, created_at) VALUES (1, 1, 'sesion-preguntas-en-vivo', 'Sesión de preguntas en vivo', 'Traé tus dudas sobre comunidad, contenido y ventas. Respondemos en orden de llegada y la grabación queda en la biblioteca.', '2026-10-28T15:00:00.413Z', '2026-10-28T16:00:00.413Z', 'En línea · sala de la comunidad', 'En vivo', 1, '2026-10-19T01:48:52.413Z');
INSERT INTO events (id, tenant_id, slug, title, description, starts_at, ends_at, location, category, host_id, created_at) VALUES (2, 1, 'taller-planificacion-contenido', 'Taller: planificá un mes de contenido en una tarde', 'Taller práctico con plantilla incluida. Salís con tu calendario del próximo mes listo.', '2026-11-04T17:00:00.413Z', '2026-11-04T19:00:00.413Z', 'En línea · sala de la comunidad', 'Taller', 3, '2026-10-19T01:48:52.413Z');
INSERT INTO rsvps (id, tenant_id, event_id, user_id) VALUES (1, 1, 1, 2);
INSERT INTO rsvps (id, tenant_id, event_id, user_id) VALUES (2, 1, 1, 3);
INSERT INTO rsvps (id, tenant_id, event_id, user_id) VALUES (3, 1, 2, 4);
INSERT INTO rsvps (id, tenant_id, event_id, user_id) VALUES (4, 1, 2, 2);
INSERT INTO library_items (id, tenant_id, title, kind, category, size_label, downloads, locked, created_at) VALUES (1, 1, 'Guía de bienvenida de la comunidad (PDF)', 'pdf', 'Guías', '1.2 MB', 42, 0, '2026-09-29T10:30:00.413Z');
INSERT INTO library_items (id, tenant_id, title, kind, category, size_label, downloads, locked, created_at) VALUES (2, 1, 'Plantilla de planificación de contenido', 'doc', 'Recursos Premium', '86 KB', 17, 1, '2026-10-14T10:30:00.413Z');
INSERT INTO library_items (id, tenant_id, title, kind, category, size_label, downloads, locked, created_at) VALUES (3, 1, 'Grabación: taller de video corto', 'video', 'Talleres', '48 min', 23, 0, '2026-10-11T10:30:00.413Z');
INSERT INTO library_items (id, tenant_id, title, kind, category, size_label, downloads, locked, created_at) VALUES (4, 1, 'Banco de portadas editables', 'image', 'Recursos Premium', '24 MB', 9, 1, '2026-10-16T10:30:00.413Z');
INSERT INTO library_items (id, tenant_id, title, kind, category, size_label, downloads, locked, created_at) VALUES (5, 1, 'Audio: rutina de enfoque para crear', 'audio', 'Bienestar', '12 min', 31, 0, '2026-10-07T10:30:00.413Z');
INSERT INTO library_items (id, tenant_id, title, kind, category, size_label, downloads, locked, created_at) VALUES (6, 1, 'Directorio de herramientas recomendadas', 'link', 'Guías', 'Enlace', 56, 0, '2026-09-24T10:30:00.413Z');
