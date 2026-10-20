// Autenticación propia: contraseña con scrypt (crypto de Node) y sesión
// en cookie httpOnly firmada con HMAC-SHA256. Sin dependencias externas.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { parseSessionCookie, sessionSecret } from '../../shared/session'

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  if (typeof password !== 'string' || password.length > 1024 || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored)) return false
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1]!, 'hex')
  const expected = Buffer.from(parts[2]!, 'hex')
  const actual = scryptSync(password, salt, expected.length)
  return timingSafeEqual(actual, expected)
}

function secret(): string {
  return sessionSecret(useRuntimeConfig().sessionSecret, import.meta.dev)
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export interface SessionPayload { uid: number, exp: number, v?: number }

export function setSession(event: H3Event, userId: number, version = 0) {
  const payload: SessionPayload = { uid: userId, exp: Date.now() + 1000 * 60 * 60 * 24 * 7, v: version }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  setCookie(event, 'cm_session', `${body}.${sign(body)}`, {
    httpOnly: true, secure: !import.meta.dev && getRequestURL(event).protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7,
  })
}

export function destroySession(event: H3Event) {
  deleteCookie(event, 'cm_session', { path: '/' })
}

export function readSession(event: H3Event): SessionPayload | null {
  return parseSessionCookie(getCookie(event, 'cm_session'), secret())
}
