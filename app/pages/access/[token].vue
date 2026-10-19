<script setup lang="ts">
// Entrar con un enlace de acceso de un solo uso (Fase 14): lo genera
// un administrador desde la ficha del miembro. Al abrir la página se
// consume el enlace (POST /api/auth/access): si sirve, abre la
// sesión y entra a la comunidad; si no, explica por qué.
definePageMeta({ layout: 'auth' })
const route = useRoute()
const router = useRouter()
const api = useApi()
const { fetchMe } = useAuth()
const toast = useToast()
const error = ref('')

onMounted(async () => {
  try {
    await api('/api/auth/access', { method: 'POST', body: { token: String(route.params.token || '') } })
    await fetchMe()
    toast.add({ title: '¡Hola de nuevo!', description: 'Entraste con tu enlace de acceso.', color: 'success' })
    router.replace('/feeds')
  }
  catch (e) {
    error.value = (e as { data?: { message?: string } }).data?.message || 'Este enlace de acceso no es válido.'
  }
})
</script>

<template>
  <UCard>
    <div v-if="!error" class="flex flex-col items-center py-6 text-center">
      <UIcon name="i-lucide-loader-circle" class="animate-spin text-3xl text-muted" />
      <p class="mt-3 text-sm text-muted">Verificando tu enlace de acceso…</p>
    </div>
    <div v-else class="flex flex-col items-center py-4 text-center">
      <span class="flex h-14 w-14 items-center justify-center rounded-full bg-elevated">
        <UIcon name="i-lucide-key-round" class="text-3xl text-muted" />
      </span>
      <h1 class="mt-4 text-2xl font-bold">El enlace no sirvió</h1>
      <p class="mt-2 max-w-md text-sm text-muted">{{ error }}</p>
      <UButton class="mt-6" color="neutral" variant="soft" label="Ir al inicio de sesión" @click="router.push('/login')" />
    </div>
  </UCard>
</template>
