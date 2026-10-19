// Cliente de tiempo real (Fase 3).
//
// Se conecta por WebSocket a /api/rt/* (el Worker valida la sesión y el
// acceso a la sala antes de aceptar; ver realtime/upgrade.mjs). Si el
// entorno no tiene Durable Objects —`npm run dev` en Node—,
// /api/rt/status devuelve { realtime: false } y ni se intenta: los
// componentes trabajan por polling corto contra la API REST.
export interface RtMessage { type: string, [key: string]: unknown }

export function useRealtime() {
  const available = useState<boolean | null>('rt-available', () => null)

  async function checkAvailable(): Promise<boolean> {
    if (available.value !== null) return available.value
    try {
      const s = await $fetch<{ realtime: boolean }>('/api/rt/status')
      available.value = !!s.realtime
    }
    catch { available.value = false }
    return available.value
  }

  function connect(path: string, onMessage: (data: RtMessage) => void) {
    const connected = ref(false)
    let ws: WebSocket | null = null
    let closed = false
    let tries = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let typingLast = 0

    function open() {
      if (closed || !import.meta.client) return
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${proto}//${location.host}${path}`)
      ws.onopen = () => { connected.value = true; tries = 0 }
      ws.onmessage = (ev) => {
        try { onMessage(JSON.parse(String(ev.data)) as RtMessage) }
        catch { /* mensaje no JSON: se ignora */ }
      }
      ws.onclose = () => {
        connected.value = false
        if (!closed && tries < 3) {
          tries++
          retryTimer = setTimeout(open, 1500 * tries)
        }
      }
      ws.onerror = () => { try { ws?.close() } catch { /* nada */ } }
    }
    if (import.meta.client) open()

    return {
      connected,
      sendTyping() {
        const now = Date.now()
        if (ws?.readyState === WebSocket.OPEN && now - typingLast > 2500) {
          typingLast = now
          ws.send(JSON.stringify({ type: 'typing' }))
        }
      },
      close() {
        closed = true
        if (retryTimer) clearTimeout(retryTimer)
        try { ws?.close() } catch { /* nada */ }
      },
    }
  }

  return { checkAvailable, connect }
}
