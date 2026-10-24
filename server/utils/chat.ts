// Serialización compartida de mensajes de chat y directos (Fase 3).
import type { H3Event } from 'h3'
import { dbFor } from './db'

// Presencia aproximada: se considera «en línea» a quien abrió un
// WebSocket de tiempo real en los últimos 2 minutos (last_seen_at se
// registra en el upgrade, ver realtime/upgrade.mjs).
export function isOnline(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false
  return Date.now() - new Date(lastSeenAt).getTime() < 2 * 60 * 1000
}

// Miembro del tenant con el que se conversa (para DMs): 404 si no es
// miembro de esta comunidad, 400 si es uno mismo.
export async function otherMember(event: H3Event, tenantId: number, slug: string, meId: number) {
  const db = await dbFor(event)
  const other = await db.prepare(`SELECT u.* FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ? WHERE u.slug = ?`)
    .get(tenantId, slug) as Record<string, unknown> | undefined
  if (!other) throw createError({ statusCode: 404, message: 'Miembro no encontrado en esta comunidad.' })
  if (other.id === meId) throw createError({ statusCode: 400, message: 'No podés abrir una conversación con vos mismo.' })
  return other
}

export interface ChatMessageRow {
  id: number
  body: string
  reply_to?: number | null
  created_at: string
  author_id: number
  author_name: string
  author_slug: string
  author_avatar: string | null
}

export function serializeChatMessage(r: ChatMessageRow) {
  return {
    id: r.id,
    body: r.body,
    replyTo: r.reply_to || null,
    createdAt: r.created_at,
    author: { id: r.author_id, name: r.author_name, slug: r.author_slug, avatarUrl: r.author_avatar || '' },
  }
}

export const CHAT_SELECT = `SELECT m.id, m.body, m.created_at, m.author_id,
  u.name AS author_name, u.slug AS author_slug, u.avatar_url AS author_avatar
  FROM chat_messages m JOIN users u ON u.id = m.author_id`

export const DM_SELECT = `SELECT m.id, m.body, m.created_at, m.reply_to, m.sender_id AS author_id, m.read_at,
  u.name AS author_name, u.slug AS author_slug, u.avatar_url AS author_avatar
  FROM dm_messages m JOIN users u ON u.id = m.sender_id`
