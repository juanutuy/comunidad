// Editar un canal (solo admin). El slug no cambia para no romper enlaces.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const channelId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ name?: string, description?: string, type?: string, priceCents?: number, groupId?: number, icon?: string }>(event)
  const db = await dbFor(event)
  const channel = await db.prepare('SELECT * FROM channels WHERE id = ? AND tenant_id = ?').get(channelId, tenant.id) as Record<string, unknown> | undefined
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  const name = (body.name ?? String(channel.name)).trim()
  if (!name) throw createError({ statusCode: 400, message: 'El canal necesita un nombre.' })
  const type = ['free', 'private', 'paid'].includes(body.type || '') ? body.type! : String(channel.type)
  await db.prepare('UPDATE channels SET name = ?, description = ?, type = ?, price_cents = ?, group_id = ?, icon = ? WHERE id = ?')
    .run(
      name,
      (body.description ?? String(channel.description)).trim(),
      type,
      type === 'paid' ? Number(body.priceCents ?? channel.price_cents) : 0,
      body.groupId || channel.group_id,
      body.icon || channel.icon,
      channelId,
    )
  return { ok: true, id: channelId, slug: channel.slug }
})
