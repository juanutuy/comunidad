// Anonymize a global account while retaining operational/financial records.
// The selected content policy applies across all communities for this global identity.
import { randomBytes } from 'node:crypto'
import { requireAdmin, resolveTenant } from '../../../../utils/community'
import { destroySession } from '../../../../utils/auth'
import { dbFor } from '../../../../utils/db'
import { deleteFile } from '../../../../utils/storage'
import { deleteCommentCascade, deletePostCascade } from '../../../../utils/moderation'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const admin = await requireAdmin(event, tenant.id)
  const targetId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ content?: string, confirmation?: string }>(event)
  if (!Number.isSafeInteger(targetId) || targetId <= 0) throw createError({ statusCode: 400, message: 'Cuenta inválida.' })
  if (body.content !== 'anonymize' && body.content !== 'delete') throw createError({ statusCode: 400, message: 'Elegí qué hacer con el contenido.' })
  if (body.confirmation !== 'ELIMINAR') throw createError({ statusCode: 400, message: 'Escribe ELIMINAR para confirmar la acción irreversible.' })
  const db = await dbFor(event)
  const target = await db.prepare('SELECT id FROM users WHERE id = ?').get(targetId) as { id: number } | undefined
  if (!target) throw createError({ statusCode: 404, message: 'Cuenta no encontrada.' })
  const memberships = await db.prepare('SELECT tenant_id, role FROM memberships WHERE user_id = ?').all(targetId) as { tenant_id: number, role: string }[]
  const actorWasAdmin = !!await db.prepare("SELECT id FROM memberships WHERE tenant_id = ? AND user_id = ? AND role = 'admin'").get(tenant.id, admin.id)
  if (!actorWasAdmin) throw createError({ statusCode: 403, message: 'Solo un administrador de comunidad puede eliminar cuentas.' })
  for (const membership of memberships.filter(m => m.role === 'admin')) {
    const admins = Number((await db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ? AND role = 'admin'").get(membership.tenant_id) as { n: number }).n)
    if (admins <= 1) throw createError({ statusCode: 400, message: 'No se puede eliminar esta cuenta porque es la única administradora de una comunidad.' })
  }

  if (body.content === 'delete') {
    const posts = await db.prepare(`SELECT p.id, p.tenant_id, p.slug, c.slug AS channel_slug FROM posts p JOIN channels c ON c.id = p.channel_id WHERE p.author_id = ?`).all(targetId) as { id: number, tenant_id: number, slug: string, channel_slug: string }[]
    for (const post of posts) await deletePostCascade(event, post.tenant_id, post.id, post.channel_slug, post.slug)
    const commentIds = await db.prepare('SELECT id FROM comments WHERE author_id = ?').all(targetId) as { id: number }[]
    for (const comment of commentIds) {
      await deleteCommentCascade(event, comment.id)
    }
  }

  const uploads = await db.prepare('SELECT id, tenant_id, key FROM uploads WHERE user_id = ?').all(targetId) as { id: number, tenant_id: number, key: string }[]
  const token = randomBytes(24).toString('hex')
  const placeholderEmail = `deleted-${targetId}-${token}@account.invalid`
  const slug = `deleted-${targetId}-${token}`
  const now = new Date().toISOString()
  const commands = [
    { sql: 'DELETE FROM dm_messages WHERE sender_id = ? OR recipient_id = ?', params: [targetId, targetId] },
    { sql: 'DELETE FROM access_links WHERE user_id = ?', params: [targetId] },
    { sql: 'DELETE FROM notifications WHERE user_id = ? OR actor_id = ?', params: [targetId, targetId] },
    { sql: 'DELETE FROM user_prefs WHERE user_id = ?', params: [targetId] },
    { sql: 'DELETE FROM user_hidden_posts WHERE user_id = ?', params: [targetId] },
    { sql: 'DELETE FROM user_blocks WHERE blocker_id = ? OR blocked_id = ?', params: [targetId, targetId] },
    { sql: 'DELETE FROM user_follows WHERE follower_id = ? OR followee_id = ?', params: [targetId, targetId] },
    { sql: 'DELETE FROM follows WHERE user_id = ?', params: [targetId] },
    { sql: 'DELETE FROM channel_access WHERE user_id = ?', params: [targetId] },
    { sql: 'DELETE FROM reactions WHERE user_id = ?', params: [targetId] },
    { sql: 'DELETE FROM comment_reactions WHERE user_id = ?', params: [targetId] },
    { sql: 'DELETE FROM bookmarks WHERE user_id = ?', params: [targetId] },
    { sql: 'DELETE FROM poll_votes WHERE user_id = ?', params: [targetId] },
    { sql: 'DELETE FROM rsvps WHERE user_id = ?', params: [targetId] },
    { sql: 'DELETE FROM chat_room_members WHERE user_id = ?', params: [targetId] },
    { sql: 'UPDATE chat_messages SET author_id = 0, body = \'[mensaje eliminado]\' WHERE author_id = ?', params: [targetId] },
    { sql: 'UPDATE chat_room_messages SET author_id = 0, body = \'[mensaje eliminado]\' WHERE author_id = ?', params: [targetId] },
    { sql: 'UPDATE posts SET body = \'\', body_html = \'\', teaser = \'\', media_type = \'none\', media_url = \'\', attachment_name = \'\' WHERE author_id = ?', params: [targetId] },
    { sql: 'UPDATE comments SET body = \'[comentario eliminado]\', media_type = \'none\', media_url = \'\', media_name = \'\' WHERE author_id = ?', params: [targetId] },
    { sql: 'UPDATE certificates SET member_name = \'Cuenta eliminada\' WHERE user_id = ?', params: [targetId] },
    { sql: "UPDATE email_log SET to_email = 'deleted@account.invalid', detail = '' WHERE user_id = ?", params: [targetId] },
    { sql: 'UPDATE membership_events SET actor_id = NULL WHERE actor_id = ?', params: [targetId] },
    { sql: 'DELETE FROM memberships WHERE user_id = ?', params: [targetId] },
    { sql: 'UPDATE membership_events SET user_id = 0 WHERE user_id = ?', params: [targetId] },
    { sql: "UPDATE join_requests SET answers = '[]' WHERE user_id = ?", params: [targetId] },
    { sql: 'UPDATE invitations SET email = \'\' WHERE lower(email) = (SELECT lower(email) FROM users WHERE id = ?)', params: [targetId] },
    { sql: 'UPDATE users SET name = \'Cuenta eliminada\', slug = ?, email = ?, password_hash = ?, bio = \'\', location = \'\', avatar_url = \'\', cover_url = \'\', token_version = token_version + 1, locale = NULL WHERE id = ?', params: [slug, placeholderEmail, `deleted:${token}`, targetId] },
    { sql: 'INSERT INTO membership_events (tenant_id, user_id, actor_id, action, reason, created_at) VALUES (?, 0, ?, ?, ?, ?)', params: [tenant.id, admin.id, 'account_anonymized', body.content === 'delete' ? 'Cuenta eliminada; contenido borrado globalmente' : 'Cuenta eliminada; contenido anonimizado globalmente', now] },
  ]
  await db.batch(commands)

  // Delete only files with no remaining references anywhere in the system.
  const unreferenced: { id: number, tenant_id: number, key: string }[] = []
  for (const upload of uploads) {
    const used = await db.prepare(`SELECT 1 AS used WHERE
      EXISTS (SELECT 1 FROM posts p WHERE p.media_url = ? OR instr(p.body_html, ?) > 0)
      OR EXISTS (SELECT 1 FROM comments c WHERE c.media_url = ?)
      OR EXISTS (SELECT 1 FROM users x WHERE x.avatar_url = ? OR x.cover_url = ?)
      OR EXISTS (SELECT 1 FROM courses c WHERE c.image_url = ? OR c.banner_url = ?)
      OR EXISTS (SELECT 1 FROM lessons l WHERE l.file_url = ? OR l.resource_url = ? OR l.video_url = ? OR instr(l.content_html, ?) > 0)
      OR EXISTS (SELECT 1 FROM library_items l WHERE l.file_key = ?)
      OR EXISTS (SELECT 1 FROM tenants t WHERE t.logo_url = ? OR t.logo_dark_url = ? OR t.icon_url = ? OR t.favicon_url = ?)
      OR EXISTS (SELECT 1 FROM channels c WHERE c.cover_url = ?)`).get(
      `/api/files/${upload.key}`, `/api/files/${upload.key}`, `/api/files/${upload.key}`,
      `/api/files/${upload.key}`, `/api/files/${upload.key}`, `/api/files/${upload.key}`, `/api/files/${upload.key}`,
      `/api/files/${upload.key}`, `/api/files/${upload.key}`, `/api/files/${upload.key}`, `/api/files/${upload.key}`, upload.key,
      `/api/files/${upload.key}`, `/api/files/${upload.key}`, `/api/files/${upload.key}`, `/api/files/${upload.key}`, `/api/files/${upload.key}`,
    ) as { used?: number } | undefined
    if (!used) unreferenced.push(upload)
  }
  for (const upload of unreferenced) {
    try {
      await deleteFile(event, upload.key)
      await db.prepare('DELETE FROM uploads WHERE id = ?').run(upload.id)
    }
    catch {
      // Retain the upload row so an operator can retry storage cleanup.
    }
  }
  if (admin.id === targetId) destroySession(event)
  return { ok: true, self: admin.id === targetId }
})
