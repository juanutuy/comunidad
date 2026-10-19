// Fijar / desfijar una publicación (solo admin del tenant).
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const row = await db.prepare('SELECT pinned FROM posts WHERE id = ? AND tenant_id = ?').get(postId, tenant.id) as { pinned: number } | undefined
  if (!row) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  await db.prepare('UPDATE posts SET pinned = ? WHERE id = ?').run(row.pinned ? 0 : 1, postId)
  return { pinned: !row.pinned }
})
