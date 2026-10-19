// Marcar como leídos los mensajes directos de un miembro (Fase 3).
import { requireUser, resolveTenant } from '../../../utils/community'
import { otherMember } from '../../../utils/chat'
import { dbFor, nowIso } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireUser(event, tenant.id)
  const slug = getRouterParam(event, 'slug')!
  const other = await otherMember(event, tenant.id, slug, me.id)
  const db = await dbFor(event)
  const res = await db.prepare("UPDATE dm_messages SET read_at = ? WHERE tenant_id = ? AND sender_id = ? AND recipient_id = ? AND read_at = ''")
    .run(nowIso(), tenant.id, other.id, me.id)
  return { marked: res.changes }
})
