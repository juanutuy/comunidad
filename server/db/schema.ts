// Esquema de datos — Drizzle ORM (dialecto SQLite).
// Es la fuente de verdad del modelo y es compatible con Cloudflare D1:
// el mismo esquema genera las migraciones para D1 (`drizzle-kit`) y crea
// las tablas del SQLite local de desarrollo (ver server/utils/db.ts).
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const tenants = sqliteTable('tenants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  tagline: text('tagline').notNull().default(''),
  brandColor: text('brand_color').notNull().default('#2563eb'),
  guidelines: text('guidelines').notNull().default('[]'), // JSON: string[]
  createdAt: text('created_at').notNull(),
})

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  bio: text('bio').notNull().default(''),
  location: text('location').notNull().default(''),
  // Fase 2: se agrega a bases viejas por migración aditiva (ver utils/db.ts).
  avatarUrl: text('avatar_url').notNull().default(''),
  // Fase 3 (migración aditiva): última conexión por WebSocket de tiempo real.
  lastSeenAt: text('last_seen_at').notNull().default(''),
  // Fase 6 (migración aditiva): foto de portada y sitio web del miembro.
  coverUrl: text('cover_url').notNull().default(''),
  website: text('website').notNull().default(''),
  createdAt: text('created_at').notNull(),
})

export const memberships = sqliteTable('memberships', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  userId: integer('user_id').notNull().references(() => users.id),
  role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
}, t => [uniqueIndex('memberships_tenant_user').on(t.tenantId, t.userId)])

export const channelGroups = sqliteTable('channel_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  sort: integer('sort').notNull().default(0),
})

export const channels = sqliteTable('channels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull().references(() => tenants.id),
  groupId: integer('group_id').references(() => channelGroups.id),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('i-lucide-hash'),
  description: text('description').notNull().default(''),
  type: text('type', { enum: ['free', 'private', 'paid'] }).notNull().default('free'),
  priceCents: integer('price_cents').notNull().default(0),
  sort: integer('sort').notNull().default(0),
}, t => [uniqueIndex('channels_tenant_slug').on(t.tenantId, t.slug)])

export const follows = sqliteTable('follows', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  userId: integer('user_id').notNull(),
  channelId: integer('channel_id').notNull(),
}, t => [uniqueIndex('follows_unique').on(t.tenantId, t.userId, t.channelId)])

export const channelAccess = sqliteTable('channel_access', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  userId: integer('user_id').notNull(),
  channelId: integer('channel_id').notNull(),
  source: text('source').notNull().default('demo'), // 'demo' | 'stripe' (fase 2)
  createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('channel_access_unique').on(t.tenantId, t.userId, t.channelId)])

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  channelId: integer('channel_id').notNull().references(() => channels.id),
  authorId: integer('author_id').notNull().references(() => users.id),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  teaser: text('teaser').notNull().default(''),
  mediaType: text('media_type', { enum: ['none', 'image', 'video'] }).notNull().default('none'),
  mediaUrl: text('media_url').notNull().default(''),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('posts_channel_slug').on(t.channelId, t.slug)])

export const reactions = sqliteTable('reactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  postId: integer('post_id').notNull().references(() => posts.id),
  userId: integer('user_id').notNull(),
  type: text('type', { enum: ['love', 'like', 'fire', 'clap'] }).notNull(),
}, t => [uniqueIndex('reactions_unique').on(t.postId, t.userId, t.type)])

export const comments = sqliteTable('comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  postId: integer('post_id').notNull().references(() => posts.id),
  authorId: integer('author_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
})

export const bookmarks = sqliteTable('bookmarks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  postId: integer('post_id').notNull(),
  userId: integer('user_id').notNull(),
}, t => [uniqueIndex('bookmarks_unique').on(t.tenantId, t.postId, t.userId)])

export const courses = sqliteTable('courses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  level: text('level').notNull().default('Principiante'),
  priceCents: integer('price_cents').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('courses_tenant_slug').on(t.tenantId, t.slug)])

export const chapters = sqliteTable('chapters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  courseId: integer('course_id').notNull().references(() => courses.id),
  title: text('title').notNull(),
  sort: integer('sort').notNull().default(0),
})

export const lessons = sqliteTable('lessons', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  chapterId: integer('chapter_id').notNull().references(() => chapters.id),
  title: text('title').notNull(),
  durationMin: integer('duration_min').notNull().default(0),
  isFree: integer('is_free', { mode: 'boolean' }).notNull().default(false),
  sort: integer('sort').notNull().default(0),
  // Fase 2 (migración aditiva): contenido de la lección para el visor.
  content: text('content').notNull().default(''),
})

export const lessonProgress = sqliteTable('lesson_progress', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  userId: integer('user_id').notNull(),
  lessonId: integer('lesson_id').notNull().references(() => lessons.id),
  completedAt: text('completed_at').notNull(),
}, t => [uniqueIndex('lesson_progress_unique').on(t.tenantId, t.userId, t.lessonId)])

export const enrollments = sqliteTable('enrollments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  courseId: integer('course_id').notNull(),
  userId: integer('user_id').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('enrollments_unique').on(t.tenantId, t.courseId, t.userId)])

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at').notNull(),
  location: text('location').notNull().default('En línea'),
  category: text('category').notNull().default('General'),
  hostId: integer('host_id').references(() => users.id),
  agenda: text('agenda').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('events_tenant_slug').on(t.tenantId, t.slug)])

export const rsvps = sqliteTable('rsvps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  eventId: integer('event_id').notNull(),
  userId: integer('user_id').notNull(),
}, t => [uniqueIndex('rsvps_unique').on(t.tenantId, t.eventId, t.userId)])

export const libraryItems = sqliteTable('library_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  title: text('title').notNull(),
  kind: text('kind', { enum: ['pdf', 'doc', 'video', 'image', 'audio', 'link'] }).notNull(),
  category: text('category').notNull().default('General'),
  sizeLabel: text('size_label').notNull().default(''),
  downloads: integer('downloads').notNull().default(0),
  locked: integer('locked', { mode: 'boolean' }).notNull().default(false),
  // Fase 2 (migración aditiva): archivo real asociado (clave en R2 o en
  // data/uploads local). Vacío = item de solo metadatos/enlace (semilla).
  fileKey: text('file_key').notNull().default(''),
  fileName: text('file_name').notNull().default(''),
  createdAt: text('created_at').notNull(),
})

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  userId: integer('user_id').notNull().references(() => users.id), // destinatario
  actorId: integer('actor_id'), // quién originó la acción (puede ser null)
  type: text('type', { enum: ['reaction', 'comment', 'new_post', 'mention', 'dm'] }).notNull(),
  title: text('title').notNull(),
  link: text('link').notNull().default(''),
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
})

export const uploads = sqliteTable('uploads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  userId: integer('user_id').notNull(),
  key: text('key').notNull(), // clave en R2 / ruta bajo data/uploads en local
  filename: text('filename').notNull().default(''),
  contentType: text('content_type').notNull().default(''),
  size: integer('size').notNull().default(0),
  createdAt: text('created_at').notNull(),
})

// Fase 3 — tiempo real: chat por canal y mensajes directos. Los mensajes
// viven en la base (historial por REST); el Durable Object solo transporta
// los eventos en vivo y la presencia por sala.
export const chatMessages = sqliteTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  channelId: integer('channel_id').notNull().references(() => channels.id),
  authorId: integer('author_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
})

export const dmMessages = sqliteTable('dm_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  senderId: integer('sender_id').notNull().references(() => users.id),
  recipientId: integer('recipient_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  readAt: text('read_at').notNull().default(''), // '' = no leído
  createdAt: text('created_at').notNull(),
})

// Fase 5 — encuestas, preferencias, puntos extra, salas grupales.
// (Las columnas nuevas de tablas viejas — posts.status/scheduled_at/kind,
// users.token_version, tenants.terms/privacy, courses.status/image_url,
// lessons.video_url — se agregan por migración aditiva en utils/db.ts.)
export const pollOptions = sqliteTable('poll_options', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  postId: integer('post_id').notNull().references(() => posts.id),
  label: text('label').notNull(),
  sort: integer('sort').notNull().default(0),
})

export const pollVotes = sqliteTable('poll_votes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  postId: integer('post_id').notNull().references(() => posts.id),
  optionId: integer('option_id').notNull().references(() => pollOptions.id),
  userId: integer('user_id').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('poll_votes_unique').on(t.postId, t.userId)])

export const userPrefs = sqliteTable('user_prefs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  userId: integer('user_id').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull().default(''),
}, t => [uniqueIndex('user_prefs_unique').on(t.tenantId, t.userId, t.key)])

export const pointEvents = sqliteTable('point_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  userId: integer('user_id').notNull(),
  kind: text('kind').notNull(), // 'course_enroll' | 'course_complete' | 'event_rsvp'
  refId: integer('ref_id').notNull().default(0),
  points: integer('points').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('point_events_unique').on(t.tenantId, t.userId, t.kind, t.refId)])

export const chatRooms = sqliteTable('chat_rooms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  name: text('name').notNull(),
  createdBy: integer('created_by').notNull(),
  createdAt: text('created_at').notNull(),
})

export const chatRoomMembers = sqliteTable('chat_room_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  roomId: integer('room_id').notNull().references(() => chatRooms.id),
  userId: integer('user_id').notNull(),
}, t => [uniqueIndex('chat_room_members_unique').on(t.roomId, t.userId)])

export const chatRoomMessages = sqliteTable('chat_room_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  roomId: integer('room_id').notNull().references(() => chatRooms.id),
  authorId: integer('author_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
})

export const userBlocks = sqliteTable('user_blocks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  blockerId: integer('blocker_id').notNull(),
  blockedId: integer('blocked_id').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('user_blocks_unique').on(t.tenantId, t.blockerId, t.blockedId)])

export const userHiddenPosts = sqliteTable('user_hidden_posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  userId: integer('user_id').notNull(),
  postId: integer('post_id').notNull().references(() => posts.id),
  createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('user_hidden_posts_unique').on(t.tenantId, t.userId, t.postId)])

// Fase 6: seguimiento entre miembros (Seguir / Siguiendo del perfil).
export const userFollows = sqliteTable('user_follows', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  followerId: integer('follower_id').notNull().references(() => users.id),
  followeeId: integer('followee_id').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('user_follows_unique').on(t.tenantId, t.followerId, t.followeeId)])

// Fase 9: gamificación administrable por tenant. Los niveles y los
// valores de puntos por acción dejan de estar fijos en el código: se
// guardan acá (con los valores históricos como semilla) y se editan
// desde /admin/gamification. Ver server/utils/gamification.ts.
export const gamificationLevels = sqliteTable('gamification_levels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  name: text('name').notNull(),
  minPoints: integer('min_points').notNull().default(0),
  icon: text('icon').notNull().default('i-lucide-award'), // nombre de icono lucide
  position: integer('position').notNull().default(0),
}, t => [uniqueIndex('gamification_levels_tenant_min').on(t.tenantId, t.minPoints)])

export const gamificationPoints = sqliteTable('gamification_points', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),
  action: text('action').notNull(), // 'post' | 'comment' | 'reaction_received' | 'course_enroll' | 'course_complete' | 'event_rsvp'
  points: integer('points').notNull().default(0),
}, t => [uniqueIndex('gamification_points_tenant_action').on(t.tenantId, t.action)])

// Puntos base: se calculan de la actividad real (posts x10, comentarios
// x3, reacciones recibidas x2) y se suman los point_events de la Fase 5
// (inscripción a curso +5, curso completo +50, RSVP a evento +10).
// Desde la Fase 9 los multiplicadores salen de gamification_points.
