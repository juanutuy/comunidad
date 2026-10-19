// Semilla original en español. Se ejecuta una sola vez, si la base está vacía.
// Funciona igual sobre SQLite local y sobre Cloudflare D1: usa la capa
// asíncrona de server/utils/db.ts (AsyncDb).
// Usuarios demo: admin@demo.local / demo1234 (admin) y member@demo.local / demo1234.
import { hashPassword } from './auth'
import type { AsyncDb } from './db'

export const LESSON_CONTENTS: Record<string, string> = {
  'Qué hace que una comunidad funcione': 'Una comunidad no funciona por la plataforma: funciona porque la gente vuelve. Y la gente vuelve por tres cosas: sentirse vista, aprender algo útil y conocer a otras personas como ella.\n\nEn esta lección revisamos ejemplos reales de comunidades que crecieron sin publicidad y detectamos el patrón común: rituales semanales simples, respuestas rápidas a cada nuevo miembro y un espacio claro para compartir logros.\n\nEjercicio: escribí en una frase qué obtiene alguien que participa activamente durante un mes en tu comunidad. Esa frase va a guiar todo lo demás.',
  'Definí tu promesa y tu audiencia': 'La promesa es el resultado concreto que tu comunidad ayuda a lograr: no "un espacio para emprendedores", sino "salir con tu primer cliente en 90 días". Cuanto más específica, mejor filtra y mejor retiene.\n\nTu audiencia inicial debería ser un grupo pequeño y reconocible: las primeras 50 personas definen la cultura. Hablales en su idioma, con sus problemas reales, y evitá mezclar públicos que no se hablan entre sí.\n\nAl terminar, completá esta plantilla: "Ayudo a [audiencia] a lograr [resultado] mediante [método o dinámica de la comunidad]".',
  'Canales y reglas claras desde el día uno': 'Menos canales, mejor comunidad: empezá con tres a cinco espacios con propósito evidente (presentaciones, dudas, logros y un canal social). Cada canal nuevo se crea cuando el contenido ya existe y no encuentra lugar, nunca antes.\n\nLas reglas deben ser cortas, positivas y visibles: qué se celebra, qué se mueve a otro canal y qué se elimina. Publicalas dentro de la comunidad y enlazalas en el mensaje de bienvenida.\n\nChecklist de lanzamiento: canal de presentaciones con una pregunta rompehielos, reglas fijadas, primer evento agendado y tres publicaciones semilla tuyas.',
  'Tu plan de contenido de 90 días': 'Noventa días es el horizonte mínimo para que una comunidad despegue: tiempo suficiente para crear hábito sin quemarte. El plan combina cuatro tipos de contenido en rotación: enseñar (tutoriales cortos), conversar (preguntas abiertas), celebrar (logros de miembros) y reunir (eventos en vivo).\n\nArmá una grilla semanal repetible — por ejemplo: lunes de pregunta, miércoles de recurso, viernes de logros — y prepará el contenido en bloques de dos horas.\n\nRegla de oro: tu contenido siembra, pero la meta es que en el día 90 la mitad de las publicaciones nazcan de los miembros. Medilo cada mes.',
  'El gancho de los primeros 3 segundos': 'Nadie decide ver tu video por el tema: decide por la primera frase. Un buen gancho promete un resultado, abre una pregunta o contradice una creencia común: "Estás editando tus videos al revés y por eso nadie los termina".\n\nEscribí el gancho antes que el resto del guion y grabalo en dos versiones. Si el gancho no te genera curiosidad a vos, no va a generársela a nadie.\n\nPráctica: tomá tu último video y reescribí solo los primeros 3 segundos con estas tres fórmulas. Grabá la versión nueva y compará la retención.',
  'Luz y sonido con lo que ya tenés': 'La gente perdona una imagen regular; no perdona un audio malo. Acercate al micrófono del teléfono o de los auriculares, grabá en el cuarto con más muebles y cortinas de tu casa, y apagá ventiladores y notificaciones.\n\nPara la luz: enfrentá una ventana o una lámpara suave, nunca la tengas detrás. Si grabás de noche, una lámpara con pantalla frente a vos, levemente elevada, alcanza.\n\nAntes de grabar en serio, hacé una toma de prueba de 15 segundos y escuchala con auriculares. Ese hábito simple evita el 90% de los videos que hay que repetir.',
  'Cortes que mantienen la atención': 'Editar video corto es, sobre todo, sacar: silencios mayores a medio segundo, muletillas y cualquier frase que no agregue información o emoción. Cada corte debe ganarse su lugar.\n\nTrabajá en dos pasadas: primero la estructura (que la historia se entienda sin mirar la pantalla) y después el ritmo (acercamientos, textos en pantalla y cambios de plano cada pocos segundos).\n\nCerrá siempre con una sola llamada a la acción: comentar una palabra, guardar el video o seguirte para la parte dos. Una sola.',
  'Títulos y portadas que invitan a ver': 'El título no resume el video: vende el clic. Prometé un resultado específico o una tensión concreta, en menos de ocho palabras: "3 errores que matan tu primer video" funciona mejor que "Consejos de grabación".\n\nLa portada se lee en un segundo: un rostro con expresión clara, tres palabras grandes como máximo y contraste fuerte. Evitá repetir el título entero en la portada: se complementan, no se duplican.\n\nPublicá, medí el porcentaje de clics a las 48 horas y ajustá un solo elemento por vez. Así aprendés qué mueve la aguja en TU audiencia.',
}

// Backfill idempotente (Fase 2): las bases creadas en la Fase 1 ya tienen
// las lecciones semilla pero sin contenido (columna nueva). Si una
// lección con el título de la semilla sigue con contenido vacío, se le
// carga el texto. No toca lecciones con contenido propio ni otros títulos.
export async function backfillLessonContent(db: AsyncDb) {
  for (const [title, content] of Object.entries(LESSON_CONTENTS)) {
    await db.prepare("UPDATE lessons SET content = ? WHERE title = ? AND content = ''").run(content, title)
  }
}

// Backfill idempotente (Fase 4): las bases sembradas antes de la Fase 4
// no tienen planes (la tabla es nueva). Si un tenant quedó con cero
// planes, se le cargan los dos planes demo estándar. No toca tenants
// que ya tengan planes propios.
export async function backfillPlans(db: AsyncDb) {
  try {
    const tenants = await db.prepare('SELECT id FROM tenants ORDER BY id').all() as { id: number }[]
    for (const t of tenants) {
      const n = (await db.prepare('SELECT COUNT(*) AS n FROM plans WHERE tenant_id = ?').get(t.id) as { n: number }).n
      if (n > 0) continue
      const now = new Date().toISOString()
      await db.prepare('INSERT INTO plans (tenant_id, name, description, price_cents, interval, active, sort, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
        .run(t.id, 'Membresía Premium mensual', 'Acceso a todos los canales pagos de la comunidad, recursos exclusivos y sesiones de revisión.', 900, 'month', 1, now)
      await db.prepare('INSERT INTO plans (tenant_id, name, description, price_cents, interval, active, sort, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
        .run(t.id, 'Membresía Premium anual', 'Todo lo de la mensual, con dos meses de regalo por pagar el año completo.', 9000, 'year', 2, now)
    }
  }
  catch { /* bases sin la tabla planes todavia: el CREATE corre antes y la crea */ }
}

export async function seedIfEmpty(db: AsyncDb) {
  const count = await db.prepare('SELECT COUNT(*) AS n FROM tenants').get() as { n: number }
  if (count.n > 0) return

  const insert = async (sql: string, ...params: unknown[]) =>
    Number((await db.prepare(sql).run(...params)).lastInsertRowId)
  const run = async (sql: string, ...params: unknown[]) => { await db.prepare(sql).run(...params) }

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

  const tenantId = await insert('INSERT INTO tenants (slug, name, tagline, brand_color, guidelines, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    'demo', 'Comunidad Demo', 'Un espacio para aprender, compartir y crecer en comunidad.', '#2563eb', JSON.stringify(guidelines), iso(now))

  const mkUser = async (name: string, slug: string, email: string, bio: string, location: string) =>
    insert('INSERT INTO users (name, slug, email, password_hash, bio, location, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      name, slug, email, hashPassword('demo1234'), bio, location, daysAgo(90))

  const admin = await mkUser('Valeria Ríos', 'valeria-rios', 'admin@demo.local', 'Fundadora de la comunidad. Me gusta conectar personas y documentar lo que aprendemos.', 'Ciudad')
  const member = await mkUser('Marco Solís', 'marco-solis', 'member@demo.local', 'Creador de contenido y miembro desde el primer día.', 'Ciudad')
  const lucia = await mkUser('Lucía Fernández', 'lucia-fernandez', 'lucia@demo.local', 'Diseñadora. Comparto recursos y respondo dudas de herramientas.', 'Remoto')
  const diego = await mkUser('Diego Chen', 'diego-chen', 'diego@demo.local', 'Emprendedor. Aquí aprendo de ventas y de video corto.', 'Ciudad')

  await run('INSERT INTO memberships (tenant_id, user_id, role) VALUES (?, ?, ?)', tenantId, admin, 'admin')
  await run('INSERT INTO memberships (tenant_id, user_id, role) VALUES (?, ?, ?)', tenantId, member, 'member')
  await run('INSERT INTO memberships (tenant_id, user_id, role) VALUES (?, ?, ?)', tenantId, lucia, 'member')
  await run('INSERT INTO memberships (tenant_id, user_id, role) VALUES (?, ?, ?)', tenantId, diego, 'member')

  const mkGroup = async (name: string, sort: number) =>
    insert('INSERT INTO channel_groups (tenant_id, name, sort) VALUES (?, ?, ?)', tenantId, name, sort)
  const gGeneral = await mkGroup('General', 1)
  const gAyuda = await mkGroup('Ayuda', 2)
  const gRecursos = await mkGroup('Recursos', 3)

  const mkChannel = async (groupId: number, slug: string, name: string, icon: string, description: string, type: string, price: number, sort: number) =>
    insert('INSERT INTO channels (tenant_id, group_id, slug, name, icon, description, type, price_cents, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      tenantId, groupId, slug, name, icon, description, type, price, sort)

  const general = await mkChannel(gGeneral, 'general', 'General', 'i-lucide-messages-square', 'Conversación abierta para toda la comunidad.', 'free', 0, 1)
  const anuncios = await mkChannel(gGeneral, 'anuncios', 'Anuncios', 'i-lucide-megaphone', 'Novedades oficiales de la comunidad.', 'free', 0, 2)
  const ayuda = await mkChannel(gAyuda, 'ayuda', 'Ayuda y dudas', 'i-lucide-life-buoy', 'Preguntá y ayudá: nadie se queda sin respuesta.', 'free', 0, 3)
  const premium = await mkChannel(gRecursos, 'premium', 'Recursos Premium', 'i-lucide-crown', 'Plantillas, guías y sesiones exclusivas para miembros pagos.', 'paid', 2200, 4)
  const privada = await mkChannel(gRecursos, 'sala-privada', 'Sala privada', 'i-lucide-lock', 'Espacio solo para miembros registrados.', 'private', 0, 5)

  // Acceso pago de ejemplo: Lucía ya tiene acceso al canal premium.
  await run('INSERT INTO channel_access (tenant_id, user_id, channel_id, source, created_at) VALUES (?, ?, ?, ?, ?)',
    tenantId, lucia, premium, 'demo', iso(now))

  const mkPost = async (channelId: number, authorId: number, slug: string, title: string, body: string, teaser: string, mediaType: string, mediaUrl: string, pinned: number, created: string) =>
    insert('INSERT INTO posts (tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      tenantId, channelId, authorId, slug, title, body, teaser, mediaType, mediaUrl, pinned, created)

  const pWelcome = await mkPost(general, admin, 'bienvenida-a-la-comunidad', '¡Bienvenidas y bienvenidos a la Comunidad Demo!',
    'Este es nuestro espacio para compartir avances, hacer preguntas y celebrar logros.\n\nPresentate en los comentarios: contanos quién sos, qué estás construyendo y qué esperás aprender aquí. Cada semana elegimos las mejores preguntas y las respondemos en vivo.',
    'Presentate y conocé al resto de la comunidad.', 'none', '', 1, daysAgo(6))
  const pVideo = await mkPost(general, member, 'asi-grabe-mi-primer-video', 'Así grabé mi primer video sin equipo caro',
    'Grabé esta charla de ejemplo para mostrar que con buena luz y un guion corto se puede empezar hoy. Dejo el video que usamos de referencia en el taller y mis tres aprendizajes:\n\n1. El guion manda: 5 líneas claras valen más que una hora improvisada.\n2. Grabá en bloques cortos y editá después.\n3. Publicá aunque no sea perfecto: la constancia vence al equipo.',
    'Video y aprendizajes del taller de video corto.', 'video', 'https://www.youtube.com/embed/aqz-KE-bpKQ', 0, daysAgo(4))
  await mkPost(anuncios, admin, 'calendario-de-octubre', 'Calendario: dos encuentros en vivo este mes',
    'Este mes tenemos dos encuentros: una sesión de preguntas y respuestas y un taller práctico de planificación de contenido. Ambos quedan grabados y subidos a la biblioteca para miembros.\n\nRevisá la sección de Eventos para reservar tu lugar.', 'Reservá tu lugar en los encuentros del mes.', 'none', '', 0, daysAgo(3))
  await mkPost(ayuda, diego, 'como-organizo-mi-contenido', '¿Cómo organizan su contenido de la semana?',
    'Estoy probando planificar el domingo pero me quedo sin ideas a mitad de semana. ¿Usan alguna plantilla o método simple que les funcione? Gracias por compartir.', 'Busco un método simple para planificar la semana.', 'none', '', 0, daysAgo(2))
  const pPaid = await mkPost(premium, lucia, 'plantilla-de-planificacion-2026', 'Plantilla completa de planificación de contenido 2026',
    'Aquí está la plantilla completa que uso con mis clientes: calendario mensual, banco de ideas con puntuación, guiones por formato y una hoja de revisión semanal.\n\nIncluye el paso a paso para adaptarla a una sola persona o a un equipo, y los errores más comunes al planificar (con su corrección). Descargala desde la biblioteca, sección Recursos Premium.',
    'La plantilla completa, con el paso a paso, está disponible solo para miembros con acceso a este canal.', 'none', '', 0, daysAgo(1))
  await mkPost(premium, admin, 'sesion-exclusiva-revision', 'Sesión exclusiva: revisión de proyectos de miembros',
    'Cada mes reviso en detalle tres proyectos de miembros de este canal. Dejá el tuyo en los comentarios de esta publicación para entrar en la selección de este mes.', 'Traé tu proyecto a la revisión mensual.', 'none', '', 0, daysAgo(1, 12))
  await mkPost(privada, admin, 'notas-de-la-sala-privada', 'Notas de la sala privada',
    'Este canal es solo para miembros registrados. Aquí coordinamos las pruebas internas y los adelantos antes de publicarlos en el resto de la comunidad.', 'Coordinación interna de miembros.', 'none', '', 0, daysAgo(0, 9))

  const mkComment = async (postId: number, authorId: number, body: string, created: string) =>
    run('INSERT INTO comments (tenant_id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)', tenantId, postId, authorId, body, created)
  await mkComment(pWelcome, member, '¡Hola! Soy Marco, creo contenido para pequeños negocios y quiero mejorar mi constancia al publicar.', daysAgo(6, 11))
  await mkComment(pWelcome, lucia, 'Lucía por aquí, diseñadora. Feliz de ayudar con recursos visuales cuando los necesiten.', daysAgo(6, 12))
  await mkComment(pVideo, diego, 'El punto del guion corto me cambió la forma de grabar. Gracias por compartirlo.', daysAgo(4, 16))
  await mkComment(pPaid, member, 'La plantilla se ve justo como lo que necesito para ordenar mi mes.', daysAgo(1, 13))

  const mkReaction = async (postId: number, userId: number, type: string) =>
    run('INSERT OR IGNORE INTO reactions (tenant_id, post_id, user_id, type) VALUES (?, ?, ?, ?)', tenantId, postId, userId, type)
  await mkReaction(pWelcome, member, 'love'); await mkReaction(pWelcome, lucia, 'love'); await mkReaction(pWelcome, diego, 'clap')
  await mkReaction(pVideo, admin, 'fire'); await mkReaction(pVideo, lucia, 'like'); await mkReaction(pVideo, diego, 'fire')
  await mkReaction(pPaid, lucia, 'love')

  // Chat del canal general (Fase 3): conversación semilla breve.
  const mkChat = async (channelId: number, authorId: number, body: string, created: string) =>
    run('INSERT INTO chat_messages (tenant_id, channel_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)', tenantId, channelId, authorId, body, created)
  await mkChat(general, member, '¿Alguien más está armando su calendario de contenido esta semana? Yo arranco hoy.', daysAgo(0, 9))
  await mkChat(general, lucia, 'Yo lo dejé listo ayer con la plantilla del canal premium. ¡Funciona muy bien!', daysAgo(0, 10))
  await mkChat(general, admin, 'Este jueves lo revisamos en la sesión en vivo: traigan sus borradores y lo pulimos entre todos.', daysAgo(0, 10))

  // Mensaje directo semilla: Valeria le escribe a Marco (queda sin leer
  // para que member@demo.local vea el indicador de no leídos).
  await run("INSERT INTO dm_messages (tenant_id, sender_id, recipient_id, body, read_at, created_at) VALUES (?, ?, ?, ?, '', ?)",
    tenantId, admin, member, '¡Hola, Marco! ¿Querés compartir tu avance en la sesión en vivo de este mes? Creo que le va a servir a varios.', daysAgo(0, 8))

  for (const uid of [admin, member, lucia, diego])
    for (const cid of [general, anuncios, ayuda])
      await run('INSERT OR IGNORE INTO follows (tenant_id, user_id, channel_id) VALUES (?, ?, ?)', tenantId, uid, cid)

  // Cursos
  const mkCourse = async (slug: string, title: string, description: string, level: string, price: number) =>
    insert('INSERT INTO courses (tenant_id, slug, title, description, level, price_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      tenantId, slug, title, description, level, price, iso(now))
  const c1 = await mkCourse('crea-tu-comunidad', 'Creá tu primera comunidad en línea', 'De cero a una comunidad activa: estructura, reglas, canales y los primeros 90 días de contenido.', 'Principiante', 0)
  const c2 = await mkCourse('video-corto-que-conecta', 'Video corto que conecta', 'Guion, grabación y edición de videos cortos que la gente sí termina de ver.', 'Intermedio', 2900)
  const mkChapter = async (courseId: number, title: string, sort: number) =>
    insert('INSERT INTO chapters (tenant_id, course_id, title, sort) VALUES (?, ?, ?, ?)', tenantId, courseId, title, sort)
  const mkLesson = async (chapterId: number, title: string, mins: number, free: number, sort: number) =>
    run('INSERT INTO lessons (tenant_id, chapter_id, title, duration_min, is_free, sort, content) VALUES (?, ?, ?, ?, ?, ?, ?)', tenantId, chapterId, title, mins, free, sort, LESSON_CONTENTS[title] || '')
  const ch1 = await mkChapter(c1, 'Fundamentos', 1)
  await mkLesson(ch1, 'Qué hace que una comunidad funcione', 9, 1, 1)
  await mkLesson(ch1, 'Definí tu promesa y tu audiencia', 12, 0, 2)
  const ch2 = await mkChapter(c1, 'Puesta en marcha', 2)
  await mkLesson(ch2, 'Canales y reglas claras desde el día uno', 14, 0, 1)
  await mkLesson(ch2, 'Tu plan de contenido de 90 días', 18, 0, 2)
  const ch3 = await mkChapter(c2, 'Guion y grabación', 1)
  await mkLesson(ch3, 'El gancho de los primeros 3 segundos', 8, 1, 1)
  await mkLesson(ch3, 'Luz y sonido con lo que ya tenés', 11, 0, 2)
  const ch4 = await mkChapter(c2, 'Edición y publicación', 2)
  await mkLesson(ch4, 'Cortes que mantienen la atención', 15, 0, 1)
  await mkLesson(ch4, 'Títulos y portadas que invitan a ver', 10, 0, 2)

  // Eventos futuros
  const mkEvent = async (slug: string, title: string, description: string, start: string, end: string, location: string, category: string, hostId: number) =>
    insert('INSERT INTO events (tenant_id, slug, title, description, starts_at, ends_at, location, category, host_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      tenantId, slug, title, description, start, end, location, category, hostId, iso(now))
  const e1 = await mkEvent('sesion-preguntas-en-vivo', 'Sesión de preguntas en vivo', 'Traé tus dudas sobre comunidad, contenido y ventas. Respondemos en orden de llegada y la grabación queda en la biblioteca.', daysFromNow(9), daysFromNow(9, 16), 'En línea · sala de la comunidad', 'En vivo', admin)
  const e2 = await mkEvent('taller-planificacion-contenido', 'Taller: planificá un mes de contenido en una tarde', 'Taller práctico con plantilla incluida. Salís con tu calendario del próximo mes listo.', daysFromNow(16, 17), daysFromNow(16, 19), 'En línea · sala de la comunidad', 'Taller', lucia)
  await run('INSERT OR IGNORE INTO rsvps (tenant_id, event_id, user_id) VALUES (?, ?, ?)', tenantId, e1, member)
  await run('INSERT OR IGNORE INTO rsvps (tenant_id, event_id, user_id) VALUES (?, ?, ?)', tenantId, e1, lucia)
  await run('INSERT OR IGNORE INTO rsvps (tenant_id, event_id, user_id) VALUES (?, ?, ?)', tenantId, e2, diego)
  await run('INSERT OR IGNORE INTO rsvps (tenant_id, event_id, user_id) VALUES (?, ?, ?)', tenantId, e2, member)

  // Planes de membresía (Fase 4): incluyen acceso a los canales pagos.
  const mkPlan = async (name: string, description: string, price: number, interval: string, sort: number) =>
    run('INSERT INTO plans (tenant_id, name, description, price_cents, interval, active, sort, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
      tenantId, name, description, price, interval, sort, iso(now))
  await mkPlan('Membresía Premium mensual', 'Acceso a todos los canales pagos de la comunidad, recursos exclusivos y sesiones de revisión.', 900, 'month', 1)
  await mkPlan('Membresía Premium anual', 'Todo lo de la mensual, con dos meses de regalo por pagar el año completo.', 9000, 'year', 2)

  // Biblioteca
  const mkItem = async (title: string, kind: string, category: string, size: string, downloads: number, locked: number, ago: number) =>
    run('INSERT INTO library_items (tenant_id, title, kind, category, size_label, downloads, locked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      tenantId, title, kind, category, size, downloads, locked, daysAgo(ago))
  await mkItem('Guía de bienvenida de la comunidad (PDF)', 'pdf', 'Guías', '1.2 MB', 42, 0, 20)
  await mkItem('Plantilla de planificación de contenido', 'doc', 'Recursos Premium', '86 KB', 17, 1, 5)
  await mkItem('Grabación: taller de video corto', 'video', 'Talleres', '48 min', 23, 0, 8)
  await mkItem('Banco de portadas editables', 'image', 'Recursos Premium', '24 MB', 9, 1, 3)
  await mkItem('Audio: rutina de enfoque para crear', 'audio', 'Bienestar', '12 min', 31, 0, 12)
  await mkItem('Directorio de herramientas recomendadas', 'link', 'Guías', 'Enlace', 56, 0, 25)
}
