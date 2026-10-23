// Keep the current page while a visitor signs in to open a profile.
export default defineNuxtRouteMiddleware((to) => {
  if (!import.meta.client || !to.path.startsWith('/profile/')) return
  const app = useNuxtApp()
  if (app.isHydrating && app.payload.serverRendered) return
  const { user } = useAuth()
  if (user.value) return
  useGuestAccess().requestAccess(to.fullPath)
  return abortNavigation()
})
