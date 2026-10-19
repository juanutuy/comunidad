// Crear un canal (solo admin del tenant).
import { requireAdmin, resolveTenant } from '../../utils/community'
import { rawDb, slugify } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = resolveTenant(event)
  requireAdmin(event, tenant.id)
  const body = await readBody<{ name?: string, description?: string, type?: string, priceCents?: number, groupId?: number }>(event)
  const name = (body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, message: 'El canal necesita un nombre.' })
  const type = ['free', 'private', 'paid'].includes(body.type || '') ? body.type! : 'free'
  const db = rawDb()
  let slug = slugify(name)
  if (db.prepare('SELECT id FROM channels WHERE tenant_id = ? AND slug = ?').get(tenant.id, slug))
    slug = `${slug}-${Math.floor(Math.random() * 9000 + 1000)}`
  const firstGroup = db.prepare('SELECT id FROM channel_groups WHERE tenant_id = ? ORDER BY sort LIMIT 1').get(tenant.id) as { id: number }
  const id = Number(db.prepare('INSERT INTO channels (tenant_id, group_id, slug, name, description, type, price_cents) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(tenant.id, body.groupId || firstGroup.id, slug, name, (body.description || '').trim(), type, type === 'paid' ? Number(body.priceCents || 0) : 0).lastInsertRowid)
  return { id, slug }
})
