<script setup lang="ts">
// Pantalla de estado de ingreso (Fase 14): cuando la membresía no
// está activa, la comunidad queda detrás de este aviso. Cubre la
// solicitud en revisión (aprobación previa), la rechazada (con la
// nota del tiempo de espera) y — si una sesión quedó abierta — la
// cuenta suspendida. Con la membresía activa redirige al feed.
definePageMeta({ layout: 'auth' })
const { user, status, tenant, logout, fetchMe } = useAuth()
const router = useRouter()

await fetchMe()
if (user.value && (!status.value || status.value === 'active' || status.value === 'restricted'))
  await navigateTo('/feeds')

const view = computed(() => {
  switch (status.value) {
    case 'declined':
      return {
        icon: 'i-lucide-user-x',
        color: 'error' as const,
        title: 'Tu solicitud no fue aprobada',
        text: `Un administrador revisó tu solicitud de ingreso a ${tenant.value?.name || 'la comunidad'} y esta vez no fue aprobada. Cuando pase el tiempo de espera que definió la comunidad, vas a poder volver a solicitar el ingreso registrándote de nuevo con el mismo correo.`,
      }
    case 'suspended':
      return {
        icon: 'i-lucide-ban',
        color: 'error' as const,
        title: 'Tu cuenta está suspendida',
        text: `Tu acceso a ${tenant.value?.name || 'la comunidad'} está suspendido por un administrador. Si creés que es un error, escribile a un administrador de la comunidad.`,
      }
    default:
      return {
        icon: 'i-lucide-hourglass',
        color: 'warning' as const,
        title: 'Tu solicitud está en revisión',
        text: `${tenant.value?.name || 'La comunidad'} revisa cada ingreso antes de dar acceso. Un administrador está viendo tu solicitud: cuando la apruebe, vas a poder entrar con tu correo y tu contraseña. No tenés que hacer nada más.`,
      }
  }
})

async function doLogout() {
  await logout()
  router.push('/login')
}
</script>

<template>
  <UCard>
    <div class="flex flex-col items-center py-4 text-center">
      <span class="flex h-14 w-14 items-center justify-center rounded-full bg-elevated">
        <UIcon :name="view.icon" class="text-3xl text-muted" />
      </span>
      <h1 class="mt-4 text-2xl font-bold">{{ view.title }}</h1>
      <p class="mt-2 max-w-md text-sm text-muted">{{ view.text }}</p>
      <UAlert v-if="status === 'pending'" class="mt-4 text-left" color="neutral" variant="soft" icon="i-lucide-info" title="¿Ya te aprobaron?" description="Volvé a iniciar sesión: si tu solicitud ya fue aprobada, entrás directo a la comunidad." />
      <UButton class="mt-6" color="neutral" variant="soft" icon="i-lucide-log-out" label="Cerrar sesión" @click="doLogout" />
    </div>
  </UCard>
</template>
