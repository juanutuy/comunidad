// Tenant administrators can erase a membership and its local identity references only.
// Global credentials and memberships in other communities remain owned by the user.
import { randomBytes } from 'node:crypto'
import { requireAdmin, resolveTenant } from '../../../../utils/community'
import { destroySession } from '../../../../utils/auth'
import { dbFor, type DbCommand } from '../../../../utils/db'
import { deleteFile } from '../../../../utils/storage'
import { postDeletionCommands } from '../../../../utils/moderation'
import { cancelStripeSubscription } from '../../../../utils/stripe'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const admin = await requireAdmin(event, tenant.id)
  const targetId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ content?: string, confirmation?: string }>(event)
  if (!Number.isSafeInteger(targetId) || targetId <= 0) throw createError({ statusCode: 400, message: 'Cuenta inválida.' })
  if (body.content !== 'anonymize' && body.content !== 'delete') throw createError({ statusCode: 400, message: 'Elegí qué hacer con el contenido.' })
  if (body.confirmation !== 'ELIMINAR') throw createError({ statusCode: 400, message: 'Escribe ELIMINAR para confirmar.' })
  const db = await dbFor(event)
  const target = await db.prepare('SELECT role FROM memberships WHERE tenant_id = ? AND user_id = ?').get(tenant.id, targetId) as { role: string } | undefined
  if (!target) throw createError({ statusCode: 404, message: 'Esa persona no pertenece a esta comunidad.' })
  if (target.role === 'admin') {
    const count = await db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ? AND role = 'admin' AND status = 'active'").get(tenant.id) as { n: number }
    if (count.n <= 1) throw createError({ statusCode: 400, message: 'No se puede eliminar al único administrador activo.' })
  }
  const subscriptions = await db.prepare("SELECT stripe_subscription_id FROM member_subscriptions WHERE tenant_id = ? AND user_id = ? AND status <> 'canceled' AND stripe_subscription_id <> ''").all(tenant.id, targetId) as { stripe_subscription_id: string }[]
  for (const subscription of subscriptions) await cancelStripeSubscription(subscription.stripe_subscription_id)

  const uploads = await db.prepare('SELECT id, tenant_id, key FROM uploads WHERE tenant_id = ? AND user_id = ?').all(tenant.id, targetId) as { id: number, tenant_id: number, key: string }[]
  const token = randomBytes(24).toString('hex')
  const slug = `deleted-${tenant.id}-${token}`
  const now = new Date().toISOString()
  const commands: DbCommand[] = [
    { sql: "INSERT INTO users (name, slug, email, password_hash, created_at, website) VALUES ('Cuenta eliminada', ?, ?, ?, ?, '')", params: [slug, `${slug}@account.invalid`, `deleted:${token}`, now] },
  ]
  if (body.content === 'delete') {
    const posts = await db.prepare('SELECT p.id, p.slug, c.slug AS channel_slug FROM posts p JOIN channels c ON c.id = p.channel_id WHERE p.tenant_id = ? AND p.author_id = ?').all(tenant.id, targetId) as { id: number, slug: string, channel_slug: string }[]
    for (const post of posts) commands.push(...postDeletionCommands(tenant.id, post.id, post.channel_slug, post.slug))
    // Remove authored comments and their replies, with reactions, in the same transaction.
    const rows = await db.prepare('SELECT id FROM comments WHERE tenant_id = ? AND (author_id = ? OR parent_id IN (SELECT id FROM comments WHERE tenant_id = ? AND author_id = ?))').all(tenant.id, targetId, tenant.id, targetId) as { id: number }[]
    const ids = JSON.stringify(rows.map(r => r.id))
    commands.push(
      { sql: 'DELETE FROM comment_reactions WHERE tenant_id = ? AND comment_id IN (SELECT value FROM json_each(?))', params: [tenant.id, ids] },
      { sql: 'DELETE FROM comments WHERE tenant_id = ? AND id IN (SELECT value FROM json_each(?))', params: [tenant.id, ids] },
    )
  }
  // A tombstone has no membership or usable credential and no personal profile data.
  // Reassign public authorship instead of clearing retained bodies or attachments.
  for (const [table, column] of [['posts', 'author_id'], ['comments', 'author_id'], ['events', 'host_id'], ['chat_rooms', 'created_by'], ['uploads', 'user_id'], ['payments', 'user_id'], ['certificates', 'user_id']] as const) {
    commands.push({ sql: `UPDATE ${table} SET ${column} = (SELECT id FROM users WHERE slug = ?) WHERE tenant_id = ? AND ${column} = ?`, params: [slug, tenant.id, targetId] })
  }
  for (const table of ['access_links', 'user_prefs', 'user_hidden_posts', 'follows', 'channel_access', 'reactions', 'comment_reactions', 'bookmarks', 'poll_votes', 'rsvps', 'chat_room_members', 'enrollments', 'lesson_progress', 'point_events']) {
    commands.push({ sql: `DELETE FROM ${table} WHERE tenant_id = ? AND user_id = ?`, params: [tenant.id, targetId] })
  }
  commands.push(
    { sql: 'DELETE FROM dm_messages WHERE tenant_id = ? AND (sender_id = ? OR recipient_id = ?)', params: [tenant.id, targetId, targetId] },
    { sql: 'DELETE FROM notifications WHERE tenant_id = ? AND (user_id = ? OR actor_id = ?)', params: [tenant.id, targetId, targetId] },
    { sql: 'DELETE FROM user_blocks WHERE tenant_id = ? AND (blocker_id = ? OR blocked_id = ?)', params: [tenant.id, targetId, targetId] },
    { sql: 'DELETE FROM user_follows WHERE tenant_id = ? AND (follower_id = ? OR followee_id = ?)', params: [tenant.id, targetId, targetId] },
    { sql: 'DELETE FROM chat_messages WHERE tenant_id = ? AND author_id = ?', params: [tenant.id, targetId] },
    { sql: 'DELETE FROM chat_room_messages WHERE tenant_id = ? AND author_id = ?', params: [tenant.id, targetId] },
    { sql: "UPDATE certificates SET member_name = 'Cuenta eliminada' WHERE tenant_id = ? AND user_id = (SELECT id FROM users WHERE slug = ?)", params: [tenant.id, slug] },
    { sql: "UPDATE member_subscriptions SET status = 'canceled', stripe_customer_id = '', user_id = (SELECT id FROM users WHERE slug = ?), updated_at = ? WHERE tenant_id = ? AND user_id = ?", params: [slug, now, tenant.id, targetId] },
    { sql: "UPDATE email_log SET to_email = 'deleted@account.invalid', detail = '', user_id = (SELECT id FROM users WHERE slug = ?) WHERE tenant_id = ? AND user_id = ?", params: [slug, tenant.id, targetId] },
    { sql: 'UPDATE membership_events SET actor_id = NULL WHERE tenant_id = ? AND actor_id = ?', params: [tenant.id, targetId] },
    { sql: 'UPDATE membership_events SET user_id = (SELECT id FROM users WHERE slug = ?) WHERE tenant_id = ? AND user_id = ?', params: [slug, tenant.id, targetId] },
    { sql: 'DELETE FROM join_requests WHERE tenant_id = ? AND user_id = ?', params: [tenant.id, targetId] },
    { sql: "UPDATE invitations SET email = '', status = 'revoked' WHERE tenant_id = ? AND lower(email) = (SELECT lower(email) FROM users WHERE id = ?)", params: [tenant.id, targetId] },
    { sql: 'DELETE FROM memberships WHERE tenant_id = ? AND user_id = ?', params: [tenant.id, targetId] },
    { sql: 'INSERT INTO membership_events (tenant_id, user_id, actor_id, action, reason, created_at) VALUES (?, (SELECT id FROM users WHERE slug = ?), ?, ?, ?, ?)', params: [tenant.id, slug, admin.id, 'community_account_removed', body.content, now] },
  )
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
