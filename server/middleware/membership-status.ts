// Fase 14 — muro de estado de membresía. Los endpoints de lectura usan
// currentAuth directamente (muchos sirven también a visitantes), así
// que el corte para cuentas sin acceso vive acá, en un solo lugar:
// si la sesión corresponde a una membresía 'pending' (solicitud en
// revisión), 'declined' (rechazada) o 'suspended' (suspendida) en el
// tenant resuelto, TODA la API de la comunidad responde 403 con el
// motivo. Quedan fuera las rutas que la propia pantalla de estado y
// el flujo de ingreso necesitan: /api/tenant (para saber el estado),
// /api/auth/* (entrar, salir, enlace de acceso) y /api/invite/*
// (consultar una invitación). Sin sesión o sin membresía no se corta
// nada: cada endpoint decide como siempre.
import { currentAuth, resolveTenant } from '../utils/community'

const OPEN_PREFIXES = ['/api/auth/', '/api/invite/']
const OPEN_PATHS = new Set(['/api/tenant', '/api/stripe/webhook', '/api/cron/digest'])
const MESSAGES: Record<string, string> = {
  pending: 'Tu solicitud de ingreso está en revisión. Te avisaremos cuando un administrador la resuelva.',
  declined: 'Tu solicitud de ingreso no fue aprobada. Podés volver a solicitar el ingreso desde el registro cuando pase el tiempo de espera.',
  suspended: 'Tu cuenta está suspendida en esta comunidad. Si creés que es un error, escribile a un administrador.',
}

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return
  if (OPEN_PATHS.has(path) || OPEN_PREFIXES.some(p => path.startsWith(p))) return
  const tenant = await resolveTenant(event)
  const { user, status } = await currentAuth(event, tenant.id)
  if (!user) return
  if (!status) throw createError({ statusCode: 403, message: 'No sos miembro de esta comunidad.' })
  const message = MESSAGES[status]
  if (message) throw createError({ statusCode: 403, message })
})
