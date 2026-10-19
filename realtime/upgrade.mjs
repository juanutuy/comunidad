// Validación de upgrades WebSocket (Fase 3).
//
// worker-entry.mjs intercepta los GET con `Upgrade: websocket` hacia
// /api/rt/* ANTES de que lleguen a Nitro y los deriva acá. Este módulo
// corre en la capa del Worker (fuera de Nitro), así que trabaja con la
// Request cruda, `node:crypto` (nodejs_compat) y el binding D1 directo.
//
// Seguridad: NO se acepta ninguna conexión sin sesión válida y sin
// acceso a la sala pedida. Las reglas de acceso a canales replican
// `canAccessChannel` de server/utils/community.ts:
//   free → cualquier usuario con sesión · private → miembros del tenant
//   paid → admin o fila en channel_access.
// La verificación de la cookie replica `readSession` de
// server/utils/auth.ts (mismo formato `base64url(payload).hmac`).
import { createHmac, timingSafeEqual } from 'node:crypto'

function rtSecret(env) {
  return env.NUXT_SESSION_SECRET || 'dev-only-cambiar-en-produccion'
}

function parseSession(request, env) {
  const cookie = request.headers.get('cookie') || ''
  const match = cookie.match(/(?:^|;\s*)cm_session=([^;]+)/)
  if (!match) return null
  let value = match[1]
  try { value = decodeURIComponent(value) }
  catch { /* valor sin codificar: se usa tal cual */ }
  const [body, sig] = value.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', rtSecret(env)).update(body).digest('base64url')
  if (sig.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!payload.uid || payload.exp < Date.now()) return null
    return payload
  }
  catch { return null }
}

async function q1(env, sql, ...params) {
  return await env.DB.prepare(sql).bind(...params).first()
}

export async function handleRtUpgrade(request, env, ctx) {
  if (!env.REALTIME) return new Response('Tiempo real no disponible', { status: 501 })

  const session = parseSession(request, env)
  if (!session) return new Response('Iniciá sesión para conectarte.', { status: 401 })

  // Tenant por subdominio del host; por defecto, el primero (demo).
  // Misma regla que resolveTenant en server/utils/community.ts.
  const host = (request.headers.get('host') || '').split(':')[0]
  const sub = host.split('.')[0]
  let tenant = null
  if (sub && !['localhost', 'www', '127'].includes(sub)) {
    tenant = await q1(env, 'SELECT * FROM tenants WHERE slug = ?', sub)
  }
  if (!tenant) tenant = await q1(env, 'SELECT * FROM tenants ORDER BY id LIMIT 1')
  if (!tenant) return new Response('Comunidad no encontrada.', { status: 404 })

  const user = await q1(env, 'SELECT * FROM users WHERE id = ?', session.uid)
  if (!user) return new Response('Sesión inválida.', { status: 401 })
  // Fase 5: si la contraseña cambió, la versión de la sesión ya no
  // coincide con la del usuario y la conexión se rechaza (misma regla
  // que currentAuth en server/utils/community.ts).
  if ((session.v ?? 0) !== (user.token_version ?? 0)) return new Response('Sesión inválida.', { status: 401 })
  const membership = await q1(env, 'SELECT role FROM memberships WHERE tenant_id = ? AND user_id = ?', tenant.id, user.id)
  const role = membership?.role ?? null
  if (!role) return new Response('No sos miembro de esta comunidad.', { status: 403 })

  // Presencia aproximada: última conexión registrada (sin bloquear).
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(
      env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?')
        .bind(new Date().toISOString(), user.id).run().catch(() => {}),
    )
  }

  const parts = new URL(request.url).pathname.split('/').filter(Boolean)
  const kind = parts[2]
  const param = parts[3] ? decodeURIComponent(parts[3]) : ''
  let room = null

  if (kind === 'me') {
    room = `user:${tenant.id}:${user.id}`
  }
  else if (kind === 'channel' && param) {
    const channel = await q1(env, 'SELECT * FROM channels WHERE tenant_id = ? AND slug = ?', tenant.id, param)
    if (!channel) return new Response('Canal no encontrado.', { status: 404 })
    let access = channel.type === 'free'
    if (!access && role === 'admin') access = true
    else if (!access && channel.type === 'private') access = true // ya validamos membresía arriba
    else if (!access && channel.type === 'paid') {
      const row = await q1(env, 'SELECT id FROM channel_access WHERE tenant_id = ? AND user_id = ? AND channel_id = ?', tenant.id, user.id, channel.id)
      access = !!row
    }
    if (!access) return new Response('No tenés acceso a este canal.', { status: 403 })
    room = `chan:${tenant.id}:${channel.id}`
  }
  else if (kind === 'dm' && param) {
    const other = await q1(env, 'SELECT * FROM users WHERE slug = ?', param)
    if (!other) return new Response('Miembro no encontrado.', { status: 404 })
    if (other.id === user.id) return new Response('No podés abrir una conversación con vos mismo.', { status: 400 })
    const otherMembership = await q1(env, 'SELECT id FROM memberships WHERE tenant_id = ? AND user_id = ?', tenant.id, other.id)
    if (!otherMembership) return new Response('Ese usuario no es miembro de esta comunidad.', { status: 403 })
    const lo = Math.min(user.id, other.id)
    const hi = Math.max(user.id, other.id)
    room = `dm:${tenant.id}:${lo}:${hi}`
  }
  else if (kind === 'room' && param) {
    // Fase 5: salas grupales de chat — solo sus miembros.
    const roomId = Number(param)
    if (!roomId) return new Response('Sala no válida.', { status: 400 })
    const chatRoom = await q1(env, 'SELECT id FROM chat_rooms WHERE id = ? AND tenant_id = ?', roomId, tenant.id)
    if (!chatRoom) return new Response('Sala no encontrada.', { status: 404 })
    const member = await q1(env, 'SELECT id FROM chat_room_members WHERE room_id = ? AND user_id = ?', roomId, user.id)
    if (!member) return new Response('No sos miembro de esta sala.', { status: 403 })
    room = `room:${tenant.id}:${roomId}`
  }

  if (!room) return new Response('Sala no válida.', { status: 400 })

  // Se reenvía al DO una request QUE CONSERVA el header
  // `Upgrade: websocket` (copiado de la original): sin él, el runtime
  // rechaza la respuesta 101 con WebSocket. La identidad validada viaja
  // en headers internos (el nombre va URL-encoded: los headers HTTP no
  // admiten caracteres no-ASCII como la «í» de «Solís»).
  const headers = new Headers(request.headers)
  headers.set('x-rt-key', rtSecret(env))
  headers.set('x-rt-user-id', String(user.id))
  headers.set('x-rt-user-name', encodeURIComponent(user.name))
  headers.set('x-rt-user-slug', user.slug)
  headers.set('x-rt-room', room)
  const stub = env.REALTIME.get(env.REALTIME.idFromName(room))
  return stub.fetch(new Request('https://rt/connect', { headers }))
}
