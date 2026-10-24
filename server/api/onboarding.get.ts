import { requireUser, resolveTenant } from '../utils/community'
import { dbFor } from '../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const db = await dbFor(event)
  setHeader(event, 'cache-control', 'private, no-store')
  const membership = await db.prepare('SELECT role FROM memberships WHERE tenant_id = ? AND user_id = ?').get(tenant.id, user.id)
  const following = await db.prepare('SELECT id FROM follows WHERE tenant_id = ? AND user_id = ? LIMIT 1').get(tenant.id, user.id)
  const post = await db.prepare("SELECT id FROM posts WHERE tenant_id = ? AND author_id = ? AND status = 'published' LIMIT 1").get(tenant.id, user.id)
  return { steps: [
    { key: 'profile', done: !!user.avatar_url && !!user.bio.trim(), to: '/settings?section=perfil' },
    { key: 'channels', done: !!following, to: '/channels' },
    { key: 'post', done: !!post, to: '/feeds' },
    ...(membership?.role === 'admin' ? [{ key: 'setup', done: !!tenant.icon_url && !!tenant.logo_url, to: '/admin/settings' }] : []),
  ] }
})
