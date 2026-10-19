// Entry real del Worker (lo apunta `main` en wrangler.jsonc).
//
// Envuelve el handler que genera Nitro (.output/server/index.mjs) por
// dos motivos de la Fase 3 (tiempo real):
//   1. Nitro NO exporta clases de Durable Object: el entry estándar solo
//      trae el export default. Aquí se exporta `RealtimeRoom` como named
//      export del script, que es lo que el binding REALTIME necesita.
//   2. Los upgrades WebSocket hacia /api/rt/* se interceptan ANTES de
//      Nitro y se validan (sesión + acceso a la sala) en
//      realtime/upgrade.mjs; recién entonces se reenvían al Durable
//      Object de la sala. Todo lo demás pasa al handler de Nitro tal cual.
//
// En `npm run dev` (Node) este archivo no participa: la app degrada a
// polling contra la API REST (ver app/composables/useRealtime.ts).
import nitroHandler from './.output/server/index.mjs'
import { handleRtUpgrade } from './realtime/upgrade.mjs'

export { RealtimeRoom } from './realtime/room.mjs'

export default {
  ...nitroHandler,
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const isUpgrade = (request.headers.get('upgrade') || '').toLowerCase() === 'websocket'
    if (isUpgrade && url.pathname.startsWith('/api/rt/')) {
      return handleRtUpgrade(request, env, ctx)
    }
    return nitroHandler.fetch(request, env, ctx)
  },
}
