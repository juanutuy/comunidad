// Crear un canal (solo admin del tenant).
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor, slugify } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const body = await readBody<{ name?: string, description?: string, type?: string, priceCents?: number, groupId?: number, postPermission?: string, contentType?: string, coverUrl?: string, visibility?: string }>(event)
  const name = (body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, message: 'El canal necesita un nombre.' })
  const type = ['free', 'private', 'paid'].includes(body.type || '') ? body.type! : 'free'
  const postPermission = body.postPermission === 'staff' ? 'staff' : 'members'
  // Fase 16-F: tipo de contenido y visibilidad son ejes propios.
  const contentType = body.contentType === 'image' ? 'image' : 'post'
  const visibility = ['public', 'private', 'secret'].includes(body.visibility || '') ? body.visibility! : 'public'
  const coverUrl = String(body.coverUrl || '').trim().slice(0, 500)
  const description = String(body.description || '').trim().slice(0, 280)
  const db = await dbFor(event)
  let slug = slugify(name)
  if (await db.prepare('SELECT id FROM channels WHERE tenant_id = ? AND slug = ?').get(tenant.id, slug))
    slug = `${slug}-${Math.floor(Math.random() * 9000 + 1000)}`
  const firstGroup = await db.prepare('SELECT id FROM channel_groups WHERE tenant_id = ? ORDER BY sort LIMIT 1').get(tenant.id) as { id: number }
  const id = Number((await db.prepare('INSERT INTO channels (tenant_id, group_id, slug, name, description, type, price_cents, post_permission, content_type, cover_url, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(tenant.id, body.groupId || firstGroup.id, slug, name, description, type, type === 'paid' ? Number(body.priceCents || 0) : 0, postPermission, contentType, coverUrl, visibility)).lastInsertRowId)
  return { id, slug }
})
