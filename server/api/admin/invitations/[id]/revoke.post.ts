// Revocar una invitación (solo admin, Fase 14): el enlace deja de
// servir de inmediato, aunque no haya vencido.
import { requireAdmin, resolveTenant } from '../../../../utils/community'
import { dbFor } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const id = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const inv = await db.prepare('SELECT id, status FROM invitations WHERE tenant_id = ? AND id = ?').get(tenant.id, id) as { id: number, status: string } | undefined
  if (!inv) throw createError({ statusCode: 404, message: 'Invitación no encontrada.' })
  if (inv.status !== 'pending') throw createError({ statusCode: 400, message: 'Solo se puede revocar una invitación pendiente.' })
  await db.prepare("UPDATE invitations SET status = 'revoked' WHERE id = ?").run(id)
  return { ok: true }
})
