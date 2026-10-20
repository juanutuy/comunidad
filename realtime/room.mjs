// Durable Object de tiempo real (Fase 3) — UNA instancia por sala.
//
// Salas (el nombre de la instancia ES la clave de la sala):
//   chan:{tenantId}:{channelId}        chat de un canal
//   dm:{tenantId}:{uidMenor}:{uidMayor} conversación directa entre dos
//   user:{tenantId}:{userId}           canal personal (notificaciones)
//   room:{tenantId}:{roomId}           sala grupal de chat (Fase 5)
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

import { sessionSecret } from '../shared/session.ts'
import { authorizeSocket } from './authorization.mjs'

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

  async broadcast(payload, exclude = null) {
    const msg = JSON.stringify(payload)
    for (const ws of this.ctx.getWebSockets()) {
      if (exclude && ws === exclude) continue
      if (!await this.validate(ws)) continue
      try { ws.send(msg) }
      catch { /* socket cerrado a mitad de camino: se ignora */ }
    }
  }

  async broadcastPresence(exclude = null) {
    await this.broadcast({ type: 'presence', users: this.users(exclude) }, exclude)
  }

  async fetch(request) {
    if (request.headers.get('x-rt-key') !== sessionSecret(this.env.NUXT_SESSION_SECRET)) {
      return new Response('Forbidden', { status: 403 })
    }
    const url = new URL(request.url)

    if (url.pathname === '/connect') {
      let identity
      try { identity = JSON.parse(decodeURIComponent(request.headers.get('x-rt-identity') || '')) }
      catch { return new Response('Bad identity', { status: 400 }) }
      if (!await authorizeSocket(this.env, identity)) return new Response('Forbidden', { status: 403 })
      const pair = new WebSocketPair()
      const client = pair[0]
      const server = pair[1]
      server.serializeAttachment(identity)
      this.ctx.acceptWebSocket(server)
      // Presencia inicial para el que entra y aviso al resto de la sala.
      await this.broadcastPresence()
      return new Response(null, { status: 101, webSocket: client })
    }

    if (url.pathname === '/publish' && request.method === 'POST') {
      const payload = await request.json().catch(() => null)
      if (payload && typeof payload === 'object') await this.broadcast(payload)
      return new Response('ok')
    }

    if (url.pathname === '/presence') {
      return Response.json({ users: this.users() })
    }

    return new Response('Not found', { status: 404 })
  }

  async validate(ws) {
    try {
      if (await authorizeSocket(this.env, ws.deserializeAttachment())) return true
    }
    catch (error) { console.error('Realtime authorization failed', error) }
    try { ws.close(1008, 'Access expired or revoked') } catch { /* already closed */ }
    return false
  }

  async webSocketMessage(ws, message) {
    if (!await this.validate(ws) || String(message).length > 1024) return
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
        await this.broadcast({ type: 'typing', user: { id: a.userId, name: a.name, slug: a.slug } }, ws)
      }
    }
    // Cualquier otro mensaje del cliente se ignora: enviar mensajes de
    // chat/DM es responsabilidad de la API REST (queda persistido).
  }

  async webSocketClose(ws) {
    // El socket que se cierra puede seguir apareciendo en
    // getWebSockets() durante el evento: se lo excluye de la foto.
    await this.broadcastPresence(ws)
  }

  async webSocketError(ws) {
    await this.broadcastPresence(ws)
  }
}
