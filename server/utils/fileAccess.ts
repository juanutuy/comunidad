import type { H3Event } from 'h3'
import { currentAuth, resolveTenant, canAccessChannel } from './community'
import type { ChannelRow } from './community'
import { dbFor } from './db'
import { requireSessionUnlessPublic, hasPaidEntitlement } from './privacy'
import { courseAccessible, courseCurriculum, flattenLessons, completedLessonIds, enrollmentOf, lessonAvailability } from './courses'
import type { CourseRow } from './courses'

/** Public identity assets are separate from resources whose owners carry access rules. */
export async function authorizeFile(event: H3Event, key: string): Promise<boolean> {
  if (/^(avatars|covers|branding)\//.test(key)) return true
  const tenant = await resolveTenant(event)
  const { user, role } = await currentAuth(event, tenant.id)
  const db = await dbFor(event)
  const upload = await db.prepare('SELECT user_id FROM uploads WHERE key = ? AND tenant_id = ?').get(key, tenant.id)
  if (!upload) return false
  if (role === 'admin') return true
  await requireSessionUnlessPublic(event, tenant.id, user)
  const url = `/api/files/${key}`
  const posts = await db.prepare(`SELECT DISTINCT p.* FROM posts p LEFT JOIN comments cm ON cm.post_id = p.id
    WHERE p.tenant_id = ? AND (p.media_url = ? OR instr(p.body_html, ?) > 0 OR (cm.media_url = ? AND ? IS NOT NULL))`)
    .all(tenant.id, url, url, url, user?.id ?? null)
  const courses = await db.prepare(`SELECT DISTINCT c.* FROM courses c JOIN chapters ch ON ch.course_id = c.id JOIN lessons l ON l.chapter_id = ch.id
    WHERE c.tenant_id = ? AND (l.file_url = ? OR l.resource_url = ? OR l.video_url = ? OR instr(l.content_html, ?) > 0)`)
    .all(tenant.id, url, url, url, url) as CourseRow[]
  const library = await db.prepare('SELECT locked FROM library_items WHERE tenant_id = ? AND file_key = ?').all(tenant.id, key)
  const channels = await db.prepare('SELECT * FROM channels WHERE tenant_id = ? AND cover_url = ?').all(tenant.id, url) as ChannelRow[]
  for (const channel of channels) if (await canAccessChannel(event, user?.id ?? null, role, channel)) return true
  for (const post of posts) {
    if (post.status !== 'published' && post.author_id !== user?.id) continue
    const channel = await db.prepare('SELECT * FROM channels WHERE id = ? AND tenant_id = ?').get(post.channel_id, tenant.id)
    if (channel && await canAccessChannel(event, user?.id ?? null, role, channel)) return true
  }
  for (const course of courses) {
    const enrollment = await enrollmentOf(event, tenant.id, course.id, user?.id ?? null)
    if (!courseAccessible(course, { loggedIn: !!user, isAdmin: false, enrolled: !!enrollment })) continue
    const flat = flattenLessons(await courseCurriculum(event, course.id))
    const completedIds = await completedLessonIds(event, tenant.id, course.id, user?.id ?? null)
    for (let i = 0; i < flat.length; i++) {
      const lesson = flat[i]!
      if (![lesson.file_url, lesson.resource_url, lesson.video_url].includes(url) && !lesson.content_html?.includes(url)) continue
      const available = lessonAvailability(course, lesson, { isAdmin: false, enrolledAt: enrollment?.created_at ?? null, completedIds, prevLessonId: i ? flat[i - 1]!.id : null })
      if ((lesson.is_free || enrollment) && !available.locked) return true
    }
  }
  for (const item of library) if (!item.locked || (user && await hasPaidEntitlement(event, tenant.id, user.id, role))) return true
  // Authors may preview uploads before attaching them, never after a resource denies access.
  return !posts.length && !courses.length && !library.length && !channels.length && upload.user_id === user?.id
}
