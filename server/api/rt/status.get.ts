// ¿Está disponible el tiempo real en este entorno? (Fase 3)
// En el Worker (y en `wrangler dev`) el Durable Object responde → true.
// En `npm run dev` (Node) el binding puede aparecer emulado pero la
// clase no está exportada, el ping falla → false: el cliente ni
// intenta el WebSocket y trabaja por polling corto contra la REST.
import { realtimeAvailable } from '../../utils/realtime'

export default defineEventHandler(async (event) => {
  return { realtime: await realtimeAvailable(event) }
})
