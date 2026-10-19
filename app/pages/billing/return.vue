<script setup lang="ts">
// Vuelta desde Stripe Checkout (Fase 4). Esta página NO concede nada:
// muestra el estado real de la compra leído de la base, que lo marca el
// webhook firmado de Stripe cuando el pago se confirma.
const route = useRoute()
const api = useApi()
const { user } = useAuth()
const canceled = computed(() => String(route.query.estado || '') === 'cancelado')

const { data, refresh } = await useAsyncData('billing-return', () =>
  user.value
    ? api<{ payments: { id: number, kind: string, itemName: string, status: string }[] }>('/api/billing/purchases')
    : Promise.resolve(null))
const latest = computed(() => data.value?.payments?.[0] || null)
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  // El webhook puede tardar unos segundos: se re-consulta el estado.
  if (!canceled.value) timer = setInterval(() => refresh(), 3000)
  setTimeout(() => { if (timer) clearInterval(timer) }, 30000)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
watch(() => latest.value?.status, (s) => { if (s === 'paid' && timer) clearInterval(timer) })
</script>

<template>
  <div class="mx-auto max-w-lg space-y-5">
    <UCard class="text-center">
      <UIcon v-if="canceled" name="i-lucide-x-circle" class="text-4xl text-muted" />
      <UIcon v-else-if="latest?.status === 'paid'" name="i-lucide-check-circle-2" class="text-4xl text-green-500" />
      <UIcon v-else name="i-lucide-loader-circle" class="animate-spin text-4xl text-primary" />
      <h1 class="mt-3 text-2xl font-bold">
        {{ canceled ? 'Pago cancelado' : latest?.status === 'paid' ? '¡Pago confirmado!' : 'Confirmando tu pago…' }}
      </h1>
      <p class="mt-2 text-muted">
        <template v-if="canceled">No se hizo ningún cargo y no se activó ningún acceso. Podés reintentarlo cuando quieras desde la página de precios.</template>
        <template v-else-if="latest?.status === 'paid'">Tu compra de «{{ latest.itemName }}» ya está activa. El acceso se concedió al confirmarse el pago.</template>
        <template v-else>Estamos esperando la confirmación del sistema de pagos. Esta página se actualiza sola; tu acceso se activa apenas el pago queda confirmado, sin que tengas que hacer nada más.</template>
      </p>
      <div class="mt-5 flex flex-wrap justify-center gap-2">
        <UButton to="/pricing" label="Ver precios y mis compras" icon="i-lucide-tag" />
        <UButton to="/feeds" color="neutral" variant="soft" label="Ir al feed" />
      </div>
    </UCard>
  </div>
</template>
