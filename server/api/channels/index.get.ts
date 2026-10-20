// Grupos y canales del tenant, con estado de seguimiento del usuario.
import { canAccessChannel, channelContentType, channelVisibility, currentAuth, isChannelArchived, resolveTenant } from '../../utils/community'
import type { ChannelRow } from '../../utils/community'
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
  const channels = await db.prepare('SELECT * FROM channels WHERE tenant_id = ? ORDER BY sort').all(tenant.id) as unknown as ChannelRow[]
  const follows = new Set(user
    ? (await db.prepare('SELECT channel_id FROM follows WHERE tenant_id = ? AND user_id = ?').all(tenant.id, user.id) as unknown as { channel_id: number }[]).map(f => f.channel_id)
    : [])
  const followerCounts = new Map(
    (await db.prepare('SELECT channel_id, COUNT(*) AS n FROM follows WHERE tenant_id = ? GROUP BY channel_id').all(tenant.id) as unknown as { channel_id: number, n: number }[])
      .map(f => [Number(f.channel_id), Number(f.n)] as const),
  )
  // Fase 16: los canales archivados salen del listado (navegación,
  // compositor, selector de canales) para TODOS. Solo la página de
  // gestión de canales del admin los pide con ?includeArchived=1 —
  // y solo si quien pregunta es admin — para poder desarchivarlos.
  const includeArchived = getQuery(event).includeArchived === '1' && role === 'admin'
  // Fase 16-F: el acceso se calcula con canAccessChannel por canal
  // (incluye el eje de visibilidad): un canal 'secret' NO se lista
  // para quien no tiene acceso — ni el nombre viaja. Uno 'private'
  // sí se lista (metadatos), con hasAccess en falso hasta cumplirlo.
  const withAccess: { ch: ChannelRow, access: boolean }[] = []
  for (const ch of channels) {
    const access = await canAccessChannel(event, user?.id ?? null, role, ch)
    withAccess.push({ ch, access })
  }
  let visible = withAccess.filter(({ ch, access }) => {
    if (hidePrivate && ch.type === 'private') return false
    if (channelVisibility(ch) === 'secret' && !access) return false
    return true
  })
  if (!includeArchived) visible = visible.filter(({ ch }) => !isChannelArchived(ch))
  // El grupo por defecto es el primero del orden (el destino de los
  // canales cuando se elimina otro grupo, y el que no se elimina).
  const defaultGroupId = groups[0]?.id ?? null
  const visibleGroups = groups.filter(g => visible.some(({ ch }) => ch.group_id === g.id))
  return {
    groups: visibleGroups.map(g => ({
      id: g.id, name: g.name, isDefault: g.id === defaultGroupId,
      channels: visible.filter(({ ch }) => ch.group_id === g.id).map(({ ch, access }) => ({
        id: ch.id, slug: ch.slug, name: ch.name, icon: ch.icon, description: ch.description,
        type: ch.type, priceCents: ch.price_cents,
        contentType: channelContentType(ch),
        coverUrl: ch.cover_url || '',
        visibility: channelVisibility(ch),
        groupId: ch.group_id,
        archived: isChannelArchived(ch),
        postPermission: ch.post_permission || 'members',
        following: follows.has(ch.id),
        hasAccess: access,
        followerCount: followerCounts.get(ch.id) ?? 0,
      })),
    })),
  }
})
