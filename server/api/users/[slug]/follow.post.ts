// Seguir a un miembro (Fase 6): crea la relación en user_follows y
// avisa al seguido con una notificación tipo 'follow' (respetando
// sus preferencias). Con un bloqueo en cualquier sentido no se puede
// seguir — coherente con que los mensajes directos quedan impedidos.
import { requireUser, resolveTenant } from '../../../utils/community'
import { otherMember } from '../../../utils/chat'
import { blockBetween } from '../../../utils/blocks'
import { notify } from '../../../utils/notify'
import { nowIso, dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireUser(event, tenant.id)
  const slug = getRouterParam(event, 'slug')!
  // otherMember ya responde 404 si no es miembro y 400 si es uno mismo.
  const other = await otherMember(event, tenant.id, slug, me.id)
  if (await blockBetween(event, tenant.id, me.id, Number(other.id))) {
    throw createError({ statusCode: 400, message: 'No podés seguir a este miembro porque hay un bloqueo entre ustedes.' })
  }
  const db = await dbFor(event)
  const res = await db.prepare('INSERT OR IGNORE INTO user_follows (tenant_id, follower_id, followee_id, created_at) VALUES (?, ?, ?, ?)')
    .run(tenant.id, me.id, other.id, nowIso())
  if (res.changes > 0) {
    await notify(event, {
      tenantId: tenant.id, userId: Number(other.id), actorId: me.id, type: 'follow',
      title: `${me.name} empezó a seguirte`, link: `/profile/${me.slug}`,
    })
  }
  const followers = (await db.prepare('SELECT COUNT(*) AS n FROM user_follows WHERE tenant_id = ? AND followee_id = ?').get(tenant.id, other.id) as { n: number }).n
  return { ok: true, following: true, followers }
})
