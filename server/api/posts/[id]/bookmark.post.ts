// Guardar / quitar de guardados (toggle).
import { requireUser, resolveTenant } from '../../../utils/community'
import { rawDb } from '../../../utils/db'

export default defineEventHandler((event) => {
  const tenant = resolveTenant(event)
  const user = requireUser(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const db = rawDb()
  const existing = db.prepare('SELECT id FROM bookmarks WHERE tenant_id = ? AND post_id = ? AND user_id = ?').get(tenant.id, postId, user.id)
  if (existing) {
    db.prepare('DELETE FROM bookmarks WHERE id = ?').run((existing as { id: number }).id)
    return { bookmarked: false }
  }
  db.prepare('INSERT INTO bookmarks (tenant_id, post_id, user_id) VALUES (?, ?, ?)').run(tenant.id, postId, user.id)
  return { bookmarked: true }
})
