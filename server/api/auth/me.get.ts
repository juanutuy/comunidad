import { currentAuth, publicUser, resolveTenant } from '../../utils/community'

export default defineEventHandler((event) => {
  const tenant = resolveTenant(event)
  const { user, role } = currentAuth(event, tenant.id)
  if (!user) throw createError({ statusCode: 401, message: 'Sin sesión.' })
  return { user: { ...publicUser(user), role } }
})
