// Guardar ajustes de la comunidad (solo admin). Lo guardado se refleja
// de inmediato en toda la UI (encabezado, portada y reglas) porque todo
// sale de la fila del tenant.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const body = await readBody<{ name?: string, tagline?: string, brandColor?: string, guidelines?: string[], terms?: string, privacy?: string, moderationReview?: boolean }>(event)
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
  return { ok: true, settings: { name, tagline: (body.tagline || '').trim(), brandColor, guidelines } }
})
