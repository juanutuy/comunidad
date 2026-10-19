// Dejar de seguir a un miembro (Fase 6). Idempotente: si no lo
// seguías, responde igual con following=false.
import { requireUser, resolveTenant } from '../../../utils/community'
import { otherMember } from '../../../utils/chat'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireUser(event, tenant.id)
  const slug = getRouterParam(event, 'slug')!
  const other = await otherMember(event, tenant.id, slug, me.id)
  const db = await dbFor(event)
  await db.prepare('DELETE FROM user_follows WHERE tenant_id = ? AND follower_id = ? AND followee_id = ?')
    .run(tenant.id, me.id, other.id)
  const followers = (await db.prepare('SELECT COUNT(*) AS n FROM user_follows WHERE tenant_id = ? AND followee_id = ?').get(tenant.id, other.id) as { n: number }).n
  return { ok: true, following: false, followers }
})
