// Información pública de ingreso (Fase 14) para la página de
// registro: si el tenant pide aprobación previa y qué preguntas hace
// (las respuestas viajan en el POST /api/auth/register).
import { resolveTenant } from '../utils/community'
import { getJoinSettings } from '../utils/members'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const join = await getJoinSettings(event, tenant.id)
  return { approval: join.approval, questions: join.approval ? join.questions : [] }
})
