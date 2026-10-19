// Registro de correos (solo admin, Fase 4): transparencia total de la
// capa de correo — qué se envió, qué se omitió por falta de proveedor
// y qué falló. Nada se marca 'sent' sin un envío real.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { emailEnabled } from '../../utils/email'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const db = await dbFor(event)
  const rows = (await db.prepare('SELECT id, to_email, kind, subject, status, detail, created_at FROM email_log WHERE tenant_id = ? ORDER BY id DESC LIMIT 100').all(tenant.id) as Record<string, unknown>[])
    .map(r => ({ id: r.id, to: r.to_email, kind: r.kind, subject: r.subject, status: r.status, detail: r.detail, createdAt: r.created_at }))
  return { emails: rows, providerConfigured: emailEnabled() }
})
