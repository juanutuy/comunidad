// Aprobar una solicitud de ingreso (solo admin, Fase 14): la
// membresía pasa a 'active', entra el auto-ingreso a canales y la
// persona recibe el aviso in-app (y la bienvenida por correo, que
// sin proveedor queda registrada como no enviada: en oscuro).
import { requireAdmin, resolveTenant } from '../../../../../utils/community'
import { dbFor, nowIso } from '../../../../../utils/db'
import { applyAutoJoin } from '../../../../../utils/members'
import { notify } from '../../../../../utils/notify'
import { sendEmail } from '../../../../../utils/email'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireAdmin(event, tenant.id)
  const requestId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const req = await db.prepare("SELECT * FROM join_requests WHERE tenant_id = ? AND id = ? AND status = 'pending'").get(tenant.id, requestId) as
    { id: number, user_id: number } | undefined
  if (!req) throw createError({ statusCode: 404, message: 'Esa solicitud ya no está pendiente.' })
  const member = await db.prepare('SELECT status FROM memberships WHERE tenant_id = ? AND user_id = ?').get(tenant.id, req.user_id) as { status: string } | undefined
  if (member?.status === 'banned') throw createError({ statusCode: 403, message: 'Esta persona está baneada de la comunidad.' })
  await db.prepare("UPDATE join_requests SET status = 'approved', decided_by = ?, decided_at = ? WHERE id = ?")
    .run(me.id, nowIso(), req.id)
  const now = nowIso()
  await db.batch([
    { sql: "UPDATE memberships SET status = 'active', status_reason = '', status_changed_at = ?, status_changed_by = ? WHERE tenant_id = ? AND user_id = ?", params: [now, me.id, tenant.id, req.user_id] },
    { sql: 'INSERT INTO membership_events (tenant_id, user_id, actor_id, action, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [tenant.id, req.user_id, me.id, 'active', 'Solicitud aprobada', now] },
  ])
  await applyAutoJoin(event, tenant.id, req.user_id)
  const user = await db.prepare('SELECT name, email FROM users WHERE id = ?').get(req.user_id) as { name: string, email: string }
  await notify(event, {
    tenantId: tenant.id, userId: req.user_id, actorId: me.id, type: 'moderation',
    title: `¡Tu solicitud fue aprobada! Ya sos parte de ${tenant.name}`, link: '/feeds',
  }).catch(() => {})
  await sendEmail(event, {
    tenantId: tenant.id, userId: req.user_id, to: user.email, kind: 'welcome',
    subject: `¡Te damos la bienvenida a ${tenant.name}!`,
    text: `Hola, ${user.name}:\n\nTu solicitud de ingreso a ${tenant.name} fue aprobada. Ya podés entrar a la comunidad, presentarte y participar.\n\n¡Nos vemos adentro!`,
  }).catch(() => {})
  return { ok: true }
})
