// Guard the entire console before page/layout setup on SSR and client navigation.
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path !== '/admin' && !to.path.startsWith('/admin/')) return
  const { user, status, fetchMe } = useAuth()
  await fetchMe()
  if (!user.value) return navigateTo('/login', { replace: true, redirectCode: 302 })
  if (status.value && !['active', 'restricted'].includes(status.value))
    return navigateTo('/pending', { replace: true, redirectCode: 302 })
  if (status.value !== 'active' || !['admin', 'moderator', 'course_manager'].includes(user.value.role || ''))
    return navigateTo('/feeds', { replace: true, redirectCode: 302 })
})
