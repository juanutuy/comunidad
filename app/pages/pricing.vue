<script setup lang="ts">
// Precios del tenant (Fase 4): planes de membresía, canales pagos y
// cursos pagos. Si los pagos no están activados en el servidor, la
// página lo dice con claridad y no ofrece ningún checkout falso.
// Fase 17: los planes salen en el orden elegido por el admin con el
// destacado resaltado, los precios se formatean en la moneda del
// tenant, y si hay pagos manuales activos el comprador puede pagar
// por fuera y declarar el pago (queda en revisión: NO concede nada
// hasta que un admin lo aprueba en Ingresos).
const api = useApi()
const toast = useToast()
const { user } = useAuth()
const { fmtMoney } = useFormat()

interface Plan { id: number, name: string, description: string, priceCents: number, interval: string, featured: boolean }
interface PricingData {
  plans: Plan[]
  channels: { id: number, slug: string, name: string, description: string, priceCents: number }[]
  courses: { id: number, slug: string, title: string, description: string, level: string, priceCents: number }[]
  billingEnabled: boolean
  manualEnabled: boolean
  currency: string
  tenant: { name: string, slug: string }
}
interface MyPayment { id: number, kind: string, itemId: number, planId: number, itemName: string, amountCents: number, status: string, gateway: string }
const { data } = await useAsyncData('pricing', () => api<PricingData>('/api/billing/plans'))
const { data: purchases, refresh: refreshPurchases } = await useAsyncData('my-purchases', () =>
  user.value ? api<{ payments: MyPayment[], subscriptions: { id: number, planName: string, status: string }[] }>('/api/billing/purchases') : Promise.resolve(null))

const money = (cents: number) => fmtMoney(cents, data.value?.currency || 'USD')
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

// Pago manual: un solo diálogo para planes, canales y cursos.
const manual = reactive({ open: false, kind: 'plan' as 'channel' | 'course' | 'plan', slug: '', planId: 0, itemId: 0, productName: '', amountCents: 0 })
function openManual(kind: 'channel' | 'course' | 'plan', opts: { slug?: string, planId?: number, itemId?: number, productName: string, amountCents: number }) {
  if (!user.value) { toast.add({ title: 'Iniciá sesión para comprar', color: 'warning' }); return }
  manual.kind = kind
  manual.slug = opts.slug || ''
  manual.planId = opts.planId || 0
  manual.itemId = opts.itemId || 0
  manual.productName = opts.productName
  manual.amountCents = opts.amountCents
  manual.open = true
}
// ¿Ya hay un pago manual pendiente para este producto? Entonces el
// botón no ofrece otro: muestra el estado real.
function manualPending(kind: string, itemId: number): boolean {
  return !!purchases.value?.payments.some(p => p.gateway === 'manual' && p.status === 'pending' && p.kind === kind && (kind === 'plan' ? p.planId === itemId : p.itemId === itemId))
}
function paymentBadge(p: MyPayment) {
  if (p.status === 'paid') return { color: 'success' as const, label: 'Pagado' }
  if (p.status === 'pending') return p.gateway === 'manual'
    ? { color: 'warning' as const, label: 'En revisión' }
    : { color: 'warning' as const, label: 'Pendiente de confirmación' }
  if (p.status === 'rejected') return { color: 'error' as const, label: 'Rechazado' }
  return { color: 'error' as const, label: 'Sin completar' }
}
onMounted(() => refreshPurchases())
</script>

<template>
  <div class="space-y-6">
    <div class="text-center">
      <h1 class="text-3xl font-bold">Precios de {{ data?.tenant?.name || 'la comunidad' }}</h1>
      <p class="mx-auto mt-2 max-w-xl text-muted">Membresías, canales y cursos de esta comunidad. Sin cargos ocultos: lo que ves es lo que pagás.</p>
    </div>

    <UAlert v-if="data && !data.billingEnabled && !data.manualEnabled" color="warning" variant="soft" icon="i-lucide-credit-card" title="Pagos próximamente" description="La comunidad todavía no activó ningún medio de pago: cuando la administración conecte su cuenta de Stripe o active los pagos manuales, desde esta misma página vas a poder suscribirte y comprar. Mientras tanto, algunos canales ofrecen acceso de demostración claramente etiquetado." />
    <UAlert v-else-if="data && !data.billingEnabled && data.manualEnabled" color="info" variant="soft" icon="i-lucide-hand-coins" title="Pago manual disponible" description="Esta comunidad cobra por fuera de la plataforma (transferencia, billetera o su propio enlace): elegí «Pago manual» en lo que quieras comprar, seguí las instrucciones y declará el pago. La administración lo verifica y recién ahí se activa tu acceso." />

    <UAlert v-if="purchases?.subscriptions?.some(s => s.status === 'active')" color="success" variant="soft" icon="i-lucide-badge-check" title="Tu membresía está activa" :description="`Plan actual: ${purchases.subscriptions.find(s => s.status === 'active')?.planName}. Ya tenés acceso a los canales pagos.`" />

    <div v-if="data?.plans.length" class="grid gap-4 md:grid-cols-2">
      <UCard
        v-for="plan in data.plans" :key="plan.id" class="flex flex-col"
        :class="plan.featured ? 'ring-2 ring-warning' : ''"
      >
        <div class="flex items-start justify-between gap-2">
          <h2 class="text-lg font-bold">{{ plan.name }}</h2>
          <UBadge v-if="plan.featured" color="warning" variant="solid" icon="i-lucide-star">Destacado</UBadge>
        </div>
        <p class="mt-1 flex-1 text-sm text-muted">{{ plan.description }}</p>
        <p class="mt-3 text-3xl font-bold">{{ money(plan.priceCents) }}<span class="text-base font-normal text-muted">{{ intervalLabel(plan.interval) }}</span></p>
        <ul class="mt-3 space-y-1 text-sm text-muted">
          <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 text-green-500" /> Acceso a todos los canales pagos</li>
          <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 text-green-500" /> Recursos exclusivos de la biblioteca</li>
          <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 text-green-500" /> Sesiones exclusivas para miembros</li>
        </ul>
        <div class="mt-4 flex flex-col gap-2">
          <UButton v-if="data.billingEnabled" block label="Suscribirme" icon="i-lucide-credit-card" :loading="buying === `plan-${plan.id}`" @click="buy(`plan-${plan.id}`, { kind: 'plan', planId: plan.id })" />
          <UButton v-if="data.manualEnabled && manualPending('plan', plan.id)" block color="warning" variant="soft" icon="i-lucide-hourglass" label="Tu pago está en revisión" :disabled="true" />
          <UButton v-else-if="data.manualEnabled" block color="neutral" variant="soft" label="Pago manual" icon="i-lucide-hand-coins" @click="openManual('plan', { planId: plan.id, productName: `Membresía ${plan.name}`, amountCents: plan.priceCents })" />
          <UButton v-if="!data.billingEnabled && !data.manualEnabled" block color="neutral" variant="soft" label="Próximamente" :disabled="true" />
        </div>
      </UCard>
    </div>

    <UCard v-if="data?.channels.length">
      <h2 class="mb-3 font-bold">Accesos únicos</h2>
      <ul class="divide-y divide-default">
        <li v-for="ch in data.channels" :key="ch.slug" class="flex flex-wrap items-center gap-3 py-3">
          <div class="min-w-0 flex-1">
            <p class="font-medium">{{ ch.name }} <span class="text-muted">· {{ money(ch.priceCents) }} pago único</span></p>
            <p class="truncate text-sm text-muted">{{ ch.description }}</p>
          </div>
          <UButton :to="`/channels/${ch.slug}`" size="sm" color="neutral" variant="soft" label="Ver canal" />
          <UButton v-if="data.billingEnabled" size="sm" label="Comprar acceso" icon="i-lucide-credit-card" :loading="buying === `ch-${ch.slug}`" @click="buy(`ch-${ch.slug}`, { kind: 'channel', slug: ch.slug })" />
          <UButton v-if="data.manualEnabled && manualPending('channel', ch.id)" size="sm" color="warning" variant="soft" icon="i-lucide-hourglass" label="Tu pago está en revisión" :disabled="true" />
          <UButton v-else-if="data.manualEnabled" size="sm" color="neutral" variant="soft" label="Pago manual" icon="i-lucide-hand-coins" @click="openManual('channel', { slug: ch.slug, itemId: ch.id, productName: `Acceso al canal ${ch.name}`, amountCents: ch.priceCents })" />
        </li>
      </ul>
    </UCard>

    <UCard v-if="data?.courses.length">
      <h2 class="mb-3 font-bold">Cursos pagos</h2>
      <ul class="divide-y divide-default">
        <li v-for="co in data.courses" :key="co.slug" class="flex flex-wrap items-center gap-3 py-3">
          <div class="min-w-0 flex-1">
            <p class="font-medium">{{ co.title }} <span class="text-muted">· {{ money(co.priceCents) }} pago único</span></p>
            <p class="truncate text-sm text-muted">{{ co.description }}</p>
          </div>
          <UButton :to="`/courses/${co.slug}`" size="sm" color="neutral" variant="soft" label="Ver curso" />
          <UButton v-if="data.billingEnabled" size="sm" label="Comprar curso" icon="i-lucide-credit-card" :loading="buying === `co-${co.slug}`" @click="buy(`co-${co.slug}`, { kind: 'course', slug: co.slug })" />
          <UButton v-if="data.manualEnabled && manualPending('course', co.id)" size="sm" color="warning" variant="soft" icon="i-lucide-hourglass" label="Tu pago está en revisión" :disabled="true" />
          <UButton v-else-if="data.manualEnabled" size="sm" color="neutral" variant="soft" label="Pago manual" icon="i-lucide-hand-coins" @click="openManual('course', { slug: co.slug, itemId: co.id, productName: `Curso ${co.title}`, amountCents: co.priceCents })" />
        </li>
      </ul>
    </UCard>

    <UCard v-if="purchases?.payments.length">
      <h2 class="mb-3 font-bold">Mis compras</h2>
      <ul class="divide-y divide-default text-sm">
        <li v-for="p in purchases.payments" :key="p.id" class="flex items-center gap-3 py-2">
          <span class="flex-1">{{ p.itemName || p.kind }} <span v-if="p.gateway === 'manual'" class="text-muted">· pago manual</span></span>
          <span class="text-muted">{{ money(p.amountCents) }}</span>
          <UBadge :color="paymentBadge(p).color" variant="subtle">{{ paymentBadge(p).label }}</UBadge>
        </li>
      </ul>
      <p class="mt-2 text-xs text-muted">Los pagos con tarjeta los confirma la pasarela automáticamente; los pagos manuales los aprueba la administración tras verificarlos. Ningún acceso se activa solo por declarar un pago.</p>
    </UCard>

    <ManualPaymentDialog
      v-model:open="manual.open" :kind="manual.kind" :slug="manual.slug || undefined" :plan-id="manual.planId || undefined" :item-id="manual.itemId || undefined"
      :product-name="manual.productName" :amount-cents="manual.amountCents"
      @sent="refreshPurchases"
    />
  </div>
</template>
