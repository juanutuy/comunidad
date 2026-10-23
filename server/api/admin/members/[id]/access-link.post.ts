// Recovery secrets are delivered only to the account owner, never to tenant staff.
import { requireAdmin, resolveTenant } from '../../../../utils/community'
import { dbFor, nowIso } from '../../../../utils/db'
import { newToken } from '../../../../utils/members'
import { emailEnabled, sendEmail } from '../../../../utils/email'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireAdmin(event, tenant.id)
  const targetId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const target = await db.prepare(`SELECT u.id, u.name, u.email, m.status FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.tenant_id = ? AND m.user_id = ?`).get(tenant.id, targetId) as { id: number, name: string, email: string, status: string } | undefined
  if (!target) throw createError({ statusCode: 404, message: 'Esa persona no es miembro de esta comunidad.' })
  if ((target.status || 'active') !== 'active')
    throw createError({ statusCode: 400, message: 'Solo se puede generar un enlace de acceso para un miembro activo.' })
  if (!emailEnabled()) throw createError({ statusCode: 503, message: 'Configura el correo para enviar enlaces de acceso al titular.' })
  const token = `owner-${newToken()}`
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  await db.prepare("UPDATE access_links SET used_at = ? WHERE tenant_id = ? AND user_id = ? AND used_at = ''").run(nowIso(), tenant.id, targetId)
  await db.prepare('INSERT INTO access_links (tenant_id, user_id, token, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(tenant.id, targetId, token, expiresAt, me.id, nowIso())
  const origin = getRequestURL(event).origin
  const url = `${origin}/access/${token}`
  const emailStatus = await sendEmail(event, {
    tenantId: tenant.id, userId: targetId, to: target.email, kind: 'notice',
    subject: `Tu enlace de acceso a ${tenant.name}`,
    text: `Hola, ${target.name}:\n\nUn administrador de ${tenant.name} generó este enlace para que entres sin contraseña. Vence en 1 hora y se puede usar una sola vez:\n\n${url}\n\nSi no lo pediste, ignorá este mensaje.`,
  }).catch(() => 'failed' as const)
  if (emailStatus !== 'sent') {
    await db.prepare('DELETE FROM access_links WHERE id = (SELECT id FROM access_links WHERE tenant_id = ? AND token = ?)').run(tenant.id, token)
    throw createError({ statusCode: 502, message: 'No se pudo enviar el enlace al titular. Intenta de nuevo.' })
  }
  return { ok: true, expiresAt, emailStatus }
})
