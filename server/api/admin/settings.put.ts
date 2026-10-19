// Guardar ajustes de la comunidad (solo admin). Lo guardado se refleja
// de inmediato en toda la UI (encabezado, portada y reglas) porque todo
// sale de la fila del tenant.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const body = await readBody<{ name?: string, tagline?: string, brandColor?: string, guidelines?: string[] }>(event)
  const name = (body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, message: 'La comunidad necesita un nombre.' })
  const brandColor = /^#[0-9a-fA-F]{6}$/.test(body.brandColor || '') ? body.brandColor! : tenant.brand_color
  const guidelines = Array.isArray(body.guidelines)
    ? body.guidelines.map(g => String(g).trim()).filter(Boolean).slice(0, 20)
    : JSON.parse(tenant.guidelines || '[]') as string[]
  const db = await dbFor(event)
  await db.prepare('UPDATE tenants SET name = ?, tagline = ?, brand_color = ?, guidelines = ? WHERE id = ?')
    .run(name, (body.tagline || '').trim(), brandColor, JSON.stringify(guidelines), tenant.id)
  return { ok: true, settings: { name, tagline: (body.tagline || '').trim(), brandColor, guidelines } }
})
