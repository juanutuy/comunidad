// Editar un canal (solo admin). El slug no cambia para no romper enlaces.
// Fase 16: acepta también `postPermission` ('members'|'staff') y
// `archived` (true archiva con la fecha actual; false desarchiva) —
// ambos opcionales: quien no los manda no toca esos valores.
// Fase 16-F: acepta los ejes nuevos — `contentType` ('post'|'image'),
// `coverUrl` (portada) y `visibility` ('public'|'private'|'secret'),
// todos opcionales con la misma regla. Este endpoint es EL editor
// de canales del producto: lo usan la consola y el modal único en
// contexto (lateral, página del canal), sin duplicar lógica.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor, nowIso } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const channelId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ name?: string, description?: string, type?: string, priceCents?: number, groupId?: number, icon?: string, postPermission?: string, archived?: boolean, contentType?: string, coverUrl?: string, visibility?: string }>(event)
  const db = await dbFor(event)
  const channel = await db.prepare('SELECT * FROM channels WHERE id = ? AND tenant_id = ?').get(channelId, tenant.id) as Record<string, unknown> | undefined
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  const name = (body.name ?? String(channel.name)).trim()
  if (!name) throw createError({ statusCode: 400, message: 'El canal necesita un nombre.' })
  const type = ['free', 'private', 'paid'].includes(body.type || '') ? body.type! : String(channel.type)
  const postPermission = ['members', 'staff'].includes(body.postPermission || '')
    ? body.postPermission!
    : String(channel.post_permission || 'members')
  const contentType = ['post', 'image'].includes(body.contentType || '')
    ? body.contentType!
    : String(channel.content_type || 'post')
  const visibility = ['public', 'private', 'secret'].includes(body.visibility || '')
    ? body.visibility!
    : String(channel.visibility || 'public')
  const coverUrl = typeof body.coverUrl === 'string' ? body.coverUrl.trim().slice(0, 500) : String(channel.cover_url || '')
  const archivedAt = typeof body.archived === 'boolean'
    ? (body.archived ? (String(channel.archived_at || '') || nowIso()) : '')
    : String(channel.archived_at || '')
  await db.prepare('UPDATE channels SET name = ?, description = ?, type = ?, price_cents = ?, group_id = ?, icon = ?, post_permission = ?, archived_at = ?, content_type = ?, cover_url = ?, visibility = ? WHERE id = ?')
    .run(
      name,
      String(body.description ?? String(channel.description)).trim().slice(0, 280),
      type,
      type === 'paid' ? Number(body.priceCents ?? channel.price_cents) : 0,
      body.groupId || channel.group_id,
      body.icon || channel.icon,
      postPermission,
      archivedAt,
      contentType,
      coverUrl,
      visibility,
      channelId,
    )
  return { ok: true, id: channelId, slug: channel.slug, postPermission, archived: !!archivedAt, contentType, visibility }
})
