// Canonical executable SQLite/D1 schema. Legacy alterations run once per schema version.
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
CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, post_id INTEGER NOT NULL, author_id INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS comment_reactions (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, comment_id INTEGER NOT NULL, user_id INTEGER NOT NULL, type TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT '');
CREATE UNIQUE INDEX IF NOT EXISTS comment_reactions_unique ON comment_reactions (comment_id, user_id);
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
CREATE UNIQUE INDEX IF NOT EXISTS payments_session_unique ON payments (stripe_session_id) WHERE stripe_session_id <> '';
CREATE TABLE IF NOT EXISTS manual_payment_methods (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, type TEXT NOT NULL DEFAULT 'transferencia', title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
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
CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS community_owners (tenant_id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE, request_key TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS library_folders (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS library_folder_names ON library_folders (tenant_id, name COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS saved_messages (tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, kind TEXT NOT NULL, message_id INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (tenant_id, user_id, kind, message_id));
CREATE TABLE IF NOT EXISTS oauth_identities (tenant_id INTEGER NOT NULL, provider TEXT NOT NULL, subject TEXT NOT NULL, user_id INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (tenant_id, provider, subject), UNIQUE (tenant_id, provider, user_id));
CREATE TABLE IF NOT EXISTS oauth_flows (state_hash TEXT PRIMARY KEY, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, token_version INTEGER NOT NULL, verifier TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS event_reminders (tenant_id INTEGER NOT NULL, event_id INTEGER NOT NULL, user_id INTEGER NOT NULL, reminder_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', lease_until INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY (tenant_id, event_id, user_id, reminder_key));
`

// Migraciones aditivas (Fase 2) para bases creadas en la Fase 1 — ya hay
// datos demo en producción sobre D1, y el esquema nuevo solo suma:
// tablas nuevas (arriba) y columnas nuevas (abajo). Los ALTER corren en
// try/catch: si la columna ya existe, SQLite/D1 lanzan "duplicate column"
// y se ignora. Idempotente y seguro en ambos motores.
export const SCHEMA_VERSION = 'event-oauth-billing-v1'
export const MIGRATIONS = [
  `ALTER TABLE member_subscriptions ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE events ADD COLUMN series_id TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE events ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC'`,
  `ALTER TABLE dm_messages ADD COLUMN reply_to INTEGER`,
  `ALTER TABLE chat_room_messages ADD COLUMN reply_to INTEGER`,
  `ALTER TABLE library_items ADD COLUMN folder_id INTEGER`,
  `ALTER TABLE library_items ADD COLUMN archived_at TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE tenants ADD COLUMN name_en TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE memberships ADD COLUMN status_reason TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE memberships ADD COLUMN status_changed_at TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE memberships ADD COLUMN status_changed_by INTEGER`,
  `CREATE TABLE IF NOT EXISTS membership_events (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER NOT NULL, actor_id INTEGER, action TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS membership_events_history ON membership_events (tenant_id, user_id, id DESC)`,
  `ALTER TABLE member_subscriptions ADD COLUMN stripe_event_created INTEGER NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS auth_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, resets_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS auth_attempts_expiry ON auth_attempts (resets_at)`,
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
  // Fase 17: dinero visible. Moneda del tenant (default 'USD': el
  // comportamiento de siempre) y pagos manuales APAGADOS por defecto:
  // nada cambia hasta que el admin elige moneda o enciende los
  // manuales. En payments: pasarela ('stripe'|'manual'; las filas
  // viejas son de Stripe), referencia/nota del comprador manual,
  // método elegido y quién/cuándo decidió la revisión. En plans:
  // orden de exhibición en la página de planes y plan destacado
  // (display_order se espeja con sort al reordenar; el backfill de
  // initDb lo inicializa desde sort en bases anteriores).
  `ALTER TABLE tenants ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'`,
  `ALTER TABLE tenants ADD COLUMN manual_payments_enabled INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE payments ADD COLUMN gateway TEXT NOT NULL DEFAULT 'stripe'`,
  `ALTER TABLE payments ADD COLUMN reference TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE payments ADD COLUMN method_id INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE payments ADD COLUMN decided_by INTEGER`,
  `ALTER TABLE payments ADD COLUMN decided_at TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE plans ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE plans ADD COLUMN featured INTEGER NOT NULL DEFAULT 0`,
  // Fase 17 (corrección): el índice único de stripe_session_id pasa
  // a PARCIAL. La unicidad protege la idempotencia de Stripe (una
  // sesión = un pago); los pagos manuales no tienen sesión (''), y
  // con el índice pleno el SEGUNDO pago manual de la base violaba
  // la unicidad y devolvía 500. DROP + CREATE en cada init es
  // idempotente y no toca datos.
  `DROP INDEX IF EXISTS payments_session_unique`,
  `CREATE UNIQUE INDEX payments_session_unique ON payments (stripe_session_id) WHERE stripe_session_id <> ''`,
  // Fase 18: multilenguaje. `users.locale` es la elección PERSONAL
  // del usuario (NULL = «predeterminado de la comunidad»);
  // `tenants.default_locale` es el idioma por defecto de la
  // comunidad ('es' = el comportamiento de siempre: nada cambia
  // hasta que alguien elige otro idioma).
  `ALTER TABLE users ADD COLUMN locale TEXT`,
  `ALTER TABLE tenants ADD COLUMN default_locale TEXT NOT NULL DEFAULT 'es'`,
  // Fase 16-F: canales como el original. TRES columnas aditivas y
  // un eje nuevo, sin repurpose de `type` (que sigue siendo el eje
  // de ACCESO: 'free'|'private'|'paid'):
  //   - content_type: 'post' | 'image' (qué se publica en el canal;
  //     el de imagen suma vistas de galería y álbum).
  //   - cover_url: portada del canal (banner de su página).
  //   - visibility: 'public' | 'private' | 'secret' — eje SEPARADO
  //     del acceso: 'public' = listado y comportamiento de siempre;
  //     'private' = listado (nombre/descripción visibles) pero
  //     contenido bloqueado hasta cumplir el acceso; 'secret' = no
  //     listado para quien no tiene acceso y su página da 404.
  //   El default 'public' reproduce lo que hoy se ve en los canales
  //   free/paid; el backfill de initDb pasa los type='private' a
  //   visibility='private' (listados para miembros, como hoy los
  //   muestra el lateral).
  //   - posts.album: álbum opcional de un post en un canal de
  //     imagen (texto libre; NULL/vacío = sin álbum).
  `ALTER TABLE channels ADD COLUMN content_type TEXT NOT NULL DEFAULT 'post'`,
  `ALTER TABLE channels ADD COLUMN cover_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE channels ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'`,
  `ALTER TABLE posts ADD COLUMN album TEXT NOT NULL DEFAULT ''`,
  // Fase 16-G: comentarios y reacciones como el original.
  //   - comments.parent_id: hilo de UN nivel (NULL = comentario raíz;
  //     una respuesta a otra respuesta cuelga de la raíz, ver
  //     comments.post.ts). Nullable a propósito: las filas viejas
  //     son raíces sin tocar su contenido.
  //   - comments.media_*: UN adjunto por comentario, espejo del
  //     adjunto principal de posts (media_type 'none'|'image'|
  //     'video'|'file', media_url, media_name = nombre visible).
  //   - reactions: el tipo pasa de palabra (like/love/fire/clap) a
  //     emoji del catálogo de utils/reactions.ts. El mapeo es
  //     inyectivo (cuatro destinos distintos), así que ninguna fila
  //     colisiona al mapear; después se COLAPSAN las filas múltiples
  //     legadas del mismo (post, usuario) conservando la más
  //     reciente (id mayor) y el índice único pasa a (post_id,
  //     user_id): una sola reacción por usuario y publicación.
  //     La tabla comment_reactions vive en CREATE_SQL.
  `ALTER TABLE comments ADD COLUMN parent_id INTEGER`,
  `ALTER TABLE comments ADD COLUMN media_type TEXT NOT NULL DEFAULT 'none'`,
  `ALTER TABLE comments ADD COLUMN media_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE comments ADD COLUMN media_name TEXT NOT NULL DEFAULT ''`,
  `UPDATE reactions SET type = '👍' WHERE type = 'like'`,
  `UPDATE reactions SET type = '❤️' WHERE type = 'love'`,
  `UPDATE reactions SET type = '🔥' WHERE type = 'fire'`,
  `UPDATE reactions SET type = '👏' WHERE type = 'clap'`,
  `DELETE FROM reactions WHERE id NOT IN (SELECT MAX(id) FROM reactions GROUP BY post_id, user_id)`,
  `DROP INDEX IF EXISTS reactions_unique`,
  `CREATE UNIQUE INDEX reactions_unique ON reactions (post_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS posts_feed_order ON posts (tenant_id, status, pinned DESC, created_at DESC, id DESC)`,
  `CREATE INDEX IF NOT EXISTS comments_post_date ON comments (post_id, created_at, id)`,
  `CREATE INDEX IF NOT EXISTS uploads_tenant_key ON uploads (tenant_id, key)`,
  // Revoke sessions and recovery tokens that could have been issued by tenant staff.
  `UPDATE users SET token_version = token_version + 1 WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'security_revoke_20261023')`,
  `DELETE FROM access_links WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'security_revoke_20261023')`,
  `DELETE FROM channel_access WHERE source = 'demo' AND NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'security_revoke_20261023')`,
  `INSERT OR IGNORE INTO app_meta (key, value) VALUES ('security_revoke_20261023', '1')`,

]

