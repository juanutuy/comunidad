// Ajustes de la comunidad (solo admin): datos editables del tenant.
// Fase 14: suma el bloque de ingreso de miembros (aprobación previa,
// preguntas, cooldown y canales de auto-ingreso) y la lista de
// canales para los selectores de auto-ingreso.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { getJoinSettings } from '../../utils/members'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const db = await dbFor(event)
  const row = await db.prepare('SELECT terms, privacy, moderation_review FROM tenants WHERE id = ?').get(tenant.id).catch(() => undefined) as { terms: string, privacy: string, moderation_review?: number } | undefined
  const join = await getJoinSettings(event, tenant.id)
  const channels = await db.prepare('SELECT id, name, slug, type FROM channels WHERE tenant_id = ? ORDER BY sort, name').all(tenant.id) as { id: number, name: string, slug: string, type: string }[]
  return {
    settings: {
      name: tenant.name, tagline: tenant.tagline, brandColor: tenant.brand_color,
      guidelines: JSON.parse(tenant.guidelines || '[]') as string[],
      terms: row?.terms || '', privacy: row?.privacy || '',
      // Fase 12: revisión previa opcional de publicaciones.
      moderationReview: !!row?.moderation_review,
      // Fase 14: ingreso de miembros.
      joinApproval: join.approval,
      joinQuestions: join.questions,
      joinCooldownDays: join.cooldownDays,
      autoJoinChannels: join.autoJoinChannels,
    },
    channels: channels.map(c => ({ id: c.id, name: c.name, slug: c.slug, type: c.type })),
  }
})
