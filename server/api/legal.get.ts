// Textos legales del tenant (Fase 5): los editados por el admin en
// los ajustes de la comunidad, o un texto por defecto claro si el
// tenant todavía no cargó los suyos.
import { resolveTenant } from '../utils/community'
import { dbFor } from '../utils/db'

const DEFAULT_TERMS = `Al usar esta comunidad aceptás participar con respeto hacia las demás personas, no publicar contenido ilegal ni spam, y cuidar los datos personales de terceros.\n\nEl equipo de la comunidad puede moderar o retirar contenido que incumpla las reglas publicadas, y suspender cuentas reincidentes. Los contenidos que publicás siguen siendo tuyos: al publicarlos autorizás a mostrarlos dentro de la comunidad.\n\nEste es un texto por defecto: el equipo administrador puede reemplazarlo desde Ajustes de la comunidad.`
const DEFAULT_PRIVACY = `En esta comunidad guardamos los datos de tu cuenta (nombre, correo y lo que publicás) para operar el servicio: mostrar tu perfil, tus publicaciones y tus avances en cursos y eventos.\n\nNo vendemos tus datos. Tu correo no se muestra públicamente. Podés pedir la corrección o eliminación de tu cuenta escribiendo al equipo administrador de la comunidad.\n\nEste es un texto por defecto: el equipo administrador puede reemplazarlo desde Ajustes de la comunidad.`

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const db = await dbFor(event)
  const row = await db.prepare('SELECT terms, privacy FROM tenants WHERE id = ?').get(tenant.id).catch(() => undefined) as { terms: string, privacy: string } | undefined
  return {
    name: tenant.name,
    terms: (row?.terms || '').trim() || DEFAULT_TERMS,
    privacy: (row?.privacy || '').trim() || DEFAULT_PRIVACY,
    custom: !!((row?.terms || '').trim() || (row?.privacy || '').trim()),
  }
})
