// Semilla original en español. Se ejecuta una sola vez, si la base está vacía.
// Usuarios demo: admin@demo.local / demo1234 (admin) y member@demo.local / demo1234.
import type Database from 'better-sqlite3'
import { hashPassword } from './auth'

export function seedIfEmpty(db: InstanceType<typeof Database>) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM tenants').get() as { n: number }
  if (count.n > 0) return

  const now = new Date()
  const iso = (d: Date) => d.toISOString()
  const daysFromNow = (n: number, h = 15) => { const d = new Date(now); d.setDate(d.getDate() + n); d.setHours(h, 0, 0); return iso(d) }
  const daysAgo = (n: number, h = 10) => { const d = new Date(now); d.setDate(d.getDate() - n); d.setHours(h, 30, 0); return iso(d) }

  const guidelines = [
    'Respetá a todas las personas: debatí ideas, no ataques a quien las propone.',
    'Nada de spam ni autopromoción fuera de los canales habilitados.',
    'Mantené cada tema en su canal para que la comunidad encuentre todo fácil.',
    'No compartas datos personales de terceros sin su permiso.',
    'Si ves algo que incumple las reglas, reportalo a un administrador.',
  ]

  const tenantId = Number(db.prepare('INSERT INTO tenants (slug, name, tagline, brand_color, guidelines, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('demo', 'Comunidad Demo', 'Un espacio para aprender, compartir y crecer en comunidad.', '#2563eb', JSON.stringify(guidelines), iso(now)).lastInsertRowid)

  const mkUser = (name: string, slug: string, email: string, bio: string, location: string) =>
    Number(db.prepare('INSERT INTO users (name, slug, email, password_hash, bio, location, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(name, slug, email, hashPassword('demo1234'), bio, location, daysAgo(90)).lastInsertRowid)

  const admin = mkUser('Valeria Ríos', 'valeria-rios', 'admin@demo.local', 'Fundadora de la comunidad. Me gusta conectar personas y documentar lo que aprendemos.', 'Ciudad')
  const member = mkUser('Marco Solís', 'marco-solis', 'member@demo.local', 'Creador de contenido y miembro desde el primer día.', 'Ciudad')
  const lucia = mkUser('Lucía Fernández', 'lucia-fernandez', 'lucia@demo.local', 'Diseñadora. Comparto recursos y respondo dudas de herramientas.', 'Remoto')
  const diego = mkUser('Diego Chen', 'diego-chen', 'diego@demo.local', 'Emprendedor. Aquí aprendo de ventas y de video corto.', 'Ciudad')

  const memberStmt = db.prepare('INSERT INTO memberships (tenant_id, user_id, role) VALUES (?, ?, ?)')
  memberStmt.run(tenantId, admin, 'admin')
  memberStmt.run(tenantId, member, 'member')
  memberStmt.run(tenantId, lucia, 'member')
  memberStmt.run(tenantId, diego, 'member')

  const mkGroup = (name: string, sort: number) => Number(db.prepare('INSERT INTO channel_groups (tenant_id, name, sort) VALUES (?, ?, ?)').run(tenantId, name, sort).lastInsertRowid)
  const gGeneral = mkGroup('General', 1)
  const gAyuda = mkGroup('Ayuda', 2)
  const gRecursos = mkGroup('Recursos', 3)

  const mkChannel = (groupId: number, slug: string, name: string, icon: string, description: string, type: string, price: number, sort: number) =>
    Number(db.prepare('INSERT INTO channels (tenant_id, group_id, slug, name, icon, description, type, price_cents, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(tenantId, groupId, slug, name, icon, description, type, price, sort).lastInsertRowid)

  const general = mkChannel(gGeneral, 'general', 'General', 'i-lucide-messages-square', 'Conversación abierta para toda la comunidad.', 'free', 0, 1)
  const anuncios = mkChannel(gGeneral, 'anuncios', 'Anuncios', 'i-lucide-megaphone', 'Novedades oficiales de la comunidad.', 'free', 0, 2)
  const ayuda = mkChannel(gAyuda, 'ayuda', 'Ayuda y dudas', 'i-lucide-life-buoy', 'Preguntá y ayudá: nadie se queda sin respuesta.', 'free', 0, 3)
  const premium = mkChannel(gRecursos, 'premium', 'Recursos Premium', 'i-lucide-crown', 'Plantillas, guías y sesiones exclusivas para miembros pagos.', 'paid', 2200, 4)
  const privada = mkChannel(gRecursos, 'sala-privada', 'Sala privada', 'i-lucide-lock', 'Espacio solo para miembros registrados.', 'private', 0, 5)

  // Acceso pago de ejemplo: Lucía ya tiene acceso al canal premium.
  db.prepare('INSERT INTO channel_access (tenant_id, user_id, channel_id, source, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(tenantId, lucia, premium, 'demo', iso(now))

  const mkPost = (channelId: number, authorId: number, slug: string, title: string, body: string, teaser: string, mediaType: string, mediaUrl: string, pinned: number, created: string) =>
    Number(db.prepare('INSERT INTO posts (tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(tenantId, channelId, authorId, slug, title, body, teaser, mediaType, mediaUrl, pinned, created).lastInsertRowid)

  const pWelcome = mkPost(general, admin, 'bienvenida-a-la-comunidad', '¡Bienvenidas y bienvenidos a la Comunidad Demo!',
    'Este es nuestro espacio para compartir avances, hacer preguntas y celebrar logros.\n\nPresentate en los comentarios: contanos quién sos, qué estás construyendo y qué esperás aprender aquí. Cada semana elegimos las mejores preguntas y las respondemos en vivo.',
    'Presentate y conocé al resto de la comunidad.', 'none', '', 1, daysAgo(6))
  const pVideo = mkPost(general, member, 'asi-grabe-mi-primer-video', 'Así grabé mi primer video sin equipo caro',
    'Grabé esta charla de ejemplo para mostrar que con buena luz y un guion corto se puede empezar hoy. Dejo el video que usamos de referencia en el taller y mis tres aprendizajes:\n\n1. El guion manda: 5 líneas claras valen más que una hora improvisada.\n2. Grabá en bloques cortos y editá después.\n3. Publicá aunque no sea perfecto: la constancia vence al equipo.',
    'Video y aprendizajes del taller de video corto.', 'video', 'https://www.youtube.com/embed/aqz-KE-bpKQ', 0, daysAgo(4))
  mkPost(anuncios, admin, 'calendario-de-octubre', 'Calendario: dos encuentros en vivo este mes',
    'Este mes tenemos dos encuentros: una sesión de preguntas y respuestas y un taller práctico de planificación de contenido. Ambos quedan grabados y subidos a la biblioteca para miembros.\n\nRevisá la sección de Eventos para reservar tu lugar.', 'Reservá tu lugar en los encuentros del mes.', 'none', '', 0, daysAgo(3))
  mkPost(ayuda, diego, 'como-organizo-mi-contenido', '¿Cómo organizan su contenido de la semana?',
    'Estoy probando planificar el domingo pero me quedo sin ideas a mitad de semana. ¿Usan alguna plantilla o método simple que les funcione? Gracias por compartir.', 'Busco un método simple para planificar la semana.', 'none', '', 0, daysAgo(2))
  const pPaid = mkPost(premium, lucia, 'plantilla-de-planificacion-2026', 'Plantilla completa de planificación de contenido 2026',
    'Aquí está la plantilla completa que uso con mis clientes: calendario mensual, banco de ideas con puntuación, guiones por formato y una hoja de revisión semanal.\n\nIncluye el paso a paso para adaptarla a una sola persona o a un equipo, y los errores más comunes al planificar (con su corrección). Descargala desde la biblioteca, sección Recursos Premium.',
    'La plantilla completa, con el paso a paso, está disponible solo para miembros con acceso a este canal.', 'none', '', 0, daysAgo(1))
  mkPost(premium, admin, 'sesion-exclusiva-revision', 'Sesión exclusiva: revisión de proyectos de miembros',
    'Cada mes reviso en detalle tres proyectos de miembros de este canal. Dejá el tuyo en los comentarios de esta publicación para entrar en la selección de este mes.', 'Traé tu proyecto a la revisión mensual.', 'none', '', 0, daysAgo(1, 12))
  mkPost(privada, admin, 'notas-de-la-sala-privada', 'Notas de la sala privada',
    'Este canal es solo para miembros registrados. Aquí coordinamos las pruebas internas y los adelantos antes de publicarlos en el resto de la comunidad.', 'Coordinación interna de miembros.', 'none', '', 0, daysAgo(0, 9))

  const mkComment = (postId: number, authorId: number, body: string, created: string) =>
    db.prepare('INSERT INTO comments (tenant_id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)').run(tenantId, postId, authorId, body, created)
  mkComment(pWelcome, member, '¡Hola! Soy Marco, creo contenido para pequeños negocios y quiero mejorar mi constancia al publicar.', daysAgo(6, 11))
  mkComment(pWelcome, lucia, 'Lucía por aquí, diseñadora. Feliz de ayudar con recursos visuales cuando los necesiten.', daysAgo(6, 12))
  mkComment(pVideo, diego, 'El punto del guion corto me cambió la forma de grabar. Gracias por compartirlo.', daysAgo(4, 16))
  mkComment(pPaid, member, 'La plantilla se ve justo como lo que necesito para ordenar mi mes.', daysAgo(1, 13))

  const mkReaction = (postId: number, userId: number, type: string) =>
    db.prepare('INSERT OR IGNORE INTO reactions (tenant_id, post_id, user_id, type) VALUES (?, ?, ?, ?)').run(tenantId, postId, userId, type)
  mkReaction(pWelcome, member, 'love'); mkReaction(pWelcome, lucia, 'love'); mkReaction(pWelcome, diego, 'clap')
  mkReaction(pVideo, admin, 'fire'); mkReaction(pVideo, lucia, 'like'); mkReaction(pVideo, diego, 'fire')
  mkReaction(pPaid, lucia, 'love')

  const followStmt = db.prepare('INSERT OR IGNORE INTO follows (tenant_id, user_id, channel_id) VALUES (?, ?, ?)')
  for (const uid of [admin, member, lucia, diego]) for (const cid of [general, anuncios, ayuda]) followStmt.run(tenantId, uid, cid)

  // Cursos
  const mkCourse = (slug: string, title: string, description: string, level: string, price: number) =>
    Number(db.prepare('INSERT INTO courses (tenant_id, slug, title, description, level, price_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(tenantId, slug, title, description, level, price, iso(now)).lastInsertRowid)
  const c1 = mkCourse('crea-tu-comunidad', 'Creá tu primera comunidad en línea', 'De cero a una comunidad activa: estructura, reglas, canales y los primeros 90 días de contenido.', 'Principiante', 0)
  const c2 = mkCourse('video-corto-que-conecta', 'Video corto que conecta', 'Guion, grabación y edición de videos cortos que la gente sí termina de ver.', 'Intermedio', 2900)
  const mkChapter = (courseId: number, title: string, sort: number) =>
    Number(db.prepare('INSERT INTO chapters (tenant_id, course_id, title, sort) VALUES (?, ?, ?, ?)').run(tenantId, courseId, title, sort).lastInsertRowid)
  const mkLesson = (chapterId: number, title: string, mins: number, free: number, sort: number) =>
    db.prepare('INSERT INTO lessons (tenant_id, chapter_id, title, duration_min, is_free, sort) VALUES (?, ?, ?, ?, ?, ?)').run(tenantId, chapterId, title, mins, free, sort)
  const ch1 = mkChapter(c1, 'Fundamentos', 1); mkLesson(ch1, 'Qué hace que una comunidad funcione', 9, 1, 1); mkLesson(ch1, 'Definí tu promesa y tu audiencia', 12, 0, 2)
  const ch2 = mkChapter(c1, 'Puesta en marcha', 2); mkLesson(ch2, 'Canales y reglas claras desde el día uno', 14, 0, 1); mkLesson(ch2, 'Tu plan de contenido de 90 días', 18, 0, 2)
  const ch3 = mkChapter(c2, 'Guion y grabación', 1); mkLesson(ch3, 'El gancho de los primeros 3 segundos', 8, 1, 1); mkLesson(ch3, 'Luz y sonido con lo que ya tenés', 11, 0, 2)
  const ch4 = mkChapter(c2, 'Edición y publicación', 2); mkLesson(ch4, 'Cortes que mantienen la atención', 15, 0, 1); mkLesson(ch4, 'Títulos y portadas que invitan a ver', 10, 0, 2)

  // Eventos futuros
  const mkEvent = (slug: string, title: string, description: string, start: string, end: string, location: string, category: string, hostId: number) =>
    Number(db.prepare('INSERT INTO events (tenant_id, slug, title, description, starts_at, ends_at, location, category, host_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(tenantId, slug, title, description, start, end, location, category, hostId, iso(now)).lastInsertRowid)
  const e1 = mkEvent('sesion-preguntas-en-vivo', 'Sesión de preguntas en vivo', 'Traé tus dudas sobre comunidad, contenido y ventas. Respondemos en orden de llegada y la grabación queda en la biblioteca.', daysFromNow(9), daysFromNow(9, 16), 'En línea · sala de la comunidad', 'En vivo', admin)
  const e2 = mkEvent('taller-planificacion-contenido', 'Taller: planificá un mes de contenido en una tarde', 'Taller práctico con plantilla incluida. Salís con tu calendario del próximo mes listo.', daysFromNow(16, 17), daysFromNow(16, 19), 'En línea · sala de la comunidad', 'Taller', lucia)
  const rsvpStmt = db.prepare('INSERT OR IGNORE INTO rsvps (tenant_id, event_id, user_id) VALUES (?, ?, ?)')
  rsvpStmt.run(tenantId, e1, member); rsvpStmt.run(tenantId, e1, lucia); rsvpStmt.run(tenantId, e2, diego); rsvpStmt.run(tenantId, e2, member)

  // Biblioteca
  const mkItem = (title: string, kind: string, category: string, size: string, downloads: number, locked: number, ago: number) =>
    db.prepare('INSERT INTO library_items (tenant_id, title, kind, category, size_label, downloads, locked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(tenantId, title, kind, category, size, downloads, locked, daysAgo(ago))
  mkItem('Guía de bienvenida de la comunidad (PDF)', 'pdf', 'Guías', '1.2 MB', 42, 0, 20)
  mkItem('Plantilla de planificación de contenido', 'doc', 'Recursos Premium', '86 KB', 17, 1, 5)
  mkItem('Grabación: taller de video corto', 'video', 'Talleres', '48 min', 23, 0, 8)
  mkItem('Banco de portadas editables', 'image', 'Recursos Premium', '24 MB', 9, 1, 3)
  mkItem('Audio: rutina de enfoque para crear', 'audio', 'Bienestar', '12 min', 31, 0, 12)
  mkItem('Directorio de herramientas recomendadas', 'link', 'Guías', 'Enlace', 56, 0, 25)
}
