// Quitar la membresía de una persona (solo admin). La cuenta y su
// contenido quedan; solo pierde el acceso como miembro del tenant.
// No se puede quitar la membresía del único administrador.
import { requireAdmin, resolveTenant } from '../../../../utils/community'
import { dbFor } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireAdmin(event, tenant.id)
  const targetId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const target = await db.prepare('SELECT role FROM memberships WHERE tenant_id = ? AND user_id = ?').get(tenant.id, targetId) as { role: string } | undefined
  if (!target) throw createError({ statusCode: 404, message: 'Esa persona no es miembro de esta comunidad.' })
  if (target.role === 'admin') {
    const admins = (await db.prepare('SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ? AND role = \'admin\'').get(tenant.id) as { n: number }).n
    if (admins <= 1) throw createError({ statusCode: 400, message: 'No se puede quitar la membresía del único administrador.' })
  }
  await db.prepare('DELETE FROM memberships WHERE tenant_id = ? AND user_id = ?').run(tenant.id, targetId)
  return { ok: true, self: me.id === targetId }
})
