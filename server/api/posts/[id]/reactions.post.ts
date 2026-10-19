// Reaccionar a una publicación (toggle por tipo: love/like/fire/clap).
import { requireUser, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

const TYPES = ['love', 'like', 'fire', 'clap']

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ type?: string }>(event)
  if (!TYPES.includes(body.type || '')) throw createError({ statusCode: 400, message: 'Tipo de reacción inválido.' })
  const db = await dbFor(event)
  if (!await db.prepare('SELECT id FROM posts WHERE id = ? AND tenant_id = ?').get(postId, tenant.id))
    throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  const existing = await db.prepare('SELECT id FROM reactions WHERE post_id = ? AND user_id = ? AND type = ?').get(postId, user.id, body.type)
  if (existing) await db.prepare('DELETE FROM reactions WHERE id = ?').run((existing as { id: number }).id)
  else await db.prepare('INSERT INTO reactions (tenant_id, post_id, user_id, type) VALUES (?, ?, ?, ?)').run(tenant.id, postId, user.id, body.type)
  const counts = await db.prepare('SELECT type, COUNT(*) AS n FROM reactions WHERE post_id = ? GROUP BY type').all(postId)
  return { reactions: counts, active: !existing }
})
