// Borrar un canal (solo admin): elimina en cascada sus publicaciones
// (con reacciones, comentarios y guardados), seguimientos y accesos.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { postDeletionCommands } from '../../../utils/moderation'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const channelId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const channel = await db.prepare('SELECT id, slug FROM channels WHERE id = ? AND tenant_id = ?').get(channelId, tenant.id) as { id: number, slug: string } | undefined
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  const posts = await db.prepare('SELECT id, slug FROM posts WHERE tenant_id = ? AND channel_id = ?').all(tenant.id, channelId) as { id: number, slug: string }[]
  await db.batch([
    ...posts.flatMap(post => postDeletionCommands(tenant.id, post.id, channel.slug, post.slug)),
    ...['chat_messages', 'follows', 'channel_access'].map(table => ({ sql: `DELETE FROM ${table} WHERE tenant_id = ? AND channel_id = ?`, params: [tenant.id, channelId] })),
    { sql: 'DELETE FROM channels WHERE tenant_id = ? AND id = ?', params: [tenant.id, channelId] },
  ])
  return { ok: true }
})
