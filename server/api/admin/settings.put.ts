// Guardar ajustes de la comunidad (solo admin). Lo guardado se refleja
// de inmediato en toda la UI (encabezado, portada y reglas) porque todo
// sale de la fila del tenant.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const body = await readBody<{ name?: string, tagline?: string, brandColor?: string, guidelines?: string[], terms?: string, privacy?: string, moderationReview?: boolean, joinApproval?: boolean, joinQuestions?: string[], joinCooldownDays?: number, autoJoinChannels?: number[] }>(event)
  const name = (body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, message: 'La comunidad necesita un nombre.' })
  const brandColor = /^#[0-9a-fA-F]{6}$/.test(body.brandColor || '') ? body.brandColor! : tenant.brand_color
  const guidelines = Array.isArray(body.guidelines)
    ? body.guidelines.map(g => String(g).trim()).filter(Boolean).slice(0, 20)
    : JSON.parse(tenant.guidelines || '[]') as string[]
  const db = await dbFor(event)
  const terms = typeof body.terms === 'string' ? body.terms.slice(0, 20000) : undefined
  const privacy = typeof body.privacy === 'string' ? body.privacy.slice(0, 20000) : undefined
  if (terms !== undefined || privacy !== undefined) {
    const current = await db.prepare('SELECT terms, privacy FROM tenants WHERE id = ?').get(tenant.id).catch(() => undefined) as { terms: string, privacy: string } | undefined
    await db.prepare('UPDATE tenants SET name = ?, tagline = ?, brand_color = ?, guidelines = ?, terms = ?, privacy = ? WHERE id = ?')
      .run(name, (body.tagline || '').trim(), brandColor, JSON.stringify(guidelines), terms ?? current?.terms ?? '', privacy ?? current?.privacy ?? '', tenant.id)
  }
  else {
    await db.prepare('UPDATE tenants SET name = ?, tagline = ?, brand_color = ?, guidelines = ? WHERE id = ?')
      .run(name, (body.tagline || '').trim(), brandColor, JSON.stringify(guidelines), tenant.id)
  }
  // Fase 12: la revisión previa se guarda aparte para no tocar las
  // ramas de textos legales; si el cliente no la manda, no cambia.
  if (typeof body.moderationReview === 'boolean') {
    await db.prepare('UPDATE tenants SET moderation_review = ? WHERE id = ?')
      .run(body.moderationReview ? 1 : 0, tenant.id).catch(() => {})
  }
  // Fase 14: ingreso de miembros — mismo patrón: cada campo se guarda
  // solo si viene en el cuerpo, con sus validaciones (hasta 6
  // preguntas de 200 caracteres; cooldown entero 0–365; hasta 2
  // canales de auto-ingreso que existan en el tenant).
  if (typeof body.joinApproval === 'boolean') {
    await db.prepare('UPDATE tenants SET join_approval = ? WHERE id = ?')
      .run(body.joinApproval ? 1 : 0, tenant.id).catch(() => {})
  }
  if (Array.isArray(body.joinQuestions)) {
    const questions = body.joinQuestions.map(q => String(q).trim().slice(0, 200)).filter(Boolean).slice(0, 6)
    await db.prepare('UPDATE tenants SET join_questions = ? WHERE id = ?')
      .run(JSON.stringify(questions), tenant.id).catch(() => {})
  }
  if (body.joinCooldownDays !== undefined) {
    const days = Number(body.joinCooldownDays)
    if (!Number.isInteger(days) || days < 0 || days > 365)
      throw createError({ statusCode: 400, message: 'El tiempo de espera tras un rechazo tiene que ser un número de días entre 0 y 365.' })
    await db.prepare('UPDATE tenants SET join_cooldown_days = ? WHERE id = ?')
      .run(days, tenant.id).catch(() => {})
  }
  if (Array.isArray(body.autoJoinChannels)) {
    const ids = [...new Set(body.autoJoinChannels.map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 2)
    for (const id of ids) {
      const ch = await db.prepare('SELECT id FROM channels WHERE tenant_id = ? AND id = ?').get(tenant.id, id)
      if (!ch) throw createError({ statusCode: 400, message: 'Uno de los canales de auto-ingreso no existe en esta comunidad.' })
    }
    await db.prepare('UPDATE tenants SET auto_join_channels = ? WHERE id = ?')
      .run(JSON.stringify(ids), tenant.id).catch(() => {})
  }
  return { ok: true, settings: { name, tagline: (body.tagline || '').trim(), brandColor, guidelines } }
})
