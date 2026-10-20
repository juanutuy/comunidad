import { tenantForHost } from '../shared/access.ts'
import { parseSessionCookie, sessionSecret } from '../shared/session.ts'
import { authorizeSocket, queryOne } from './authorization.mjs'

export async function handleRtUpgrade(request, env, ctx) {
  if (!env.REALTIME) return new Response('Tiempo real no disponible', { status: 501 })
  const secret = sessionSecret(env.NUXT_SESSION_SECRET)
  const raw = (request.headers.get('cookie') || '').match(/(?:^|;\s*)cm_session=([^;]+)/)?.[1]
  let value = raw
  try { value = raw && decodeURIComponent(raw) } catch { return new Response('Sesión inválida.', { status: 401 }) }
  const session = parseSessionCookie(value, secret)
  if (!session) return new Response('Iniciá sesión para conectarte.', { status: 401 })
  const url = new URL(request.url)
  // Reject cross-site WebSocket handshakes even when a browser sends a session cookie.
  const origin = request.headers.get('origin')
  if (origin && origin !== url.origin) return new Response('Origen inválido.', { status: 403 })
  const get = queryOne(env)
  const tenant = await tenantForHost(get, url.host)
  if (!tenant) return new Response('Comunidad no encontrada.', { status: 404 })
  const user = await get('SELECT * FROM users WHERE id = ?', session.uid)
  if (!user) return new Response('Sesión inválida.', { status: 401 })
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length > 4) return new Response('Sala no válida.', { status: 400 })
  const kind = parts[2]
  let param
  try { param = parts[3] ? decodeURIComponent(parts[3]) : '' } catch { return new Response('Sala no válida.', { status: 400 }) }
  let room
  if (kind === 'me' && !param) room = `user:${tenant.id}:${user.id}`
  if (kind === 'channel' && param) {
    const channel = await get('SELECT * FROM channels WHERE tenant_id = ? AND slug = ?', tenant.id, param)
    if (channel) room = `chan:${tenant.id}:${channel.id}`
  }
  if (kind === 'dm' && param) {
    const other = await get('SELECT id FROM users WHERE slug = ?', param)
    if (other && other.id !== user.id) room = `dm:${tenant.id}:${Math.min(user.id, other.id)}:${Math.max(user.id, other.id)}`
  }
  if (kind === 'room' && /^\d+$/.test(param)) room = `room:${tenant.id}:${Number(param)}`
  if (!room) return new Response('Sala no encontrada.', { status: 404 })
  const identity = { userId: user.id, tenantId: tenant.id, sessionVersion: session.v, expiresAt: session.exp, name: user.name, slug: user.slug, room }
  if (!await authorizeSocket(env, identity)) return new Response('No tenés acceso a esta sala.', { status: 403 })
  if (ctx?.waitUntil) ctx.waitUntil(env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(new Date().toISOString(), user.id).run())
  const headers = new Headers({ upgrade: 'websocket', 'x-rt-key': secret, 'x-rt-identity': encodeURIComponent(JSON.stringify(identity)) })
  return env.REALTIME.get(env.REALTIME.idFromName(room)).fetch(new Request('https://rt/connect', { headers }))
}
