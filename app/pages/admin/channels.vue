<script setup lang="ts">
definePageMeta({ middleware: [] })
const { user } = useAuth()
const api = useApi()
const toast = useToast()
const { data, refresh } = await useAsyncData('admin-channels', () =>
  api<{ groups: { id: number, name: string, channels: { id: number, slug: string, name: string, type: string, priceCents: number }[] }[] }>('/api/channels'))

const form = reactive({ name: '', description: '', type: 'free', price: 0 })
const typeOptions = [
  { label: 'Gratuito', value: 'free' },
  { label: 'Privado (solo miembros)', value: 'private' },
  { label: 'Pago', value: 'paid' },
]
const creating = ref(false)
async function create() {
  creating.value = true
  try {
    await api('/api/admin/channels', { method: 'POST', body: { name: form.name, description: form.description, type: form.type, priceCents: Math.round(form.price * 100) } })
    form.name = ''; form.description = ''; form.price = 0; form.type = 'free'
    toast.add({ title: 'Canal creado', color: 'success' })
    await refresh()
    await refreshNuxtData('layout-channels')
  }
  catch (e) {
    toast.add({ title: 'No se pudo crear el canal', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { creating.value = false }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Administrar canales</h1>
      <p class="text-muted">Creá canales y gestioná la estructura de la comunidad.</p>
    </div>
    <UAlert v-if="user && user.role !== 'admin'" color="warning" variant="soft" title="Solo administradores" description="Tu cuenta no tiene rol de administrador en esta comunidad." />
    <template v-else-if="user">
      <UCard>
        <h2 class="mb-3 font-semibold">Nuevo canal</h2>
        <div class="space-y-3">
          <UFormField label="Nombre">
            <UInput v-model="form.name" placeholder="Ej.: Proyectos de miembros" class="w-full" />
          </UFormField>
          <UFormField label="Descripción">
            <UTextarea v-model="form.description" :rows="2" class="w-full" />
          </UFormField>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Tipo">
              <USelect v-model="form.type" :items="typeOptions" class="w-full" />
            </UFormField>
            <UFormField v-if="form.type === 'paid'" label="Precio (USD)">
              <UInput v-model.number="form.price" type="number" min="0" step="0.01" class="w-full" />
            </UFormField>
          </div>
          <div class="flex justify-end">
            <UButton label="Crear canal" icon="i-lucide-plus" :loading="creating" :disabled="!form.name.trim()" @click="create" />
          </div>
        </div>
      </UCard>
      <UCard>
        <h2 class="mb-3 font-semibold">Canales existentes</h2>
        <div v-for="g in data?.groups || []" :key="g.id" class="mb-4">
          <h3 class="mb-1 text-xs font-bold tracking-wider text-muted uppercase">{{ g.name }}</h3>
          <ul class="divide-y divide-default">
            <li v-for="ch in g.channels" :key="ch.id" class="flex items-center gap-2 py-2 text-sm">
              <NuxtLink :to="`/channels/${ch.slug}`" class="flex-1 font-medium hover:underline">{{ ch.name }}</NuxtLink>
              <UBadge color="neutral" variant="subtle">{{ ch.type === 'paid' ? `Pago $${(ch.priceCents / 100).toFixed(2)}` : ch.type === 'private' ? 'Privado' : 'Gratuito' }}</UBadge>
            </li>
          </ul>
        </div>
      </UCard>
    </template>
    <UAlert v-else color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
  </div>
</template>
