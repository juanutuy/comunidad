<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const { register } = useAuth()
const router = useRouter()
const toast = useToast()
const form = reactive({ name: '', email: '', password: '' })
const loading = ref(false)
const error = ref('')

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await register(form.name, form.email, form.password)
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
    <h1 class="text-2xl font-bold">Creá tu cuenta</h1>
    <p class="mt-1 text-sm text-muted">Es gratis y toma menos de un minuto.</p>
    <UAlert v-if="error" class="mt-4" color="error" variant="soft" :title="error" />
    <form class="mt-5 space-y-4" @submit.prevent="submit">
      <UFormField label="Nombre">
        <UInput v-model="form.name" required placeholder="Tu nombre" class="w-full" />
      </UFormField>
      <UFormField label="Correo electrónico">
        <UInput v-model="form.email" type="email" required placeholder="vos@correo.com" class="w-full" />
      </UFormField>
      <UFormField label="Contraseña" hint="Mínimo 8 caracteres">
        <UInput v-model="form.password" type="password" required minlength="8" placeholder="Creá una contraseña" class="w-full" />
      </UFormField>
      <UButton type="submit" block label="Crear cuenta" :loading="loading" />
    </form>
    <p class="mt-4 text-center text-sm text-muted">
      ¿Ya tenés cuenta? <NuxtLink to="/login" class="font-medium text-primary hover:underline">Iniciá sesión</NuxtLink>
    </p>
  </UCard>
</template>
