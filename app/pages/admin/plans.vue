<script setup lang="ts">
// Planes de membresía (solo admin, Fase 4): CRUD simple por tenant.
// Los planes incluyen acceso a todos los canales pagos del tenant.
const { user, tenant } = useAuth()
const api = useApi()
const toast = useToast()
const { fmtMoney } = useFormat()

interface Plan { id: number, name: string, description: string, priceCents: number, interval: string, active: boolean, activeSubs: number }
const { data, refresh } = await useAsyncData('admin-plans', () =>
  user.value?.role === 'admin' ? api<{ plans: Plan[] }>('/api/admin/plans') : Promise.resolve(null))
const { data: billing } = await useAsyncData('billing-status', () => api<{ enabled: boolean }>('/api/billing/status'))

const form = reactive({ name: '', description: '', price: 9, interval: 'month' })
const intervalItems = [
  { label: 'Mensual', value: 'month' },
  { label: 'Anual', value: 'year' },
  { label: 'Pago único', value: 'once' },
]
const intervalLabel = (i: string) => i === 'year' ? 'anual' : i === 'once' ? 'pago único' : 'mensual'
const creating = ref(false)
async function create() {
  creating.value = true
  try {
    await api('/api/admin/plans', { method: 'POST', body: { name: form.name, description: form.description, priceCents: Math.round(form.price * 100), interval: form.interval } })
    toast.add({ title: 'Plan creado', color: 'success' })
    form.name = ''; form.description = ''
    await refresh()
  }
  catch (e) { toast.add({ title: 'No se pudo crear el plan', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' }) }
  finally { creating.value = false }
}
async function toggleActive(plan: Plan) {
  await api(`/api/admin/plans/${plan.id}`, { method: 'PUT', body: { name: plan.name, description: plan.description, priceCents: plan.priceCents, interval: plan.interval, active: !plan.active } })
  await refresh()
}
async function remove(plan: Plan) {
  if (!confirm(`¿Borrar el plan «${plan.name}»? Si tiene suscripciones se desactivará en vez de borrarse.`)) return
  await api(`/api/admin/plans/${plan.id}`, { method: 'DELETE' })
  toast.add({ title: 'Plan eliminado o desactivado', color: 'success' })
  await refresh()
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Planes de membresía</h1>
      <p class="text-muted">Planes de {{ tenant?.name }}. Incluyen acceso a todos los canales pagos de la comunidad.</p>
    </div>
    <UAlert v-if="user && user.role !== 'admin'" color="warning" variant="soft" title="Solo administradores" />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <template v-else>
      <AdminNav />
      <UAlert v-if="!billing?.enabled" color="warning" variant="soft" icon="i-lucide-credit-card" title="Pagos en línea en oscuro" description="Los planes se pueden crear y se muestran en la página de Precios, pero las suscripciones se activan recién cuando se carguen las claves de Stripe en el servidor (ver README, sección Fase 4). Hoy la UI lo muestra como «Pagos en línea próximamente»." />
      <UCard>
        <h2 class="mb-3 font-bold">Crear plan</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Nombre"><UInput v-model="form.name" class="w-full" placeholder="Membresía Premium" /></UFormField>
          <UFormField label="Descripción"><UInput v-model="form.description" class="w-full" placeholder="Qué incluye el plan" /></UFormField>
          <UFormField label="Precio (USD)"><UInput v-model.number="form.price" type="number" min="0" step="0.5" class="w-full" /></UFormField>
          <UFormField label="Intervalo"><USelect v-model="form.interval" :items="intervalItems" class="w-full" /></UFormField>
        </div>
        <div class="mt-4 flex justify-end">
          <UButton label="Crear plan" icon="i-lucide-plus" :loading="creating" :disabled="!form.name.trim()" @click="create" />
        </div>
      </UCard>
      <UCard>
        <ul class="divide-y divide-default">
          <li v-for="plan in data?.plans || []" :key="plan.id" class="flex flex-wrap items-center gap-3 py-3">
            <div class="min-w-0 flex-1">
              <p class="font-medium">{{ plan.name }} <UBadge v-if="!plan.active" color="neutral" variant="subtle">Inactivo</UBadge></p>
              <p class="text-sm text-muted">{{ plan.description }} · {{ fmtMoney(plan.priceCents) }} · {{ intervalLabel(plan.interval) }} · {{ plan.activeSubs }} suscripción(es) activa(s)</p>
            </div>
            <UButton size="sm" color="neutral" variant="soft" :label="plan.active ? 'Desactivar' : 'Activar'" @click="toggleActive(plan)" />
            <UButton size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" aria-label="Borrar plan" @click="remove(plan)" />
          </li>
          <li v-if="!data?.plans.length" class="py-3 text-sm text-muted">Todavía no hay planes. Creá el primero arriba.</li>
        </ul>
      </UCard>
    </template>
  </div>
</template>
