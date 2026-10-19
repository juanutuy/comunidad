// Durable Object de tiempo real (Fase 3) — UNA instancia por sala.
//
// Salas (el nombre de la instancia ES la clave de la sala):
//   chan:{tenantId}:{channelId}        chat de un canal
//   dm:{tenantId}:{uidMenor}:{uidMayor} conversación directa entre dos
//   user:{tenantId}:{userId}           canal personal (notificaciones)
//
// El DO no guarda historial: los mensajes viven en D1 (chat_messages /
// dm_messages) y se leen/escriben por la API REST de Nitro. El DO solo
// transporta eventos en vivo a los sockets conectados y mantiene la
// presencia de la sala en los attachments de cada WebSocket (con la API
// de hibernación: los attachments sobreviven a que el DO se duerma).
//
// Solo se llega al DO desde dentro del mismo Worker:
//   - los upgrades WebSocket los valida y reenvía worker-entry.mjs
//     (realtime/upgrade.mjs) tras comprobar sesión y acceso, y
//   - los POST /publish los hacen las rutas REST vía server/utils/realtime.ts.
// Ambos caminos mandan el secreto compartido en `x-rt-key`; sin él, 403.

function rtSecret(env) {
  return env.NUXT_SESSION_SECRET || 'dev-only-cambiar-en-produccion'
}

export class RealtimeRoom {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
  }

  // Usuarios únicos conectados a esta sala, según los attachments.
  users(exclude = null) {
    const byId = new Map()
    for (const ws of this.ctx.getWebSockets()) {
      if (exclude && ws === exclude) continue
      try {
        const a = ws.deserializeAttachment()
        if (a && a.userId) byId.set(a.userId, { id: a.userId, name: a.name, slug: a.slug })
      }
      catch { /* socket sin attachment válido: se ignora */ }
    }
    return [...byId.values()]
  }

  broadcast(payload, exclude = null) {
    const msg = JSON.stringify(payload)
    for (const ws of this.ctx.getWebSockets()) {
      if (exclude && ws === exclude) continue
      try { ws.send(msg) }
      catch { /* socket cerrado a mitad de camino: se ignora */ }
    }
  }

  broadcastPresence(exclude = null) {
    this.broadcast({ type: 'presence', users: this.users(exclude) }, exclude)
  }

  async fetch(request) {
    if (request.headers.get('x-rt-key') !== rtSecret(this.env)) {
      return new Response('Forbidden', { status: 403 })
    }
    const url = new URL(request.url)

    if (url.pathname === '/connect') {
      let name = request.headers.get('x-rt-user-name') || ''
      try { name = decodeURIComponent(name) }
      catch { /* venía sin codificar: se usa tal cual */ }
      const identity = {
        userId: Number(request.headers.get('x-rt-user-id')),
        name,
        slug: request.headers.get('x-rt-user-slug') || '',
        room: request.headers.get('x-rt-room') || '',
      }
      if (!identity.userId) return new Response('Bad identity', { status: 400 })
      const pair = new WebSocketPair()
      const client = pair[0]
      const server = pair[1]
      server.serializeAttachment(identity)
      this.ctx.acceptWebSocket(server)
      // Presencia inicial para el que entra y aviso al resto de la sala.
      this.broadcastPresence()
      return new Response(null, { status: 101, webSocket: client })
    }

    if (url.pathname === '/publish' && request.method === 'POST') {
      const payload = await request.json().catch(() => null)
      if (payload && typeof payload === 'object') this.broadcast(payload)
      return new Response('ok')
    }

    if (url.pathname === '/presence') {
      return Response.json({ users: this.users() })
    }

    return new Response('Not found', { status: 404 })
  }

  webSocketMessage(ws, message) {
    let data
    try { data = JSON.parse(String(message)) }
    catch { return }
    if (data?.type === 'ping') {
      try { ws.send(JSON.stringify({ type: 'pong' })) }
      catch { /* nada */ }
      return
    }
    if (data?.type === 'typing') {
      let a = {}
      try { a = ws.deserializeAttachment() || {} }
      catch { /* sin identidad: no se reenvía */ }
      if (a.userId) {
        this.broadcast({ type: 'typing', user: { id: a.userId, name: a.name, slug: a.slug } }, ws)
      }
    }
    // Cualquier otro mensaje del cliente se ignora: enviar mensajes de
    // chat/DM es responsabilidad de la API REST (queda persistido).
  }

  webSocketClose(ws) {
    // El socket que se cierra puede seguir apareciendo en
    // getWebSockets() durante el evento: se lo excluye de la foto.
    this.broadcastPresence(ws)
  }

  webSocketError(ws) {
    this.broadcastPresence(ws)
  }
}
