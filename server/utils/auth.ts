// Autenticación propia: contraseña con scrypt (crypto de Node) y sesión
// en cookie httpOnly firmada con HMAC-SHA256. Sin dependencias externas.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1]!, 'hex')
  const expected = Buffer.from(parts[2]!, 'hex')
  const actual = scryptSync(password, salt, expected.length)
  return timingSafeEqual(actual, expected)
}

function secret(): string {
  return (useRuntimeConfig().sessionSecret as string) || 'dev-only'
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export interface SessionPayload { uid: number, exp: number, v?: number }

export function setSession(event: H3Event, userId: number, version = 0) {
  const payload: SessionPayload = { uid: userId, exp: Date.now() + 1000 * 60 * 60 * 24 * 7, v: version }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  setCookie(event, 'cm_session', `${body}.${sign(body)}`, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7,
  })
}

export function destroySession(event: H3Event) {
  deleteCookie(event, 'cm_session', { path: '/' })
}

export function readSession(event: H3Event): SessionPayload | null {
  const cookie = getCookie(event, 'cm_session')
  if (!cookie) return null
  const [body, sig] = cookie.split('.')
  if (!body || !sig) return null
  const expected = sign(body)
  if (sig.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (payload.exp < Date.now()) return null
    return payload
  }
  catch { return null }
}
