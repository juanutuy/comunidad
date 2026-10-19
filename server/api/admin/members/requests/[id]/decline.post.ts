// Rechazar una solicitud de ingreso (solo admin, Fase 14): la
// membresía queda 'declined' — la cuenta no puede entrar — y la
// persona podrá volver a solicitar cuando pase el cooldown del
// tenant (Ajustes → Ingreso de miembros). Se le avisa in-app (lo ve
// en la pantalla de estado al intentar entrar con su sesión).
import { requireAdmin, resolveTenant } from '../../../../../utils/community'
import { dbFor, nowIso } from '../../../../../utils/db'
import { notify } from '../../../../../utils/notify'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireAdmin(event, tenant.id)
  const requestId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const req = await db.prepare("SELECT * FROM join_requests WHERE tenant_id = ? AND id = ? AND status = 'pending'").get(tenant.id, requestId) as
    { id: number, user_id: number } | undefined
  if (!req) throw createError({ statusCode: 404, message: 'Esa solicitud ya no está pendiente.' })
  await db.prepare("UPDATE join_requests SET status = 'declined', decided_by = ?, decided_at = ? WHERE id = ?")
    .run(me.id, nowIso(), req.id)
  await db.prepare("UPDATE memberships SET status = 'declined' WHERE tenant_id = ? AND user_id = ?").run(tenant.id, req.user_id)
  await notify(event, {
    tenantId: tenant.id, userId: req.user_id, actorId: me.id, type: 'moderation',
    title: `Tu solicitud de ingreso a ${tenant.name} no fue aprobada`, link: '/pending',
  }).catch(() => {})
  return { ok: true }
})
