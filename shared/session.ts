import { createHmac, timingSafeEqual } from 'node:crypto'

export interface SessionPayload { uid: number, exp: number, v: number }
export function sessionSecret(value: unknown, development = false): string {
  if (typeof value === 'string' && value.length >= 32 && !value.startsWith('dev-only')) return value
  if (development) return 'dev-only-local-development-secret-32'
  throw new Error('NUXT_SESSION_SECRET must be a random secret of at least 32 characters')
}
export function parseSessionCookie(cookie: string | undefined, secret: string): SessionPayload | null {
  if (!cookie) return null
  const parts = cookie.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  if (!body || !sig) return null
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  if (Buffer.byteLength(sig) !== Buffer.byteLength(expected)) return null
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!Number.isSafeInteger(payload.uid) || payload.uid <= 0 || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null
    if (payload.v !== undefined && (!Number.isSafeInteger(payload.v) || payload.v < 0)) return null
    return { uid: payload.uid, exp: payload.exp, v: payload.v ?? 0 }
  }
  catch { return null }
}
