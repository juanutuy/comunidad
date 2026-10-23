// Cambiar el estado de una membresía (solo admin, Fase 14):
//   active     → miembro normal (también reactiva suspendidos y
//                restringidos, y aprueba una membresía pendiente).
//   suspended  → no puede iniciar sesión ni usar la API.
//   restricted → entra y lee, pero no puede publicar ni participar
//                (lo corta requireCanWrite en cada escritura).
// Guardas: nadie se suspende ni se restringe a sí mismo, y el último
// administrador del tenant no puede salir de 'active'.
import { requireAdmin, resolveTenant } from '../../../../utils/community'
import { dbFor } from '../../../../utils/db'
import { applyAutoJoin } from '../../../../utils/members'

const STATUSES = ['active', 'suspended', 'restricted', 'banned']

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireAdmin(event, tenant.id)
  const targetId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ status?: string, reason?: string }>(event)
  const status = String(body.status || '')
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  if (!STATUSES.includes(status))
    throw createError({ statusCode: 400, message: 'Estado inválido: activo, suspendido, restringido o baneado.' })
  if (status !== 'active' && !reason)
    throw createError({ statusCode: 400, message: 'Indica el motivo de la medida.' })
  if (targetId === me.id && status !== 'active')
    throw createError({ statusCode: 400, message: 'No podés suspenderte ni restringirte a vos mismo.' })
  const db = await dbFor(event)
  const target = await db.prepare('SELECT role, status FROM memberships WHERE tenant_id = ? AND user_id = ?').get(tenant.id, targetId) as { role: string, status: string } | undefined
  if (!target) throw createError({ statusCode: 404, message: 'Esa persona no es miembro de esta comunidad.' })
  if (target.role === 'admin' && status !== 'active') {
    const admins = (await db.prepare('SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ? AND role = \'admin\'').get(tenant.id) as { n: number }).n
    if (admins <= 1) throw createError({ statusCode: 400, message: 'No se puede suspender ni restringir al único administrador de la comunidad.' })
  }
  const wasPending = (target.status || 'active') === 'pending'
  const now = new Date().toISOString()
  await db.batch([
    { sql: 'UPDATE memberships SET status = ?, status_reason = ?, status_changed_at = ?, status_changed_by = ? WHERE tenant_id = ? AND user_id = ?', params: [status, reason, now, me.id, tenant.id, targetId] },
    { sql: 'INSERT INTO membership_events (tenant_id, user_id, actor_id, action, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [tenant.id, targetId, me.id, status, reason, now] },
  ])
  // Si se está activando a alguien que esperaba aprobación, la
  // solicitud pendiente se cierra como aprobada y entra el
  // auto-ingreso, igual que desde la cola de solicitudes.
  if (status === 'active' && wasPending) {
    await db.prepare("UPDATE join_requests SET status = 'approved', decided_by = ?, decided_at = ? WHERE tenant_id = ? AND user_id = ? AND status = 'pending'")
      .run(me.id, new Date().toISOString(), tenant.id, targetId)
    await applyAutoJoin(event, tenant.id, targetId)
  }
  return { ok: true, status, self: me.id === targetId }
})
