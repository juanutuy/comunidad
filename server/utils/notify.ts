// Notificaciones in-app (Fase 2): reacciones y comentarios sobre TU
// publicación, publicaciones nuevas en canales que seguís y menciones
// `@usuario`. Nunca se notifica a la persona por su propia acción.
import type { H3Event } from 'h3'
import { nowIso, dbFor } from './db'
import { publishRealtime, roomUser } from './realtime'

export interface NotifyInput {
  tenantId: number
  userId: number // destinatario
  actorId: number | null
  type: 'reaction' | 'comment' | 'new_post' | 'mention' | 'dm' | 'follow' | 'report' | 'moderation'
  title: string
  link: string
}

// Fase 5: preferencias de notificación por tipo (Ajustes de cuenta).
// Clave en user_prefs por tipo; por defecto todo activado (sin fila).
// 'follow' (Fase 6) tiene su propia categoría de preferencia
// (notify_follow), no se mezcla con menciones: son avisos distintos.
// Fase 12: 'report' (aviso a admins de un reporte nuevo) y
// 'moderation' (aprobación/rechazo de una publicación en revisión) NO
// tienen preferencia propia a propósito: son avisos operativos de
// moderación, no sociales, y siempre llegan.
const PREF_BY_TYPE: Partial<Record<NotifyInput['type'], string>> = {
  reaction: 'notify_reaction',
  comment: 'notify_comment',
  mention: 'notify_mention',
  new_post: 'notify_new_post',
  dm: 'notify_dm',
  follow: 'notify_follow',
}

export async function notify(event: H3Event, n: NotifyInput): Promise<void> {
  if (n.actorId && n.userId === n.actorId) return
  const db = await dbFor(event)
  const prefKey = PREF_BY_TYPE[n.type]
  try {
    if (prefKey) {
      const pref = await db.prepare('SELECT value FROM user_prefs WHERE tenant_id = ? AND user_id = ? AND key = ?')
        .get(n.tenantId, n.userId, prefKey) as { value: string } | undefined
      if (pref && pref.value === '0') return // el destinatario apagó este tipo
    }
  }
  catch { /* bases sin la tabla: se notifica como siempre */ }
  await db.prepare('INSERT INTO notifications (tenant_id, user_id, actor_id, type, title, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
    .run(n.tenantId, n.userId, n.actorId, n.type, n.title, n.link, nowIso())
  // Fase 3: empuje en vivo a la sala personal del destinatario para que
  // su campana se actualice sin esperar el polling (que queda de respaldo).
  const unread = (await db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0').get(n.userId) as { n: number }).n
  await publishRealtime(event, roomUser(n.tenantId, n.userId), {
    type: 'notification', title: n.title, link: n.link, kind: n.type, unread,
  })
}

// Aviso de publicación nueva: seguidores del canal + menciones. Lo
// usan tanto la creación directa (posts.post) como la publicación de
// un borrador/programado (posts/[id]/publish).
// Fase 8: en un post ANÓNIMO ningún título de notificación nombra al
// autor (la atribución interna por actor_id queda en la base, pero no
// se muestra). Las menciones del cuerpo siguen avisando, como «Alguien».
export async function notifyNewPost(
  event: H3Event,
  tenantId: number,
  author: { id: number, name: string },
  channel: { id: number, name: string },
  post: { title: string, body: string, slug: string },
  channelSlug: string,
  options: { anonymous?: boolean } = {},
): Promise<void> {
  const db = await dbFor(event)
  const link = `/p/${channelSlug}/${post.slug}`
  const followers = await db.prepare('SELECT user_id FROM follows WHERE tenant_id = ? AND channel_id = ?').all(tenantId, channel.id) as { user_id: number }[]
  for (const f of followers) {
    await notify(event, {
      tenantId, userId: f.user_id, actorId: author.id, type: 'new_post',
      title: options.anonymous
        ? `Nueva publicación en ${channel.name}: «${post.title}»`
        : `${author.name} publicó «${post.title}» en ${channel.name}`,
      link,
    })
  }
  await notifyMentions(event, tenantId, options.anonymous ? { id: author.id, name: 'Alguien' } : author, `${post.title}\n${post.body}`, link)
}

// Menciones simples: cualquier `@slug` de un miembro del tenant que
// aparezca en el texto genera una notificación 'mention' (sin contarse a
// sí misma ni duplicar si ya fue notificada por otra vía en este helper).
export async function notifyMentions(event: H3Event, tenantId: number, actor: { id: number, name: string }, text: string, link: string, excludeUserIds: number[] = []): Promise<void> {
  if (!text.includes('@')) return
  const db = await dbFor(event)
  const members = await db.prepare('SELECT u.id, u.slug FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ?').all(tenantId) as { id: number, slug: string }[]
  const excluded = new Set([actor.id, ...excludeUserIds])
  for (const m of members) {
    if (excluded.has(m.id)) continue
    if (text.includes(`@${m.slug}`)) {
      await notify(event, { tenantId, userId: m.id, actorId: actor.id, type: 'mention', title: `${actor.name} te mencionó en una publicación`, link })
    }
  }
}
