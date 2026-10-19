// Información pública de ingreso (Fase 14) para la página de
// registro: si el tenant pide aprobación previa y qué preguntas hace
// (las respuestas viajan en el POST /api/auth/register).
// Fase 15: suma si el registro público está cerrado (sin invitación
// no se puede crear la cuenta; la página lo avisa antes del formulario).
import { resolveTenant } from '../utils/community'
import { getJoinSettings } from '../utils/members'
import { getPrivacySettings } from '../utils/privacy'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const join = await getJoinSettings(event, tenant.id)
  const priv = await getPrivacySettings(event, tenant.id)
  return {
    approval: join.approval,
    questions: join.approval ? join.questions : [],
    registrationClosed: !priv.anyoneCanRegister,
  }
})
