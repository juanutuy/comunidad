// Tabla de Contenido → Canales (Fase 16): todos los canales del
// tenant, incluidos los archivados (esta es la vista de consola: el
// listado de miembros los excluye). «Seguidores» es el conteo real
// de follows — nuestros canales no tienen otra lista de miembros.
// Acceso: solo admin.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const db = await dbFor(event)
  const rows = await db.prepare(`SELECT c.*, g.name AS group_name,
      (SELECT COUNT(*) FROM follows f WHERE f.tenant_id = c.tenant_id AND f.channel_id = c.id) AS follower_count
    FROM channels c LEFT JOIN channel_groups g ON g.id = c.group_id
    WHERE c.tenant_id = ? ORDER BY c.sort, c.id`).all(tenant.id) as Record<string, unknown>[]
  return {
    channels: rows.map(c => ({
      id: Number(c.id), slug: c.slug, name: c.name, icon: c.icon || 'i-lucide-hash',
      description: c.description || '', type: c.type, priceCents: Number(c.price_cents || 0),
      groupName: (c.group_name as string) || '',
      followers: Number(c.follower_count || 0),
      postPermission: (c.post_permission as string) || 'members',
      archived: !!(c.archived_at && String(c.archived_at).trim()),
      archivedAt: (c.archived_at as string) || '',
    })),
  }
})
