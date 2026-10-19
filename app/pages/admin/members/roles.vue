<script setup lang="ts">
// Roles de la comunidad (Fase 14): explicación en lenguaje claro de
// los cuatro roles y qué puede hacer cada uno, para asignar con
// criterio desde la lista de miembros. DIFERENCIA documentada con la
// referencia: allá los permisos son una matriz configurable de 25
// grupos con roles personalizados; acá los roles son fijos, con
// capacidades definidas por el sistema (las de esta página) — es una
// decisión de alcance, no una matriz a medio hacer.
definePageMeta({ layout: 'admin' })
const { user, tenant } = useAuth()
const membersMenuItems = useMembersMenuItems()

const roles = [
  {
    value: 'admin', label: 'Administrador', icon: 'i-lucide-shield-check', color: 'primary' as const,
    summary: 'Control total de la comunidad.',
    can: [
      'Todo lo de los demás roles, sin excepción.',
      'Panel con estadísticas, canales, eventos, planes, dominios, correos y ajustes de la comunidad.',
      'Gamificación, compuertas por nivel y revisión previa de publicaciones.',
      'Gestionar miembros: roles, estados (suspender/restringir), etiquetas, invitaciones, solicitudes y altas manuales.',
    ],
  },
  {
    value: 'moderator', label: 'Moderador', icon: 'i-lucide-shield-alert', color: 'warning' as const,
    summary: 'Cuida la conversación, sin tocar la gestión.',
    can: [
      'Consola con dos secciones: Moderación (reportes y publicaciones en revisión) y Miembros en solo lectura.',
      'Resolver reportes: descartar, resolver o eliminar el contenido reportado.',
      'Aprobar o rechazar publicaciones cuando la revisión previa está encendida.',
      'Eliminar publicaciones y comentarios ajenos desde el menú de cada contenido en la comunidad.',
    ],
    cannot: [
      'No cambia roles ni estados de miembros, no ve ajustes de la comunidad, planes, dominios ni correos.',
    ],
  },
  {
    value: 'course_manager', label: 'Encargado de cursos', icon: 'i-lucide-graduation-cap', color: 'success' as const,
    summary: 'Gestiona el catálogo educativo, nada más.',
    can: [
      'Consola con una sola sección: Cursos (crear y editar cursos, capítulos, lecciones e inscripciones).',
      'En la comunidad participa como un miembro más.',
    ],
    cannot: [
      'No modera contenido, no gestiona miembros ni ve el resto de la consola.',
    ],
  },
  {
    value: 'member', label: 'Miembro', icon: 'i-lucide-user', color: 'neutral' as const,
    summary: 'La cuenta normal de la comunidad.',
    can: [
      'Participa según los canales a los que tenga acceso y las compuertas por nivel que defina la administración.',
      'Sin acceso a la consola de administración.',
    ],
  },
]
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Miembros</h1>
      <p class="text-muted">Los roles de {{ tenant?.name }} y qué puede hacer cada uno.</p>
    </div>
    <UAlert v-if="user && user.role !== 'admin'" color="warning" variant="soft" title="Solo administradores" description="Esta explicación es para quien asigna los roles: un administrador." />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <template v-else>
      <div class="flex flex-col gap-5 lg:flex-row lg:items-start">
      <AdminSubMenu :items="membersMenuItems" />
      <div class="min-w-0 flex-1 space-y-5">
      <p class="max-w-3xl text-sm text-muted">
        El rol se asigna desde la <NuxtLink to="/admin/members" class="text-primary hover:underline">lista de miembros</NuxtLink>,
        en el selector de cada persona. Nadie puede degradar al único administrador de la comunidad: siempre tiene que quedar alguien con control total.
      </p>
      <div class="grid gap-4 lg:grid-cols-2">
        <UCard v-for="r in roles" :key="r.value">
          <template #header>
            <h2 class="flex items-center gap-2 font-bold">
              <UIcon :name="r.icon" /> {{ r.label }}
              <UBadge :color="r.color" variant="subtle" size="sm">{{ r.value }}</UBadge>
            </h2>
          </template>
          <p class="text-sm font-medium">{{ r.summary }}</p>
          <ul class="mt-3 space-y-1.5">
            <li v-for="c in r.can" :key="c" class="flex gap-2 text-sm">
              <UIcon name="i-lucide-check" class="mt-0.5 shrink-0 text-success" /> <span>{{ c }}</span>
            </li>
            <li v-for="c in r.cannot || []" :key="c" class="flex gap-2 text-sm text-muted">
              <UIcon name="i-lucide-x" class="mt-0.5 shrink-0 text-error" /> <span>{{ c }}</span>
            </li>
          </ul>
        </UCard>
      </div>
      <UAlert
        color="neutral" variant="soft" icon="i-lucide-info"
        title="Roles fijos, sin matriz de permisos"
        description="En esta plataforma los roles son estos cuatro y sus capacidades están definidas por el sistema (las de esta página). No hay una matriz de permisos editable ni roles personalizados: es una diferencia deliberada de alcance frente a otras plataformas, para que lo que cada rol puede hacer sea siempre previsible."
      />
      </div>
      </div>
    </template>
  </div>
</template>
