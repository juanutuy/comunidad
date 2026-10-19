import type { AdminSubMenuItem } from '~/components/AdminSubMenu.vue'

// Listas de subsecciones de la consola para AdminSubMenu (Fase
// 16-D), filtradas por rol: a nadie se le ofrece una subsección que
// el servidor le negaría. Las secciones de una sola página (Ajustes,
// Gamificación) definen sus ítems con { value } en la propia página
// porque son admin puro y no necesitan este filtro.

// Miembros (Fase 14): lista, solicitudes, invitaciones y roles son
// rutas propias. El moderador solo ve «Miembros»: el resto es
// gestión de administradores. «Solicitudes de ingreso» se ofrece
// siempre al admin: la propia página avisa si la aprobación previa
// está apagada y muestra el historial.
export function useMembersMenuItems() {
  const { user } = useAuth()
  return computed<AdminSubMenuItem[]>(() => {
    const items: AdminSubMenuItem[] = [
      { label: 'Miembros', icon: 'i-lucide-users', to: '/admin/members', exact: true },
    ]
    if (user.value?.role === 'admin') {
      items.push(
        { label: 'Solicitudes de ingreso', icon: 'i-lucide-user-plus', to: '/admin/members/requests', exact: true },
        { label: 'Invitaciones', icon: 'i-lucide-mail-plus', to: '/admin/members/invitations', exact: true },
        { label: 'Roles', icon: 'i-lucide-shield-check', to: '/admin/members/roles', exact: true },
      )
    }
    return items
  })
}

// Contenido (Fase 16): Publicaciones, Archivos y Canales son rutas
// propias. Archivos es solo admin (su API también): para el
// moderador no se pinta.
export function useContentMenuItems() {
  const { user } = useAuth()
  return computed<AdminSubMenuItem[]>(() => [
    { label: 'Publicaciones', icon: 'i-lucide-newspaper', to: '/admin/content', exact: true },
    ...(user.value?.role === 'admin'
      ? [{ label: 'Archivos', icon: 'i-lucide-files', to: '/admin/content/media', exact: true } as AdminSubMenuItem]
      : []),
    { label: 'Canales', icon: 'i-lucide-hash', to: '/admin/content/channels', exact: true },
  ])
}

// Cursos: el catálogo y los diseños de certificado (blueprints) son
// rutas propias, y ambos roles de la sección (admin y encargado de
// cursos) ven las dos subsecciones — cada página y su API aplican
// el mismo guarda.
export function useCoursesMenuItems() {
  return computed<AdminSubMenuItem[]>(() => [
    { label: 'Cursos', icon: 'i-lucide-graduation-cap', to: '/admin/courses', exact: true },
    { label: 'Certificados', icon: 'i-lucide-award', to: '/admin/courses/blueprints', exact: true },
  ])
}
