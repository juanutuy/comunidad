// Crear una etiqueta privada (solo admin, Fase 14). Nombre único por
// tenant, sin distinguir mayúsculas («VIP» y «vip» son la misma).
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor, nowIso } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const body = await readBody<{ name?: string }>(event)
  const name = (body.name || '').trim().slice(0, 40)
  if (!name) throw createError({ statusCode: 400, message: 'La etiqueta necesita un nombre.' })
  const db = await dbFor(event)
  const dupe = await db.prepare('SELECT id FROM member_tags WHERE tenant_id = ? AND lower(name) = lower(?)').get(tenant.id, name)
  if (dupe) throw createError({ statusCode: 409, message: 'Ya existe una etiqueta con ese nombre.' })
  const id = Number((await db.prepare('INSERT INTO member_tags (tenant_id, name, created_at) VALUES (?, ?, ?)')
    .run(tenant.id, name, nowIso())).lastInsertRowId)
  return { ok: true, tag: { id, name, members: 0 } }
})
