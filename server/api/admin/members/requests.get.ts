// Solicitudes de ingreso del tenant (solo admin, Fase 14): las
// pendientes primero, con las respuestas a las preguntas de ingreso,
// y debajo el historial reciente de resueltas. Solo tiene sentido
// con la aprobación previa encendida, pero la cola se puede consultar
// siempre (quedan las solicitudes viejas si el ajuste se apagó).
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { getJoinSettings } from '../../../utils/members'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const db = await dbFor(event)
  const join = await getJoinSettings(event, tenant.id)
  const rows = await db.prepare(`SELECT r.id, r.answers, r.status, r.created_at, r.decided_at,
      u.id AS user_id, u.name, u.slug, u.email, u.avatar_url, u.created_at AS user_created_at,
      d.name AS decided_by_name
    FROM join_requests r JOIN users u ON u.id = r.user_id
    LEFT JOIN users d ON d.id = r.decided_by
    WHERE r.tenant_id = ? ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT 100`).all(tenant.id) as Record<string, unknown>[]
  const requests = rows.map(r => ({
    id: r.id, status: r.status, createdAt: r.created_at, decidedAt: r.decided_at || '',
    decidedByName: r.decided_by_name || '',
    answers: (() => { try { return JSON.parse(r.answers as string) as string[] } catch { return [] as string[] } })(),
    user: { id: r.user_id, name: r.name, slug: r.slug, email: r.email, avatarUrl: r.avatar_url || '', createdAt: r.user_created_at },
  }))
  return {
    questions: join.questions,
    approval: join.approval,
    pending: requests.filter(r => r.status === 'pending').length,
    requests,
  }
})
