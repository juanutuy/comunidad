// Directorio de miembros del tenant (Fase 5): buscador por nombre,
// filtro por rol y punto de «en línea» por last_seen_at. Respeta la
// privacidad: quien apaga «Aparecer en el directorio» en sus ajustes
// no figura aquí para nadie.
// Fase 15: la AUDIENCIA del directorio es un ajuste del tenant —
// 'members' (por defecto: como siempre, solo con sesión), 'everyone'
// (también visitantes, solo en el modo público y con una forma
// reducida: sin presencia ni última conexión, y nunca correos),
// 'paid' (solo miembros con un entitlement pago vivo; el admin entra
// siempre) y 'disabled' (apagado para todos menos el admin).
import { currentAuth, resolveTenant } from '../../utils/community'
import { isOnline } from '../../utils/chat'
import { dbFor } from '../../utils/db'
import { getPrivacySettings, hasPaidEntitlement } from '../../utils/privacy'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const priv = await getPrivacySettings(event, tenant.id)
  const { user, role } = await currentAuth(event, tenant.id)
  const isAdmin = role === 'admin'
  let visitorView = false
  if (!isAdmin) {
    if (priv.directoryAudience === 'disabled') {
      if (!user) throw createError({ statusCode: 401, message: 'Iniciá sesión para continuar.' })
      throw createError({ statusCode: 403, message: 'El directorio de miembros está desactivado en esta comunidad.' })
    }
    if (priv.directoryAudience === 'paid') {
      if (!user) throw createError({ statusCode: 401, message: 'Iniciá sesión para continuar.' })
      if (!(await hasPaidEntitlement(event, tenant.id, user.id, role)))
        throw createError({ statusCode: 403, message: 'El directorio de miembros es solo para miembros con una membresía paga activa.' })
    }
    if (!user) {
      // Sin sesión solo se entra como visitante en el modo público
      // con la audiencia en 'everyone' (y la vista es reducida).
      if (priv.visibility === 'public' && priv.directoryAudience === 'everyone') visitorView = true
      else throw createError({ statusCode: 401, message: 'Iniciá sesión para ver el directorio de miembros.' })
    }
    else if (priv.directoryAudience === 'everyone' && priv.visibility !== 'public') {
      // 'everyone' con la comunidad privada no cambia nada para los
      // miembros (ven el directorio completo, como siempre).
    }
  }
  const q = String(getQuery(event).q || '').trim()
  const roleFilter = String(getQuery(event).role || 'all')
  const db = await dbFor(event)
  const rows = await db.prepare(`SELECT u.id, u.name, u.slug, u.bio, u.avatar_url, u.last_seen_at, u.created_at, m.role
    FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ?
    WHERE NOT EXISTS (SELECT 1 FROM user_prefs pr WHERE pr.tenant_id = ? AND pr.user_id = u.id AND pr.key = 'directory_visible' AND pr.value = '0')
    ORDER BY u.name`).all(tenant.id, tenant.id) as Record<string, unknown>[]
  let members = rows.map(r => ({
    id: r.id, name: r.name, slug: r.slug, bio: r.bio || '', avatarUrl: r.avatar_url || '',
    role: r.role, memberSince: r.created_at,
    // La vista de visitante no lleva presencia: nada de «en línea» ni
    // última conexión de los miembros sale sin sesión.
    online: visitorView ? false : isOnline(r.last_seen_at as string),
    lastSeenAt: visitorView ? '' : (r.last_seen_at || ''),
  }))
  if (q) members = members.filter(m => String(m.name).toLowerCase().includes(q.toLowerCase()))
  if (roleFilter === 'admin' || roleFilter === 'member') members = members.filter(m => m.role === roleFilter)
  // Primero los que están en línea, después por nombre.
  members.sort((a, b) => Number(b.online) - Number(a.online) || String(a.name).localeCompare(String(b.name)))
  return { members, total: members.length }
})
