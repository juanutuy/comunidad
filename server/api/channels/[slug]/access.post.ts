// Legacy demo grants are permanently disabled in every environment.
export default defineEventHandler(() => {
  throw createError({ statusCode: 410, message: 'Este acceso ya no está disponible. Usa el proceso de compra o una invitación autorizada.' })
})
