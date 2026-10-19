// Publicación de eventos en tiempo real desde las rutas REST (Fase 3).
//
// Los mensajes se guardan SIEMPRE primero en la base (fuente de verdad);
// después se avisa al Durable Object de la sala para que lo empuje a los
// sockets conectados. Si no hay binding REALTIME (p. ej. `npm run dev`
// en Node), la publicación es un no-op silencioso: el cliente degrada a
// polling corto contra la misma API REST.
import type { H3Event } from 'h3'

interface DurableNamespaceLike {
  idFromName: (name: string) => unknown
  get: (id: unknown) => { fetch: (url: string, init?: Record<string, unknown>) => Promise<unknown> }
}

// En `npm run dev` NO se usa el binding aunque la emulación de
// Cloudflare lo exponga: la clase del DO no está exportada en ese
// servidor (vive en worker-entry.mjs, fuera de Nitro) y tocarlo genera
// errores de workerd. Ahí el tiempo real se degrada a polling.
// En el build (wrangler dev / producción) NODE_ENV es 'production'.
const isDevBuild = (import.meta as unknown as { dev?: boolean }).dev === true
  || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development')

export function realtimeNamespace(event?: unknown): DurableNamespaceLike | null {
  if (isDevBuild) return null
  const e = event as { context?: { cloudflare?: { env?: Record<string, unknown> }, _platform?: { cloudflare?: { env?: Record<string, unknown> } } } } | undefined
  const ns = (e?.context?.cloudflare?.env?.REALTIME
    ?? e?.context?._platform?.cloudflare?.env?.REALTIME
    ?? (globalThis as { __env__?: Record<string, unknown> }).__env__?.REALTIME) as DurableNamespaceLike | undefined
  return ns && typeof ns.idFromName === 'function' ? ns : null
}

// ¿El tiempo real está REALMENTE disponible? No alcanza con que el
// binding exista: en `npm run dev`, Nuxt emula los bindings de
// wrangler.jsonc (getPlatformProxy) pero la clase del DO no está
// exportada en ese servidor, así que hay que comprobarlo con un ping
// a una sala de salud. En el Worker real responde 200 al instante.
export async function realtimeAvailable(event: H3Event): Promise<boolean> {
  const ns = realtimeNamespace(event)
  if (!ns) return false
  try {
    const secret = (useRuntimeConfig().sessionSecret as string) || 'dev-only'
    const stub = ns.get(ns.idFromName('health:0'))
    const res = await stub.fetch('https://rt/presence', {
      headers: { 'x-rt-key': secret },
      signal: AbortSignal.timeout(1500),
    }) as { ok?: boolean, status?: number }
    return res?.ok === true || res?.status === 200
  }
  catch { return false }
}

export const roomChannel = (tenantId: number, channelId: number) => `chan:${tenantId}:${channelId}`
export const roomDm = (tenantId: number, a: number, b: number) => `dm:${tenantId}:${Math.min(a, b)}:${Math.max(a, b)}`
export const roomUser = (tenantId: number, userId: number) => `user:${tenantId}:${userId}`
export const roomGroup = (tenantId: number, roomId: number) => `room:${tenantId}:${roomId}`

export async function publishRealtime(event: H3Event, room: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const ns = realtimeNamespace(event)
    if (!ns) return
    const secret = (useRuntimeConfig().sessionSecret as string) || 'dev-only'
    const stub = ns.get(ns.idFromName(room))
    await stub.fetch('https://rt/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-rt-key': secret },
      body: JSON.stringify(payload),
    })
  }
  catch {
    // El tiempo real es mejora progresiva: si el DO no responde, el
    // dato ya quedó persistido y el cliente lo levanta por polling.
  }
}
