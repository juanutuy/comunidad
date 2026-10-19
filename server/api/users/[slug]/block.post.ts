// Bloquear a un miembro (Fase 5): a partir de ahí, quien bloquea
// deja de ver los posts y comentarios de esa persona en feed, canales
// y búsqueda, y los mensajes directos entre ambos quedan impedidos.
import { requireUser, resolveTenant } from '../../../utils/community'
import { otherMember } from '../../../utils/chat'
import { nowIso, dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireUser(event, tenant.id)
  const slug = getRouterParam(event, 'slug')!
  // otherMember ya responde 404 si no es miembro y 400 si es uno mismo.
  const other = await otherMember(event, tenant.id, slug, me.id)
  const db = await dbFor(event)
  await db.prepare('INSERT OR IGNORE INTO user_blocks (tenant_id, blocker_id, blocked_id, created_at) VALUES (?, ?, ?, ?)')
    .run(tenant.id, me.id, other.id, nowIso())
  return { ok: true, blocked: true }
})
