// Bloqueados y ocultos del usuario actual (Fase 5): las dos listas
// que se gestionan desde Ajustes de cuenta → «Bloqueados y ocultos».
import { requireUser, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireUser(event, tenant.id)
  const db = await dbFor(event)
  const blocked = await db.prepare(`SELECT u.id, u.name, u.slug, u.avatar_url, b.created_at
    FROM user_blocks b JOIN users u ON u.id = b.blocked_id
    WHERE b.tenant_id = ? AND b.blocker_id = ? ORDER BY u.name`).all(tenant.id, me.id) as Record<string, unknown>[]
  const hidden = await db.prepare(`SELECT p.id, p.title, p.slug, c.slug AS channel_slug, c.name AS channel_name, u.name AS author_name, h.created_at
    FROM user_hidden_posts h JOIN posts p ON p.id = h.post_id JOIN channels c ON c.id = p.channel_id JOIN users u ON u.id = p.author_id
    WHERE h.tenant_id = ? AND h.user_id = ? ORDER BY h.created_at DESC`).all(tenant.id, me.id) as Record<string, unknown>[]
  return {
    blocked: blocked.map(b => ({ id: b.id, name: b.name, slug: b.slug, avatarUrl: b.avatar_url || '', createdAt: b.created_at })),
    hidden: hidden.map(h => ({
      id: h.id, title: h.title, slug: h.slug, channelSlug: h.channel_slug, channelName: h.channel_name,
      authorName: h.author_name, createdAt: h.created_at,
    })),
  }
})
