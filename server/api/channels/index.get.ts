// Grupos y canales del tenant, con estado de seguimiento del usuario.
import { currentAuth, isChannelArchived, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { getPrivacySettings, requireSessionUnlessPublic } from '../../utils/privacy'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const { user, role } = await currentAuth(event, tenant.id)
  // Endurecimiento Fase 15: comunidad privada = el listado de canales
  // (nombres incluidos) no se lee sin sesión.
  await requireSessionUnlessPublic(event, tenant.id, user)
  // Fase 15: en el modo público, el visitante no ve los canales
  // privados en el listado (ni el nombre): para él no existen. Con
  // sesión, o en el modo privado de siempre, el listado no cambia.
  const priv = await getPrivacySettings(event, tenant.id)
  const hidePrivate = !user && priv.visibility === 'public'
  const db = await dbFor(event)
  const groups = await db.prepare('SELECT * FROM channel_groups WHERE tenant_id = ? ORDER BY sort').all(tenant.id) as unknown as { id: number, name: string }[]
  const channels = await db.prepare('SELECT * FROM channels WHERE tenant_id = ? ORDER BY sort').all(tenant.id) as Record<string, unknown>[]
  const follows = new Set(user
    ? (await db.prepare('SELECT channel_id FROM follows WHERE tenant_id = ? AND user_id = ?').all(tenant.id, user.id) as unknown as { channel_id: number }[]).map(f => f.channel_id)
    : [])
  const access = new Set(user
    ? (await db.prepare('SELECT channel_id FROM channel_access WHERE tenant_id = ? AND user_id = ?').all(tenant.id, user.id) as unknown as { channel_id: number }[]).map(f => f.channel_id)
    : [])
  // Fase 16: los canales archivados salen del listado (navegación,
  // compositor, selector de canales) para TODOS. Solo la página de
  // gestión de canales del admin los pide con ?includeArchived=1 —
  // y solo si quien pregunta es admin — para poder desarchivarlos.
  const includeArchived = getQuery(event).includeArchived === '1' && role === 'admin'
  let visibleChannels = hidePrivate ? channels.filter(c => c.type !== 'private') : channels
  if (!includeArchived) visibleChannels = visibleChannels.filter(c => !isChannelArchived(c as { archived_at?: string }))
  const visibleGroups = hidePrivate
    ? groups.filter(g => visibleChannels.some(c => c.group_id === g.id))
    : groups
  return {
    groups: visibleGroups.map(g => ({
      id: g.id, name: g.name,
      channels: visibleChannels.filter(c => c.group_id === g.id).map(c => ({
        id: c.id, slug: c.slug, name: c.name, icon: c.icon, description: c.description,
        type: c.type, priceCents: c.price_cents,
        archived: isChannelArchived(c as { archived_at?: string }),
        postPermission: (c.post_permission as string) || 'members',
        following: follows.has(c.id as number),
        hasAccess: c.type !== 'paid' || access.has(c.id as number),
      })),
    })),
  }
})
