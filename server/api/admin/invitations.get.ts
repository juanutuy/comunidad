// Invitaciones del tenant (solo admin, Fase 14): por correo
// (personales, un solo uso) y por enlace (reutilizables, con
// contador de usos). El estado 'expired' se deriva del vencimiento.
// `emailEnabled` dice si hay proveedor de correo: sin proveedor los
// correos de invitación quedan EN OSCURO y la UI ofrece copiar el
// enlace para compartirlo manualmente.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { invitationState, type InvitationRow } from '../../utils/members'
import { emailEnabled } from '../../utils/email'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const db = await dbFor(event)
  const rows = await db.prepare(`SELECT i.*, u.name AS creator_name, a.name AS accepted_by_name
    FROM invitations i LEFT JOIN users u ON u.id = i.created_by LEFT JOIN users a ON a.id = i.accepted_by
    WHERE i.tenant_id = ? ORDER BY i.created_at DESC LIMIT 100`).all(tenant.id) as (InvitationRow & { creator_name: string, accepted_by_name: string })[]
  const origin = getRequestURL(event).origin
  return {
    emailEnabled: emailEnabled(),
    invitations: rows.map(r => ({
      id: r.id, kind: r.kind, email: r.email, status: invitationState(r), uses: r.uses,
      expiresAt: r.expires_at, createdAt: r.created_at,
      createdByName: r.creator_name || '', acceptedByName: r.accepted_by_name || '',
      url: `${origin}/invite/${r.token}`,
    })),
  }
})
