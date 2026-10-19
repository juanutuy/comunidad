// Consulta pública de una invitación (Fase 14): la página /invite/[token]
// la usa para saber si el enlace sirve, de qué tipo es y para qué
// correo (si es personal) antes de mostrar el formulario de registro.
// No expone nada más del tenant que su nombre.
import { resolveTenant } from '../../utils/community'
import { getJoinSettings, invitationByToken, invitationState } from '../../utils/members'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const token = getRouterParam(event, 'token') || ''
  const inv = await invitationByToken(event, tenant.id, token)
  if (!inv) return { valid: false, reason: 'not_found', tenantName: tenant.name }
  const state = invitationState(inv)
  if (state !== 'pending') return { valid: false, reason: state, tenantName: tenant.name }
  const join = await getJoinSettings(event, tenant.id)
  return {
    valid: true,
    kind: inv.kind,
    email: inv.kind === 'email' ? inv.email : '',
    tenantName: tenant.name,
    // Con invitación no hay preguntas de ingreso (la invitación ya es
    // la aprobación), pero la página las pide igual si el tenant las
    // tiene y el enlace dejó de ser válido: no aplica acá.
    approvalRequired: join.approval,
  }
})
