// Crear una sala grupal de chat (Fase 5): nombre + al menos 2
// miembros más del tenant (además de quien la crea).
import { requireCanWrite, requireUser, resolveTenant } from '../utils/community'
import { nowIso, dbFor } from '../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireUser(event, tenant.id)
  // Fase 14: crear una sala es participar — no con la cuenta restringida.
  await requireCanWrite(event, tenant.id, me.id)
  const body = await readBody<{ name?: string, memberSlugs?: string[] }>(event)
  const name = (body.name || '').trim()
  if (!name || name.length > 60) throw createError({ statusCode: 400, message: 'La sala necesita un nombre de hasta 60 caracteres.' })
  const slugs = [...new Set((body.memberSlugs || []).map(s => String(s).trim()).filter(Boolean))]
  if (slugs.length < 2) throw createError({ statusCode: 400, message: 'Elegí al menos 2 miembros más para la sala.' })
  const db = await dbFor(event)
  const members = await db.prepare(`SELECT u.id, u.slug FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ? WHERE u.slug IN (${slugs.map(() => '?').join(', ')}) AND u.id != ?`)
    .all(tenant.id, ...slugs, me.id) as { id: number, slug: string }[]
  if (members.length < 2) throw createError({ statusCode: 400, message: 'Esos miembros no están en esta comunidad.' })
  const roomId = Number((await db.prepare('INSERT INTO chat_rooms (tenant_id, name, created_by, created_at) VALUES (?, ?, ?, ?)')
    .run(tenant.id, name, me.id, nowIso())).lastInsertRowId)
  await db.prepare('INSERT OR IGNORE INTO chat_room_members (tenant_id, room_id, user_id) VALUES (?, ?, ?)').run(tenant.id, roomId, me.id)
  for (const m of members)
    await db.prepare('INSERT OR IGNORE INTO chat_room_members (tenant_id, room_id, user_id) VALUES (?, ?, ?)').run(tenant.id, roomId, m.id)
  return { room: { id: roomId, name, memberCount: members.length + 1 } }
})
