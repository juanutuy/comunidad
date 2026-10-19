// Grupos y canales del tenant, con estado de seguimiento del usuario.
import { currentAuth, resolveTenant } from '../../utils/community'
import { rawDb } from '../../utils/db'

export default defineEventHandler((event) => {
  const tenant = resolveTenant(event)
  const { user } = currentAuth(event, tenant.id)
  const db = rawDb()
  const groups = db.prepare('SELECT * FROM channel_groups WHERE tenant_id = ? ORDER BY sort').all(tenant.id) as { id: number, name: string }[]
  const channels = db.prepare('SELECT * FROM channels WHERE tenant_id = ? ORDER BY sort').all(tenant.id) as Record<string, unknown>[]
  const follows = new Set(user
    ? (db.prepare('SELECT channel_id FROM follows WHERE tenant_id = ? AND user_id = ?').all(tenant.id, user.id) as { channel_id: number }[]).map(f => f.channel_id)
    : [])
  const access = new Set(user
    ? (db.prepare('SELECT channel_id FROM channel_access WHERE tenant_id = ? AND user_id = ?').all(tenant.id, user.id) as { channel_id: number }[]).map(f => f.channel_id)
    : [])
  return {
    groups: groups.map(g => ({
      id: g.id, name: g.name,
      channels: channels.filter(c => c.group_id === g.id).map(c => ({
        id: c.id, slug: c.slug, name: c.name, icon: c.icon, description: c.description,
        type: c.type, priceCents: c.price_cents,
        following: follows.has(c.id as number),
        hasAccess: c.type !== 'paid' || access.has(c.id as number),
      })),
    })),
  }
})
