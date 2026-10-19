// Capa de datos asíncrona unificada.
//
// Interfaz única tipo `prepare(sql).get/all/run` (todo devuelve Promesas)
// con dos adaptadores por debajo:
//   - Cloudflare D1 (producción): si el request trae el binding
//     `event.context.cloudflare.env.DB`, se usa D1
//     (`prepare(sql).bind(...).first()/all()/run()`).
//   - better-sqlite3 (desarrollo local con `npm run dev` en Node):
//     mismo SQL, llamadas síncronas envueltas en la interfaz asíncrona.
//     El binario nativo se importa de forma perezosa SOLO en este camino:
//     en el Worker nunca se carga.
//
// El esquema (fuente de verdad: server/db/schema.ts) es SQL compatible
// con SQLite y con D1. En ambos modos las tablas se auto-crean con
// CREATE TABLE IF NOT EXISTS y la base se siembra si está vacía al
// primer request (costo: un puñado de CREATE IF NOT EXISTS por proceso/
// isolate en D1; aceptable para el MVP y documentado en el README).
// Para producción también se puede aplicar `scripts/d1-init.sql` con
// `wrangler d1 execute` (ver README, sección Deploy).

export interface RunResult { changes: number, lastInsertRowId: number | null }

export interface DbStatement {
  // get/all devuelven `any` a propósito (como hacía better-sqlite3 sin
  // genéricos): cada handler castea al tipo de fila que espera.
  get: (...params: unknown[]) => Promise<any>
  all: (...params: unknown[]) => Promise<any[]>
  run: (...params: unknown[]) => Promise<RunResult>
}

export interface AsyncDb {
  kind: 'd1' | 'sqlite'
  prepare: (sql: string) => DbStatement
  exec: (sql: string) => Promise<void>
}

// --- Tipos mínimos del binding D1 (estructurales; sin depender de
// @cloudflare/workers-types) ---
interface D1PreparedLike {
  bind: (...values: unknown[]) => D1PreparedLike
  first: () => Promise<Record<string, unknown> | null>
  all: () => Promise<{ results: Record<string, unknown>[] }>
  run: () => Promise<{ meta?: { last_row_id?: number, changes?: number } }>
}
interface D1DatabaseLike { prepare: (sql: string) => D1PreparedLike }

export const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, tagline TEXT NOT NULL DEFAULT '', brand_color TEXT NOT NULL DEFAULT '#2563eb', guidelines TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memberships (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'member');
CREATE UNIQUE INDEX IF NOT EXISTS memberships_tenant_user ON memberships (tenant_id, user_id);
CREATE TABLE IF NOT EXISTS channel_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS channels (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, group_id INTEGER, slug TEXT NOT NULL, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'i-lucide-hash', description TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT 'free', price_cents INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX IF NOT EXISTS channels_tenant_slug ON channels (tenant_id, slug);
CREATE TABLE IF NOT EXISTS follows (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, channel_id INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS follows_unique ON follows (tenant_id, user_id, channel_id);
CREATE TABLE IF NOT EXISTS channel_access (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, channel_id INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'demo', created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS channel_access_unique ON channel_access (tenant_id, user_id, channel_id);
CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, channel_id INTEGER NOT NULL, author_id INTEGER NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', teaser TEXT NOT NULL DEFAULT '', media_type TEXT NOT NULL DEFAULT 'none', media_url TEXT NOT NULL DEFAULT '', pinned INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS posts_channel_slug ON posts (channel_id, slug);
CREATE TABLE IF NOT EXISTS reactions (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL, type TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS reactions_unique ON reactions (post_id, user_id, type);
CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, post_id INTEGER NOT NULL, author_id INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bookmarks (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS bookmarks_unique ON bookmarks (tenant_id, post_id, user_id);
CREATE TABLE IF NOT EXISTS courses (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', level TEXT NOT NULL DEFAULT 'Principiante', price_cents INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS courses_tenant_slug ON courses (tenant_id, slug);
CREATE TABLE IF NOT EXISTS chapters (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, course_id INTEGER NOT NULL, title TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS lessons (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, chapter_id INTEGER NOT NULL, title TEXT NOT NULL, duration_min INTEGER NOT NULL DEFAULT 0, is_free INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS enrollments (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, course_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_unique ON enrollments (tenant_id, course_id, user_id);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, location TEXT NOT NULL DEFAULT 'En línea', category TEXT NOT NULL DEFAULT 'General', host_id INTEGER, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS events_tenant_slug ON events (tenant_id, slug);
CREATE TABLE IF NOT EXISTS rsvps (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, event_id INTEGER NOT NULL, user_id INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS rsvps_unique ON rsvps (tenant_id, event_id, user_id);
CREATE TABLE IF NOT EXISTS library_items (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'General', size_label TEXT NOT NULL DEFAULT '', downloads INTEGER NOT NULL DEFAULT 0, locked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, actor_id INTEGER, type TEXT NOT NULL, title TEXT NOT NULL, link TEXT NOT NULL DEFAULT '', is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS notifications_user_read ON notifications (user_id, is_read, created_at);
CREATE TABLE IF NOT EXISTS lesson_progress (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, lesson_id INTEGER NOT NULL, completed_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS lesson_progress_unique ON lesson_progress (tenant_id, user_id, lesson_id);
CREATE TABLE IF NOT EXISTS uploads (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, key TEXT NOT NULL, filename TEXT NOT NULL DEFAULT '', content_type TEXT NOT NULL DEFAULT '', size INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, channel_id INTEGER NOT NULL, author_id INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS chat_messages_channel ON chat_messages (channel_id, id);
CREATE TABLE IF NOT EXISTS dm_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, sender_id INTEGER NOT NULL, recipient_id INTEGER NOT NULL, body TEXT NOT NULL, read_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS dm_messages_pair ON dm_messages (tenant_id, sender_id, recipient_id, id);
CREATE INDEX IF NOT EXISTS dm_messages_unread ON dm_messages (recipient_id, read_at);
CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', price_cents INTEGER NOT NULL DEFAULT 0, interval TEXT NOT NULL DEFAULT 'month', active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS member_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, plan_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active', source TEXT NOT NULL DEFAULT 'stripe', stripe_subscription_id TEXT NOT NULL DEFAULT '', stripe_customer_id TEXT NOT NULL DEFAULT '', current_period_end TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS member_subscriptions_unique ON member_subscriptions (tenant_id, user_id, plan_id);
CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, kind TEXT NOT NULL, item_id INTEGER NOT NULL DEFAULT 0, plan_id INTEGER NOT NULL DEFAULT 0, amount_cents INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'usd', status TEXT NOT NULL DEFAULT 'pending', stripe_session_id TEXT NOT NULL DEFAULT '', stripe_payment_intent TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS payments_session_unique ON payments (stripe_session_id);
CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, processed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS email_log (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER, to_email TEXT NOT NULL, kind TEXT NOT NULL, subject TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS email_log_tenant ON email_log (tenant_id, created_at);
CREATE TABLE IF NOT EXISTS tenant_domains (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, domain TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_domains_unique ON tenant_domains (domain);
CREATE TABLE IF NOT EXISTS poll_options (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, post_id INTEGER NOT NULL, label TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS poll_options_post ON poll_options (post_id, sort);
CREATE TABLE IF NOT EXISTS poll_votes (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, post_id INTEGER NOT NULL, option_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS poll_votes_unique ON poll_votes (post_id, user_id);
CREATE TABLE IF NOT EXISTS user_prefs (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL DEFAULT '');
CREATE UNIQUE INDEX IF NOT EXISTS user_prefs_unique ON user_prefs (tenant_id, user_id, key);
CREATE TABLE IF NOT EXISTS point_events (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, kind TEXT NOT NULL, ref_id INTEGER NOT NULL DEFAULT 0, points INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS point_events_unique ON point_events (tenant_id, user_id, kind, ref_id);
CREATE INDEX IF NOT EXISTS point_events_user ON point_events (tenant_id, user_id);
CREATE TABLE IF NOT EXISTS chat_rooms (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, name TEXT NOT NULL, created_by INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chat_room_members (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, room_id INTEGER NOT NULL, user_id INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS chat_room_members_unique ON chat_room_members (room_id, user_id);
CREATE TABLE IF NOT EXISTS chat_room_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, room_id INTEGER NOT NULL, author_id INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS chat_room_messages_room ON chat_room_messages (room_id, id);
CREATE TABLE IF NOT EXISTS user_blocks (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, blocker_id INTEGER NOT NULL, blocked_id INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS user_blocks_unique ON user_blocks (tenant_id, blocker_id, blocked_id);
CREATE TABLE IF NOT EXISTS user_hidden_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, post_id INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS user_hidden_posts_unique ON user_hidden_posts (tenant_id, user_id, post_id);
CREATE TABLE IF NOT EXISTS user_follows (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, follower_id INTEGER NOT NULL, followee_id INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS user_follows_unique ON user_follows (tenant_id, follower_id, followee_id);
CREATE INDEX IF NOT EXISTS user_follows_followee ON user_follows (tenant_id, followee_id);
CREATE TABLE IF NOT EXISTS gamification_levels (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, name TEXT NOT NULL, min_points INTEGER NOT NULL DEFAULT 0, icon TEXT NOT NULL DEFAULT 'i-lucide-award', position INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX IF NOT EXISTS gamification_levels_tenant_min ON gamification_levels (tenant_id, min_points);
CREATE TABLE IF NOT EXISTS gamification_points (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, action TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX IF NOT EXISTS gamification_points_tenant_action ON gamification_points (tenant_id, action);
CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, reporter_id INTEGER NOT NULL, target_type TEXT NOT NULL DEFAULT 'post', target_id INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT 'otro', note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', action TEXT NOT NULL DEFAULT 'none', resolved_by INTEGER, resolved_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS reports_tenant_status ON reports (tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS reports_target ON reports (tenant_id, target_type, target_id, status);
CREATE TABLE IF NOT EXISTS invitations (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'email', email TEXT NOT NULL DEFAULT '', token TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', uses INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL DEFAULT '', created_by INTEGER, accepted_by INTEGER, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS invitations_token ON invitations (token);
CREATE INDEX IF NOT EXISTS invitations_tenant ON invitations (tenant_id, status, created_at);
CREATE TABLE IF NOT EXISTS join_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, answers TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'pending', decided_by INTEGER, decided_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS join_requests_tenant ON join_requests (tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS join_requests_user ON join_requests (tenant_id, user_id, created_at);
CREATE TABLE IF NOT EXISTS member_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS member_tags_tenant_name ON member_tags (tenant_id, name);
CREATE TABLE IF NOT EXISTS member_tag_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, user_id INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS member_tag_assignments_unique ON member_tag_assignments (tenant_id, tag_id, user_id);
CREATE INDEX IF NOT EXISTS member_tag_assignments_user ON member_tag_assignments (tenant_id, user_id);
CREATE TABLE IF NOT EXISTS access_links (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, token TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT NOT NULL DEFAULT '', created_by INTEGER, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS access_links_token ON access_links (token);
CREATE TABLE IF NOT EXISTS certificate_blueprints (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, name TEXT NOT NULL, accent_color TEXT NOT NULL DEFAULT '#2563eb', heading_text TEXT NOT NULL DEFAULT '', body_text TEXT NOT NULL DEFAULT '', signer_name TEXT NOT NULL DEFAULT '', signer_title TEXT NOT NULL DEFAULT '', show_logo INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS certificate_blueprints_tenant ON certificate_blueprints (tenant_id, active);
CREATE TABLE IF NOT EXISTS certificates (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, course_id INTEGER NOT NULL, blueprint_id INTEGER, code TEXT NOT NULL, member_name TEXT NOT NULL DEFAULT '', course_title TEXT NOT NULL DEFAULT '', community_name TEXT NOT NULL DEFAULT '', finished_at TEXT NOT NULL DEFAULT '', design_snapshot TEXT NOT NULL DEFAULT '{}', issued_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_code ON certificates (code);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_unique ON certificates (tenant_id, user_id, course_id);
`

// Migraciones aditivas (Fase 2) para bases creadas en la Fase 1 — ya hay
// datos demo en producción sobre D1, y el esquema nuevo solo suma:
// tablas nuevas (arriba) y columnas nuevas (abajo). Los ALTER corren en
// try/catch: si la columna ya existe, SQLite/D1 lanzan "duplicate column"
// y se ignora. Idempotente y seguro en ambos motores.
const MIGRATIONS = [
  `ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE lessons ADD COLUMN content TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE library_items ADD COLUMN file_key TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE library_items ADD COLUMN file_name TEXT NOT NULL DEFAULT ''`,
  // Fase 3: última conexión registrada al abrir un WebSocket de tiempo
  // real (presencia aproximada en perfiles y lista de miembros).
  `ALTER TABLE users ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT ''`,
  // Fase 5: estado de publicación (published|draft|scheduled), hora
  // programada y tipo de post (post|poll) para encuestas.
  `ALTER TABLE posts ADD COLUMN status TEXT NOT NULL DEFAULT 'published'`,
  `ALTER TABLE posts ADD COLUMN scheduled_at TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE posts ADD COLUMN kind TEXT NOT NULL DEFAULT 'post'`,
  // Fase 5: versión de sesión — al cambiar la contraseña se incrementa
  // y todas las sesiones anteriores (sin ese número) dejan de valer.
  `ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0`,
  // Fase 5: textos legales editables por tenant.
  `ALTER TABLE tenants ADD COLUMN terms TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE tenants ADD COLUMN privacy TEXT NOT NULL DEFAULT ''`,
  // Fase 5 (gestión admin): cursos con estado e imagen, lecciones con video.
  `ALTER TABLE courses ADD COLUMN status TEXT NOT NULL DEFAULT 'published'`,
  `ALTER TABLE courses ADD COLUMN image_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE lessons ADD COLUMN video_url TEXT NOT NULL DEFAULT ''`,
  // Fase 5: agenda por sesiones del evento (texto, una sesión por línea).
  `ALTER TABLE events ADD COLUMN agenda TEXT NOT NULL DEFAULT ''`,
  // Fase 6: foto de portada real y sitio web del miembro (perfil).
  `ALTER TABLE users ADD COLUMN cover_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN website TEXT NOT NULL DEFAULT ''`,
  // Fase 7: el autor puede desactivar los comentarios de su post
  // (allow_comments, por defecto permitidos) y marca de edición
  // (edited_at se completa al editar un borrador/programado).
  `ALTER TABLE posts ADD COLUMN allow_comments INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE posts ADD COLUMN edited_at TEXT NOT NULL DEFAULT ''`,
  // Fase 8: cuerpo con formato (body_html, sanitizado en servidor —
  // `body` sigue siendo el texto plano derivado) y post anónimo real.
  `ALTER TABLE posts ADD COLUMN body_html TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE posts ADD COLUMN anonymous INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE posts ADD COLUMN attachment_name TEXT NOT NULL DEFAULT ''`,
  // Fase 8: lecciones con tipo (kind) y campos por tipo. is_free ya
  // existía y oficia de «vista previa gratuita». unlock_offset_days
  // queda NULL cuando la lección no tiene drip por inscripción.
  `ALTER TABLE lessons ADD COLUMN kind TEXT NOT NULL DEFAULT 'text'`,
  `ALTER TABLE lessons ADD COLUMN content_html TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE lessons ADD COLUMN file_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE lessons ADD COLUMN file_name TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE lessons ADD COLUMN embed_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE lessons ADD COLUMN allow_download INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE lessons ADD COLUMN prerequisite INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE lessons ADD COLUMN resource_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE lessons ADD COLUMN resource_name TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE lessons ADD COLUMN unlock_offset_days INTEGER`,
  `ALTER TABLE lessons ADD COLUMN unlock_at TEXT NOT NULL DEFAULT ''`,
  // Fase 8: estado de la lección — las nuevas nacen en borrador desde
  // el estudio y no se ven en el curso hasta publicarlas (las
  // anteriores a la fase quedan 'published', su comportamiento).
  `ALTER TABLE lessons ADD COLUMN status TEXT NOT NULL DEFAULT 'published'`,
  // Fase 8: cursos con descripción corta y rica, banner, visibilidad
  // (public|private|secret), límite de inscritos, drip y certificado
  // por curso (encendido por defecto: las bases anteriores ya emitían
  // certificado al 100% y no cambia su comportamiento).
  `ALTER TABLE courses ADD COLUMN short_description TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE courses ADD COLUMN description_html TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE courses ADD COLUMN banner_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE courses ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'`,
  `ALTER TABLE courses ADD COLUMN enroll_limit INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE courses ADD COLUMN drip_mode TEXT NOT NULL DEFAULT 'none'`,
  `ALTER TABLE courses ADD COLUMN certificate_enabled INTEGER NOT NULL DEFAULT 1`,
  // Fase 8: descripción de eventos con el editor clásico.
  `ALTER TABLE events ADD COLUMN description_html TEXT NOT NULL DEFAULT ''`,
  // Fase 12: revisión previa opcional de publicaciones por tenant
  // (0 = apagada, como hoy; 1 = los posts de miembros nacen en
  // 'review' hasta que un admin los aprueba). La tabla `reports` es
  // nueva y vive en CREATE_SQL (IF NOT EXISTS): no necesita ALTER.
  `ALTER TABLE tenants ADD COLUMN moderation_review INTEGER NOT NULL DEFAULT 0`,
  // Fase 14: estado de la membresía (active|pending|declined|
  // suspended|restricted). Las filas existentes quedan 'active'.
  // pending = esperando aprobación de ingreso; declined = solicitud
  // rechazada (puede volver a pedir tras el cooldown); suspended =
  // no puede iniciar sesión; restricted = entra y lee, no escribe.
  `ALTER TABLE memberships ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
  // Fase 14: ingreso de miembros por tenant — aprobación previa
  // (0/1), preguntas de ingreso (JSON, hasta 6 textos), días de
  // espera tras un rechazo, canales de auto-ingreso (JSON, hasta 2
  // ids) y compuertas por nivel (JSON: acción → umbral de puntos del nivel, 0 =
  // sin compuerta). Las tablas nuevas (invitations, join_requests,
  // member_tags, member_tag_assignments, access_links) viven en
  // CREATE_SQL (IF NOT EXISTS): no necesitan ALTER.
  `ALTER TABLE tenants ADD COLUMN join_approval INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tenants ADD COLUMN join_questions TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE tenants ADD COLUMN join_cooldown_days INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tenants ADD COLUMN auto_join_channels TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE tenants ADD COLUMN level_gates TEXT NOT NULL DEFAULT '{}'`,
  // Fase 15: privacidad y presentación. TODOS los defaults reproducen
  // el comportamiento anterior a la fase: comunidad privada (las
  // superficies públicas nuevas quedan apagadas), directorio y
  // biblioteca «de miembros», anticipo de canales pagos en modo
  // vista previa, registro abierto y sin marca personalizada. Nada
  // cambia hasta que un administrador toca un ajuste.
  `ALTER TABLE tenants ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'`,
  `ALTER TABLE tenants ADD COLUMN directory_audience TEXT NOT NULL DEFAULT 'members'`,
  `ALTER TABLE tenants ADD COLUMN library_audience TEXT NOT NULL DEFAULT 'members'`,
  `ALTER TABLE tenants ADD COLUMN paid_preview_mode TEXT NOT NULL DEFAULT 'preview'`,
  `ALTER TABLE tenants ADD COLUMN paid_preview_pct INTEGER NOT NULL DEFAULT 25`,
  `ALTER TABLE tenants ADD COLUMN paid_preview_chars INTEGER NOT NULL DEFAULT 350`,
  `ALTER TABLE tenants ADD COLUMN paid_media_mode TEXT NOT NULL DEFAULT 'count'`,
  `ALTER TABLE tenants ADD COLUMN paid_title_mode TEXT NOT NULL DEFAULT 'full'`,
  `ALTER TABLE tenants ADD COLUMN paid_locked_where TEXT NOT NULL DEFAULT 'feed'`,
  `ALTER TABLE tenants ADD COLUMN feed_sidebar TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE tenants ADD COLUMN nav_menu TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE tenants ADD COLUMN anyone_can_register INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE tenants ADD COLUMN logo_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE tenants ADD COLUMN logo_dark_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE tenants ADD COLUMN icon_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE tenants ADD COLUMN favicon_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE tenants ADD COLUMN support_email TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE tenants ADD COLUMN website_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE tenants ADD COLUMN social_links TEXT NOT NULL DEFAULT '[]'`,
  // Fase 16: canales archivables y «quién puede publicar». archived_at
  // vacío = canal activo; con fecha = archivado (desaparece de la
  // navegación, el feed y la búsqueda de los miembros; sus posts
  // quedan guardados). post_permission: 'members' (publican los
  // miembros con acceso, como siempre) | 'staff' (solo el equipo
  // publica posts nuevos; comentar y reaccionar no se tocan).
  `ALTER TABLE channels ADD COLUMN archived_at TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE channels ADD COLUMN post_permission TEXT NOT NULL DEFAULT 'members'`,
  // Fase 16: diseño de certificado (blueprint) elegido por curso;
  // NULL = diseño por defecto del sistema. Las tablas
  // certificate_blueprints y certificates viven en CREATE_SQL.
  `ALTER TABLE courses ADD COLUMN certificate_blueprint_id INTEGER`,
]

async function runMigrations(db: AsyncDb): Promise<void> {
  for (const sql of MIGRATIONS) {
    try { await db.prepare(sql).run() }
    catch { /* la columna ya existe: nada que hacer */ }
  }
}

function splitSql(sql: string): string[] {
  return sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean)
}

async function initDb(db: AsyncDb): Promise<void> {
  // CREATE TABLE/INDEX IF NOT EXISTS: idempotente en SQLite y en D1.
  for (const stmt of splitSql(CREATE_SQL)) await db.prepare(stmt).run()
  await runMigrations(db)
  // Fase 8: backfill de tipos de lección — las lecciones anteriores a
  // la fase nacieron con kind='text'; las que SOLO traían video (sin
  // contenido de texto) quedan como lecciones de video. La condición
  // sobre el contenido vacío hace que nunca reclasifique una lección
  // de texto real en arranques posteriores.
  try { await db.prepare("UPDATE lessons SET kind = 'video' WHERE kind = 'text' AND video_url != '' AND content = '' AND content_html = ''").run() }
  catch { /* bases sin la columna todavía */ }
  const { seedIfEmpty, backfillLessonContent, backfillPlans } = await import('./seed')
  await seedIfEmpty(db)
  await backfillLessonContent(db)
  await backfillPlans(db)
}

// --- Adaptador D1 ---
function wrapD1(d1: D1DatabaseLike): AsyncDb {
  return {
    kind: 'd1',
    prepare(sql: string): DbStatement {
      return {
        async get(...params) {
          const row = await d1.prepare(sql).bind(...params).first()
          return row ?? undefined
        },
        async all(...params) {
          const res = await d1.prepare(sql).bind(...params).all()
          return res.results ?? []
        },
        async run(...params) {
          const res = await d1.prepare(sql).bind(...params).run()
          return { changes: res.meta?.changes ?? 0, lastInsertRowId: res.meta?.last_row_id ?? null }
        },
      }
    },
    async exec(sql: string) {
      for (const stmt of splitSql(sql)) await d1.prepare(stmt).run()
    },
  }
}

// --- Adaptador SQLite local (better-sqlite3, import perezoso) ---
async function createLocalDb(): Promise<AsyncDb> {
  const { existsSync, mkdirSync } = await import('node:fs')
  const { dirname, join } = await import('node:path')
  const { default: Database } = await import('better-sqlite3')
  const config = useRuntimeConfig()
  const path = (config.dbPath as string) || join(process.cwd(), 'data', 'comunidad.db')
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true })
  // El tipo concreto de better-sqlite3 se trata como `any` a propósito:
  // es el driver local y no forma parte del contrato de la capa.
  const raw = new Database(path) as any
  raw.pragma('journal_mode = WAL')
  raw.pragma('foreign_keys = ON')
  const db: AsyncDb = {
    kind: 'sqlite',
    prepare(sql: string): DbStatement {
      return {
        async get(...params) { return raw.prepare(sql).get(...params) },
        async all(...params) { return raw.prepare(sql).all(...params) },
        async run(...params) {
          const r = raw.prepare(sql).run(...params) as { changes: number, lastInsertRowid: number | bigint }
          return { changes: r.changes, lastInsertRowId: Number(r.lastInsertRowid) }
        },
      }
    },
    async exec(sql: string) { raw.exec(sql) },
  }
  await initDb(db)
  return db
}

let _localInit: Promise<AsyncDb> | null = null
const _d1Init = new WeakMap<object, Promise<AsyncDb>>()

/**
 * Devuelve la base del request actual: D1 si el binding está presente
 * (Worker / wrangler dev), SQLite local en `npm run dev` de Node.
 * Inicializa esquema+seed una sola vez por base/proceso.
 * El evento se tipa como `any` a propósito: el binding D1 llega en
 * `event.context.cloudflare.env` (runtime de Nitro/Cloudflare), que los
 * tipos de H3 no declaran.
 */
export async function dbFor(event?: any): Promise<AsyncDb> {
  // El binding D1 puede venir por tres caminos según el tipo de request:
  // 1) event.context.cloudflare.env — requests HTTP reales (preset Nitro).
  // 2) event.context._platform.cloudflare.env — contexto de plataforma Nitro.
  // 3) globalThis.__env__ — lo setea el entry de Nitro/Cloudflare en cada
  //    fetch; es el ÚNICO que sobrevive a los subrequests internos del SSR
  //    (localFetch crea eventos nuevos sin contexto de plataforma).
  const d1 = (event?.context?.cloudflare?.env?.DB
    ?? event?.context?._platform?.cloudflare?.env?.DB
    ?? (globalThis as any).__env__?.DB) as D1DatabaseLike | undefined
  if (d1 && typeof d1.prepare === 'function') {
    let pending = _d1Init.get(d1 as object)
    if (!pending) {
      pending = (async () => {
        const db = wrapD1(d1)
        await initDb(db)
        return db
      })()
      _d1Init.set(d1 as object, pending)
    }
    return pending
  }
  if (!_localInit) _localInit = createLocalDb()
  return _localInit
}

export function slugify(input: string): string {
  return input.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80) || 'item'
}

export function nowIso(): string {
  return new Date().toISOString()
}
