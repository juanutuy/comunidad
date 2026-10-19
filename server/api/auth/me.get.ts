import { currentAuth, publicUser, resolveTenant } from '../../utils/community'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const { user, role, status } = await currentAuth(event, tenant.id)
  if (!user) throw createError({ statusCode: 401, message: 'Sin sesión.' })
  return { user: { ...publicUser(user), role }, status: status || 'active' }
})
