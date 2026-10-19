<script setup lang="ts">
// Página de invitación (Fase 14): el enlace que genera un
// administrador (por correo o reutilizable). Si la invitación sirve,
// muestra el registro; la cuenta nace APROBADA aunque la comunidad
// pida aprobación previa — la invitación es la aprobación. Si no
// sirve, dice por qué sin vueltas.
definePageMeta({ layout: 'auth' })
const route = useRoute()
const router = useRouter()
const api = useApi()
const { register, user } = useAuth()
const toast = useToast()
const token = computed(() => String(route.params.token || ''))

interface InviteInfo { valid: boolean, reason?: string, kind?: string, email?: string, tenantName: string }
const { data } = await useAsyncData(`invite-${token.value}`, () =>
  api<InviteInfo>(`/api/invite/${token.value}`)
    .catch((): InviteInfo => ({ valid: false, reason: 'not_found', tenantName: '' })))

const reasonText = computed(() => {
  switch (data.value?.reason) {
    case 'expired': return 'Esta invitación venció. Pedile una nueva a un administrador de la comunidad.'
    case 'revoked': return 'Esta invitación fue revocada por un administrador. Pedile una nueva si la necesitás.'
    case 'accepted': return 'Esta invitación ya fue usada. Si ya creaste tu cuenta, iniciá sesión.'
    default: return 'Este enlace de invitación no existe o no es válido.'
  }
})

const form = reactive({ name: '', email: '', password: '' })
watchEffect(() => { if (data.value?.email) form.email = data.value.email })
const loading = ref(false)
const error = ref('')

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await register(form.name, form.email, form.password, { inviteToken: token.value })
    toast.add({ title: '¡Cuenta creada! Bienvenido a la comunidad', color: 'success' })
    router.push('/feeds')
  }
  catch (e) {
    error.value = (e as { data?: { message?: string } }).data?.message || 'No se pudo crear la cuenta.'
  }
  finally { loading.value = false }
}
</script>

<template>
  <UCard>
    <template v-if="user">
      <h1 class="text-2xl font-bold">Ya tenés una cuenta</h1>
      <p class="mt-1 text-sm text-muted">Estás conectado como {{ user.name }}. La invitación es para crear una cuenta nueva; si era para vos, cerrá sesión y volvé a abrir el enlace.</p>
      <UButton class="mt-5" block label="Ir a la comunidad" @click="router.push('/feeds')" />
    </template>
    <template v-else-if="data?.valid">
      <h1 class="text-2xl font-bold">Te invitaron a {{ data.tenantName }}</h1>
      <p class="mt-1 text-sm text-muted">Creá tu cuenta para entrar. Con esta invitación tu ingreso ya está aprobado: no tenés que esperar ninguna revisión.</p>
      <UAlert v-if="error" class="mt-4" color="error" variant="soft" :title="error" />
      <form class="mt-5 space-y-4" @submit.prevent="submit">
        <UFormField label="Nombre">
          <UInput v-model="form.name" required placeholder="Tu nombre" class="w-full" />
        </UFormField>
        <UFormField label="Correo electrónico" :hint="data.kind === 'email' ? 'Esta invitación es solo para este correo.' : undefined">
          <UInput v-model="form.email" type="email" required placeholder="vos@correo.com" :disabled="data.kind === 'email'" class="w-full" />
        </UFormField>
        <UFormField label="Contraseña" hint="Mínimo 8 caracteres">
          <UInput v-model="form.password" type="password" required minlength="8" placeholder="Creá una contraseña" class="w-full" />
        </UFormField>
        <UButton type="submit" block label="Crear cuenta y entrar" :loading="loading" />
      </form>
      <p class="mt-4 text-center text-sm text-muted">
        ¿Ya tenés cuenta? <NuxtLink to="/login" class="font-medium text-primary hover:underline">Iniciá sesión</NuxtLink>
      </p>
    </template>
    <template v-else>
      <div class="flex flex-col items-center py-4 text-center">
        <span class="flex h-14 w-14 items-center justify-center rounded-full bg-elevated">
          <UIcon name="i-lucide-mail-x" class="text-3xl text-muted" />
        </span>
        <h1 class="mt-4 text-2xl font-bold">Invitación no válida</h1>
        <p class="mt-2 max-w-md text-sm text-muted">{{ reasonText }}</p>
        <UButton class="mt-6" color="neutral" variant="soft" label="Ir al inicio de sesión" @click="router.push('/login')" />
      </div>
    </template>
  </UCard>
</template>
