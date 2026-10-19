// Verificación pública de certificados (Fase 16): SIN sesión, por
// código. Devuelve solo lo que el certificado impreso ya muestra
// (nombre del miembro, curso, comunidad y fecha). La búsqueda por
// correo de la referencia queda fuera a propósito: ellos mismos la
// traen apagada por defecto por privacidad.
import { verifyCertificate } from '../../utils/certificates'

export default defineEventHandler(async (event) => {
  const code = String(getRouterParam(event, 'code') || '')
  const found = await verifyCertificate(event, code)
  if (!found) throw createError({ statusCode: 404, message: 'No encontramos un certificado con ese código.' })
  return { valid: true, ...found }
})
