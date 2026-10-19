// Cambiar el rol de un miembro (solo admin). Fase 14: los roles son
// admin | moderator | course_manager | member. Protección: no se
// puede degradar al único administrador del tenant (quedaría sin
// gestión) — incluye el caso de degradarse a uno mismo siendo el
// único admin.
import { requireAdmin, resolveTenant, ROLES } from '../../../../utils/community'
import { dbFor } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireAdmin(event, tenant.id)
  const targetId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ role?: string }>(event)
  const role = String(body.role || '')
  if (!(ROLES as readonly string[]).includes(role))
    throw createError({ statusCode: 400, message: 'Elegí un rol válido: administrador, moderador, encargado de cursos o miembro.' })
  const db = await dbFor(event)
  const target = await db.prepare('SELECT role FROM memberships WHERE tenant_id = ? AND user_id = ?').get(tenant.id, targetId) as { role: string } | undefined
  if (!target) throw createError({ statusCode: 404, message: 'Esa persona no es miembro de esta comunidad.' })
  if (target.role === 'admin' && role !== 'admin') {
    const admins = (await db.prepare('SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ? AND role = \'admin\'').get(tenant.id) as { n: number }).n
    if (admins <= 1) throw createError({ statusCode: 400, message: 'No se puede degradar al único administrador de la comunidad.' })
  }
  await db.prepare('UPDATE memberships SET role = ? WHERE tenant_id = ? AND user_id = ?').run(role, tenant.id, targetId)
  return { ok: true, role, self: me.id === targetId }
})
