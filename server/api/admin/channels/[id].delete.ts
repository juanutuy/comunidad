// Borrar un canal (solo admin): elimina en cascada sus publicaciones
// (con reacciones, comentarios y guardados), seguimientos y accesos.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const channelId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const channel = await db.prepare('SELECT id, slug FROM channels WHERE id = ? AND tenant_id = ?').get(channelId, tenant.id) as { id: number, slug: string } | undefined
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  await db.prepare(`DELETE FROM reactions WHERE post_id IN (SELECT id FROM posts WHERE channel_id = ?)`).run(channelId)
  await db.prepare(`DELETE FROM comments WHERE post_id IN (SELECT id FROM posts WHERE channel_id = ?)`).run(channelId)
  await db.prepare(`DELETE FROM bookmarks WHERE post_id IN (SELECT id FROM posts WHERE channel_id = ?)`).run(channelId)
  await db.prepare('DELETE FROM posts WHERE channel_id = ?').run(channelId)
  await db.prepare('DELETE FROM follows WHERE channel_id = ?').run(channelId)
  await db.prepare('DELETE FROM channel_access WHERE channel_id = ?').run(channelId)
  await db.prepare('DELETE FROM channels WHERE id = ?').run(channelId)
  return { ok: true }
})
