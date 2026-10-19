// Volver a mostrar una publicación oculta (Fase 5).
import { requireUser, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireUser(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  await db.prepare('DELETE FROM user_hidden_posts WHERE tenant_id = ? AND user_id = ? AND post_id = ?')
    .run(tenant.id, me.id, postId)
  return { ok: true, hidden: false }
})
