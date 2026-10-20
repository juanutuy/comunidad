// Crear un grupo de canales (solo admin). Fase 16-F: los grupos ya
// existían en el esquema (channel_groups) y el lateral ya los
// renderizaba; lo nuevo es gestionarlos en contexto, sin consola.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const body = await readBody<{ name?: string }>(event)
  const name = String(body.name || '').trim().slice(0, 60)
  if (!name) throw createError({ statusCode: 400, message: 'El grupo necesita un nombre.' })
  const db = await dbFor(event)
  const last = await db.prepare('SELECT MAX(sort) AS s FROM channel_groups WHERE tenant_id = ?').get(tenant.id) as { s: number | null }
  const id = Number((await db.prepare('INSERT INTO channel_groups (tenant_id, name, sort) VALUES (?, ?, ?)')
    .run(tenant.id, name, (last?.s ?? 0) + 1)).lastInsertRowId)
  return { id, name }
})
