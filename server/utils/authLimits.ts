import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { dbFor } from './db'

export async function limitAuthAttempts(event: H3Event, email: string): Promise<void> {
  const db = await dbFor(event)
  const now = Date.now()
  const ip = getRequestIP(event) || 'unknown'
  for (const [prefix, value, limit] of [['ip', ip, 60], ['account', email, 20]] as const) {
    const key = `${prefix}:${createHash('sha256').update(value).digest('hex')}`
    const row = await db.prepare(`INSERT INTO auth_attempts (key, attempts, resets_at) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN resets_at <= ? THEN 1 ELSE attempts + 1 END,
      resets_at = CASE WHEN resets_at <= ? THEN excluded.resets_at ELSE resets_at END RETURNING attempts, resets_at`)
      .get(key, now + 15 * 60 * 1000, now, now) as { attempts: number, resets_at: number }
    if (row.attempts > limit) {
      setHeader(event, 'retry-after', Math.ceil((row.resets_at - now) / 1000))
      throw createError({ statusCode: 429, message: 'Demasiados intentos. Intentá más tarde.' })
    }
  }
  await db.prepare('DELETE FROM auth_attempts WHERE resets_at < ?').run(now)
}
