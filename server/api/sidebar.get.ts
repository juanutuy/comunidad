// Datos del rail derecho: próximos eventos y publicaciones recientes.
import { resolveTenant } from '../utils/community'
import { dbFor } from '../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const db = await dbFor(event)
  const events = await db.prepare(`SELECT slug, title, starts_at FROM events WHERE tenant_id = ? AND starts_at >= datetime('now') ORDER BY starts_at LIMIT 3`).all(tenant.id)
  const recent = await db.prepare(`SELECT p.slug, p.title, c.slug AS channel_slug FROM posts p JOIN channels c ON c.id = p.channel_id WHERE p.tenant_id = ? AND c.type = 'free' ORDER BY p.pinned DESC, p.created_at DESC LIMIT 5`).all(tenant.id)
  return { events, recent }
})
