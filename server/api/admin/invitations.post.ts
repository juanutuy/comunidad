// Crear una invitación (solo admin, Fase 14):
//   kind 'email': personal para un correo; el «envío» pasa por la
//     capa de correos — sin proveedor queda registrada como no
//     enviada (EN OSCURO) y la respuesta devuelve igual la URL para
//     compartirla manualmente. Nunca se finge un envío.
//   kind 'link': enlace reutilizable con vencimiento opcional.
// Quien se registra con una invitación válida nace APROBADO aunque
// el tenant pida aprobación previa: la invitación es la aprobación.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor, nowIso } from '../../utils/db'
import { newToken } from '../../utils/members'
import { sendEmail } from '../../utils/email'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireAdmin(event, tenant.id)
  const body = await readBody<{ kind?: string, email?: string, expiresDays?: number }>(event)
  const kind = body.kind === 'link' ? 'link' : 'email'
  const email = (body.email || '').trim().toLowerCase()
  if (kind === 'email' && !email.includes('@'))
    throw createError({ statusCode: 400, message: 'La invitación por correo necesita un correo válido.' })
  const days = Number(body.expiresDays)
  const expiresAt = Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 24 * 3600 * 1000).toISOString() : ''
  const db = await dbFor(event)
  if (kind === 'email') {
    const banned = await db.prepare(`SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ?
      WHERE lower(u.email) = ? AND m.status = 'banned'`).get(tenant.id, email)
    if (banned) throw createError({ statusCode: 403, message: 'Esta persona está baneada de la comunidad.' })
    const dupe = await db.prepare("SELECT id FROM invitations WHERE tenant_id = ? AND kind = 'email' AND email = ? AND status = 'pending'").get(tenant.id, email) as { id: number } | undefined
    if (dupe) throw createError({ statusCode: 409, message: 'Ya hay una invitación pendiente para ese correo. Revocala si querés crear otra.' })
    const member = await db.prepare(`SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ?
      WHERE lower(u.email) = ? AND (m.status = 'active' OR m.status = 'restricted')`).get(tenant.id, email)
    if (member) throw createError({ statusCode: 409, message: 'Esa persona ya es miembro de la comunidad.' })
  }
  const token = newToken()
  const id = Number((await db.prepare('INSERT INTO invitations (tenant_id, kind, email, token, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(tenant.id, kind, email, token, expiresAt, me.id, nowIso())).lastInsertRowId)
  const origin = getRequestURL(event).origin
  const url = `${origin}/invite/${token}`
  let emailStatus: string | null = null
  if (kind === 'email') {
    emailStatus = await sendEmail(event, {
      tenantId: tenant.id, userId: null, to: email, kind: 'notice',
      subject: `Te invitaron a ${tenant.name}`,
      text: `Hola:\n\nTe invitaron a sumarte a ${tenant.name}. Creá tu cuenta desde este enlace (la invitación ya cuenta como aprobación, no tenés que esperar revisión):\n\n${url}\n\n¡Te esperamos!`,
    }).catch(() => 'failed')
  }
  return { ok: true, invitation: { id, kind, email, url, expiresAt }, emailStatus }
})
