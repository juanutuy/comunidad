<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const { login, tenant } = useAuth()
const router = useRouter()
const toast = useToast()
const form = reactive({ email: '', password: '' })
const loading = ref(false)
const error = ref('')

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await login(form.email, form.password)
    toast.add({ title: '¡Hola de nuevo!', color: 'success' })
    router.push('/feeds')
  }
  catch (e) {
    error.value = (e as { data?: { message?: string } }).data?.message || 'No se pudo iniciar sesión.'
  }
  finally { loading.value = false }
}
</script>

<template>
  <UCard>
    <h1 class="text-2xl font-bold">Bienvenido de nuevo</h1>
    <p class="mt-1 text-sm text-muted">Iniciá sesión para seguir en {{ tenant?.name || 'la comunidad' }}.</p>
    <UAlert v-if="error" class="mt-4" color="error" variant="soft" :title="error" />
    <form class="mt-5 space-y-4" @submit.prevent="submit">
      <UFormField label="Correo electrónico">
        <UInput v-model="form.email" type="email" required placeholder="vos@correo.com" class="w-full" />
      </UFormField>
      <UFormField label="Contraseña">
        <UInput v-model="form.password" type="password" required placeholder="Tu contraseña" class="w-full" />
      </UFormField>
      <UButton type="submit" block label="Iniciar sesión" :loading="loading" />
    </form>
    <p class="mt-4 text-center text-sm text-muted">
      ¿Todavía no tenés cuenta? <NuxtLink to="/register" class="font-medium text-primary hover:underline">Creá una gratis</NuxtLink>
    </p>
    <p class="mt-3 rounded-md bg-elevated p-3 text-center text-xs text-muted">
      Demo: admin@demo.local · member@demo.local — contraseña: demo1234
    </p>
  </UCard>
</template>
