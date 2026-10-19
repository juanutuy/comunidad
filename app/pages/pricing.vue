<script setup lang="ts">
// Precios del tenant (Fase 4): planes de membresía, canales pagos y
// cursos pagos. Si los pagos no están activados en el servidor, la
// página lo dice con claridad y no ofrece ningún checkout falso.
const api = useApi()
const toast = useToast()
const { user } = useAuth()
const { fmtMoney } = useFormat()

interface Plan { id: number, name: string, description: string, priceCents: number, interval: string }
interface PricingData {
  plans: Plan[]
  channels: { slug: string, name: string, description: string, priceCents: number }[]
  courses: { slug: string, title: string, description: string, level: string, priceCents: number }[]
  billingEnabled: boolean
  tenant: { name: string, slug: string }
}
const { data } = await useAsyncData('pricing', () => api<PricingData>('/api/billing/plans'))
const { data: purchases, refresh: refreshPurchases } = await useAsyncData('my-purchases', () =>
  user.value ? api<{ payments: { id: number, kind: string, itemName: string, amountCents: number, status: string }[], subscriptions: { id: number, planName: string, status: string }[] }>('/api/billing/purchases') : Promise.resolve(null))

const buying = ref('')
const intervalLabel = (i: string) => i === 'year' ? '/año' : i === 'once' ? ' · pago único' : '/mes'

async function buy(key: string, payload: Record<string, unknown>) {
  if (!user.value) { toast.add({ title: 'Iniciá sesión para comprar', color: 'warning' }); return }
  buying.value = key
  try {
    const res = await api<{ url: string }>('/api/billing/checkout', { method: 'POST', body: payload })
    window.location.href = res.url
  }
  catch (e) {
    toast.add({ title: 'No se pudo iniciar el pago', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { buying.value = '' }
}
onMounted(() => refreshPurchases())
</script>

<template>
  <div class="space-y-6">
    <div class="text-center">
      <h1 class="text-3xl font-bold">Precios de {{ data?.tenant?.name || 'la comunidad' }}</h1>
      <p class="mx-auto mt-2 max-w-xl text-muted">Membresías, canales y cursos de esta comunidad. Sin cargos ocultos: lo que ves es lo que pagás.</p>
    </div>

    <UAlert v-if="data && !data.billingEnabled" color="warning" variant="soft" icon="i-lucide-credit-card" title="Pagos en línea próximamente" description="La comunidad todavía no activó los pagos con tarjeta: cuando la administración conecte su cuenta de Stripe, desde esta misma página vas a poder suscribirte y comprar. Mientras tanto, algunos canales ofrecen acceso de demostración claramente etiquetado." />

    <template v-else-if="purchases?.subscriptions?.some(s => s.status === 'active')">
      <UAlert color="success" variant="soft" icon="i-lucide-badge-check" title="Tu membresía está activa" :description="`Plan actual: ${purchases.subscriptions.find(s => s.status === 'active')?.planName}. Ya tenés acceso a los canales pagos.`" />
    </template>

    <div v-if="data?.plans.length" class="grid gap-4 md:grid-cols-2">
      <UCard v-for="plan in data.plans" :key="plan.id" class="flex flex-col">
        <h2 class="text-lg font-bold">{{ plan.name }}</h2>
        <p class="mt-1 flex-1 text-sm text-muted">{{ plan.description }}</p>
        <p class="mt-3 text-3xl font-bold">{{ fmtMoney(plan.priceCents) }}<span class="text-base font-normal text-muted">{{ intervalLabel(plan.interval) }}</span></p>
        <ul class="mt-3 space-y-1 text-sm text-muted">
          <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 text-green-500" /> Acceso a todos los canales pagos</li>
          <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 text-green-500" /> Recursos exclusivos de la biblioteca</li>
          <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 text-green-500" /> Sesiones exclusivas para miembros</li>
        </ul>
        <UButton v-if="data.billingEnabled" class="mt-4" block label="Suscribirme" icon="i-lucide-credit-card" :loading="buying === `plan-${plan.id}`" @click="buy(`plan-${plan.id}`, { kind: 'plan', planId: plan.id })" />
        <UButton v-else class="mt-4" block color="neutral" variant="soft" label="Próximamente" :disabled="true" />
      </UCard>
    </div>

    <UCard v-if="data?.channels.length">
      <h2 class="mb-3 font-bold">Canales pagos (acceso individual)</h2>
      <ul class="divide-y divide-default">
        <li v-for="ch in data.channels" :key="ch.slug" class="flex flex-wrap items-center gap-3 py-3">
          <div class="min-w-0 flex-1">
            <p class="font-medium">{{ ch.name }} <span class="text-muted">· {{ fmtMoney(ch.priceCents) }} pago único</span></p>
            <p class="truncate text-sm text-muted">{{ ch.description }}</p>
          </div>
          <UButton :to="`/channels/${ch.slug}`" size="sm" color="neutral" variant="soft" label="Ver canal" />
          <UButton v-if="data.billingEnabled" size="sm" label="Comprar acceso" icon="i-lucide-credit-card" :loading="buying === `ch-${ch.slug}`" @click="buy(`ch-${ch.slug}`, { kind: 'channel', slug: ch.slug })" />
        </li>
      </ul>
    </UCard>

    <UCard v-if="data?.courses.length">
      <h2 class="mb-3 font-bold">Cursos pagos</h2>
      <ul class="divide-y divide-default">
        <li v-for="co in data.courses" :key="co.slug" class="flex flex-wrap items-center gap-3 py-3">
          <div class="min-w-0 flex-1">
            <p class="font-medium">{{ co.title }} <span class="text-muted">· {{ fmtMoney(co.priceCents) }} pago único</span></p>
            <p class="truncate text-sm text-muted">{{ co.description }}</p>
          </div>
          <UButton :to="`/courses/${co.slug}`" size="sm" color="neutral" variant="soft" label="Ver curso" />
          <UButton v-if="data.billingEnabled" size="sm" label="Comprar curso" icon="i-lucide-credit-card" :loading="buying === `co-${co.slug}`" @click="buy(`co-${co.slug}`, { kind: 'course', slug: co.slug })" />
        </li>
      </ul>
    </UCard>

    <UCard v-if="purchases?.payments.length">
      <h2 class="mb-3 font-bold">Mis compras</h2>
      <ul class="divide-y divide-default text-sm">
        <li v-for="p in purchases.payments" :key="p.id" class="flex items-center gap-3 py-2">
          <span class="flex-1">{{ p.itemName || p.kind }}</span>
          <span class="text-muted">{{ fmtMoney(p.amountCents) }}</span>
          <UBadge :color="p.status === 'paid' ? 'success' : p.status === 'pending' ? 'warning' : 'error'" variant="subtle">{{ p.status === 'paid' ? 'Pagado' : p.status === 'pending' ? 'Pendiente de confirmación' : 'Sin completar' }}</UBadge>
        </li>
      </ul>
      <p class="mt-2 text-xs text-muted">El estado lo confirma el sistema de pagos automáticamente; la vuelta desde la pasarela nunca activa un acceso por sí sola.</p>
    </UCard>
  </div>
</template>
