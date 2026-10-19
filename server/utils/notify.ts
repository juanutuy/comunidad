// Notificaciones in-app (Fase 2): reacciones y comentarios sobre TU
// publicación, publicaciones nuevas en canales que seguís y menciones
// `@usuario`. Nunca se notifica a la persona por su propia acción.
import type { H3Event } from 'h3'
import { nowIso, dbFor } from './db'

export interface NotifyInput {
  tenantId: number
  userId: number // destinatario
  actorId: number | null
  type: 'reaction' | 'comment' | 'new_post' | 'mention'
  title: string
  link: string
}

export async function notify(event: H3Event, n: NotifyInput): Promise<void> {
  if (n.actorId && n.userId === n.actorId) return
  const db = await dbFor(event)
  await db.prepare('INSERT INTO notifications (tenant_id, user_id, actor_id, type, title, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
    .run(n.tenantId, n.userId, n.actorId, n.type, n.title, n.link, nowIso())
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
