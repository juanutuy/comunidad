// Directorio público de miembros del tenant (Fase 5): buscador por
// nombre, filtro por rol y punto de «en línea» por last_seen_at.
// Respeta la privacidad: quien apaga «Aparecer en el directorio» en
// sus ajustes no figura aquí para nadie.
import { requireUser, resolveTenant } from '../../utils/community'
import { isOnline } from '../../utils/chat'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireUser(event, tenant.id)
  const q = String(getQuery(event).q || '').trim()
  const role = String(getQuery(event).role || 'all')
  const db = await dbFor(event)
  const rows = await db.prepare(`SELECT u.id, u.name, u.slug, u.bio, u.avatar_url, u.last_seen_at, u.created_at, m.role
    FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ?
    WHERE NOT EXISTS (SELECT 1 FROM user_prefs pr WHERE pr.tenant_id = ? AND pr.user_id = u.id AND pr.key = 'directory_visible' AND pr.value = '0')
    ORDER BY u.name`).all(tenant.id, tenant.id) as Record<string, unknown>[]
  let members = rows.map(r => ({
    id: r.id, name: r.name, slug: r.slug, bio: r.bio || '', avatarUrl: r.avatar_url || '',
    role: r.role, memberSince: r.created_at, online: isOnline(r.last_seen_at as string), lastSeenAt: r.last_seen_at || '',
  }))
  if (q) members = members.filter(m => String(m.name).toLowerCase().includes(q.toLowerCase()))
  if (role === 'admin' || role === 'member') members = members.filter(m => m.role === role)
  // Primero los que están en línea, después por nombre.
  members.sort((a, b) => Number(b.online) - Number(a.online) || String(a.name).localeCompare(String(b.name)))
  return { members, total: members.length }
})
