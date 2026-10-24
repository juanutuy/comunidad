import { timingSafeEqual } from 'node:crypto'
import { dbFor, nowIso } from '../../utils/db'
import { emailEnabled, sendEmail } from '../../utils/email'

export default defineEventHandler(async (event) => {
  const secret = String(useRuntimeConfig().cronSecret || '')
  const supplied = getHeader(event, 'x-cron-secret') || (getHeader(event, 'authorization') || '').replace(/^Bearer\s+/i, '')
  if (!secret) throw createError({ statusCode: 503, message: 'Recordatorios no configurados. / Reminders not configured.' })
  if (Buffer.byteLength(secret) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) throw createError({ statusCode: 401, message: 'Unauthorized' })
  const db = await dbFor(event)
  const now = Date.now()
  let processed = 0
  for (const stage of [{ key: 'day', after: 3600000, before: 86400000 }, { key: 'hour', after: 0, before: 3600000 }]) {
    for (const channel of ['inapp', 'email'] as const) {
      if (channel === 'email' && !emailEnabled()) continue
      const preference = channel === 'email' ? 'email_event' : 'notify_event'
      const rows = await db.prepare(`SELECT e.id AS event_id, e.tenant_id, e.title, e.slug, e.starts_at, e.timezone, u.id AS user_id, u.email, COALESCE(u.locale, t.default_locale) AS locale,
          (SELECT domain FROM tenant_domains d WHERE d.tenant_id = e.tenant_id ORDER BY d.id LIMIT 1) AS domain
        FROM events e JOIN rsvps r ON r.event_id = e.id AND r.tenant_id = e.tenant_id
        JOIN memberships m ON m.tenant_id = e.tenant_id AND m.user_id = r.user_id
        JOIN users u ON u.id = r.user_id JOIN tenants t ON t.id = e.tenant_id
        WHERE e.starts_at > ? AND e.starts_at <= ? AND m.status IN ('active', 'restricted')
        AND NOT EXISTS (SELECT 1 FROM user_prefs p WHERE p.tenant_id = e.tenant_id AND p.user_id = u.id AND p.key = ? AND p.value = '0')
        AND NOT EXISTS (SELECT 1 FROM event_reminders er WHERE er.tenant_id = e.tenant_id AND er.event_id = e.id AND er.user_id = u.id AND er.reminder_key = e.starts_at || ? AND (er.status = 'sent' OR er.lease_until > ? OR er.attempts >= 3))
        ORDER BY e.starts_at, e.id, u.id LIMIT 50`).all(new Date(now + stage.after).toISOString(), new Date(now + stage.before).toISOString(), preference, `:${stage.key}:${channel}`, now)
      for (const row of rows) {
        const key = `${row.starts_at}:${stage.key}:${channel}`
        const lease = now + 300000
        const claim = await db.prepare(`INSERT INTO event_reminders (tenant_id, event_id, user_id, reminder_key, status, lease_until, attempts, updated_at) VALUES (?, ?, ?, ?, 'processing', ?, 1, ?)
          ON CONFLICT(tenant_id, event_id, user_id, reminder_key) DO UPDATE SET status = 'processing', lease_until = excluded.lease_until, attempts = event_reminders.attempts + 1, updated_at = excluded.updated_at
          WHERE event_reminders.status <> 'sent' AND event_reminders.lease_until <= ? AND event_reminders.attempts < 3 RETURNING attempts`)
          .get(row.tenant_id, row.event_id, row.user_id, key, lease, nowIso(), now)
        if (!claim) continue
        const en = row.locale === 'en'
        const title = `${en ? 'Event reminder' : 'Recordatorio de evento'}: ${row.title}`
        const link = `/events/${row.slug}`
        try {
          if (channel === 'inapp') {
            // Inbox insertion and delivery marker commit together: a retry cannot duplicate the reminder.
            await db.batch([
              { sql: `INSERT INTO notifications (tenant_id, user_id, actor_id, type, title, link, is_read, created_at)
                  SELECT ?, ?, NULL, 'event', ?, ?, 0, ? WHERE EXISTS (SELECT 1 FROM event_reminders WHERE tenant_id = ? AND event_id = ? AND user_id = ? AND reminder_key = ? AND status = 'processing' AND lease_until = ?)`, params: [row.tenant_id, row.user_id, title, link, nowIso(), row.tenant_id, row.event_id, row.user_id, key, lease] },
              { sql: "UPDATE event_reminders SET status = 'sent', lease_until = 0, updated_at = ? WHERE tenant_id = ? AND event_id = ? AND user_id = ? AND reminder_key = ? AND lease_until = ?", params: [nowIso(), row.tenant_id, row.event_id, row.user_id, key, lease] },
            ])
          }
          else {
            if (!row.domain || !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(row.domain)) throw new Error('Community email domain required')
            const date = new Intl.DateTimeFormat(en ? 'en-US' : 'es', { timeZone: row.timezone || 'UTC', dateStyle: 'full', timeStyle: 'short' }).format(new Date(row.starts_at))
            const result = await sendEmail(event, { tenantId: row.tenant_id, userId: row.user_id, to: row.email, kind: 'notice', subject: title, text: `${title}\n${date} (${row.timezone || 'UTC'})\nhttps://${row.domain}${link}`, idempotencyKey: `event-${row.tenant_id}-${row.event_id}-${row.user_id}-${key}` })
            if (result !== 'sent') throw new Error('Email was not delivered')
            await db.prepare("UPDATE event_reminders SET status = 'sent', lease_until = 0, updated_at = ? WHERE tenant_id = ? AND event_id = ? AND user_id = ? AND reminder_key = ? AND lease_until = ?").run(nowIso(), row.tenant_id, row.event_id, row.user_id, key, lease)
          }
          processed++
        }
        catch {
          await db.prepare("UPDATE event_reminders SET status = 'failed', lease_until = ?, updated_at = ? WHERE tenant_id = ? AND event_id = ? AND user_id = ? AND reminder_key = ? AND lease_until = ?").run(Date.now() + 300000, nowIso(), row.tenant_id, row.event_id, row.user_id, key, lease)
        }
      }
    }
  }
  return { processed, emailConfigured: emailEnabled() }
})
