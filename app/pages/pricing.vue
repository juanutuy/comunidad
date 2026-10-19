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
const { t } = useI18n()
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
const intervalLabel = (i: string) => i === 'year' ? t('pricing.intervalYear') : i === 'once' ? t('pricing.oneTimeSuffix') : t('pricing.intervalMonth')

async function buy(key: string, payload: Record<string, unknown>) {
  if (!user.value) { toast.add({ title: t('pricing.loginToBuy'), color: 'warning' }); return }
  buying.value = key
  try {
    const res = await api<{ url: string }>('/api/billing/checkout', { method: 'POST', body: payload })
    window.location.href = res.url
  }
  catch (e) {
    toast.add({ title: t('pricing.buyFailed'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { buying.value = '' }
}

// Pago manual: un solo diálogo para planes, canales y cursos.
const manual = reactive({ open: false, kind: 'plan' as 'channel' | 'course' | 'plan', slug: '', planId: 0, itemId: 0, productName: '', amountCents: 0 })
function openManual(kind: 'channel' | 'course' | 'plan', opts: { slug?: string, planId?: number, itemId?: number, productName: string, amountCents: number }) {
  if (!user.value) { toast.add({ title: t('pricing.loginToBuy'), color: 'warning' }); return }
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
  if (p.status === 'paid') return { color: 'success' as const, label: t('pricing.badgePaid') }
  if (p.status === 'pending') return p.gateway === 'manual'
    ? { color: 'warning' as const, label: t('pricing.badgeInReview') }
    : { color: 'warning' as const, label: t('pricing.badgePending') }
  if (p.status === 'rejected') return { color: 'error' as const, label: t('pricing.badgeRejected') }
  return { color: 'error' as const, label: t('pricing.badgeIncomplete') }
}
onMounted(() => refreshPurchases())
</script>

<template>
  <div class="space-y-6">
    <div class="text-center">
      <h1 class="text-3xl font-bold">{{ t('pricing.title', { name: data?.tenant?.name || t('pricing.theCommunity') }) }}</h1>
      <p class="mx-auto mt-2 max-w-xl text-muted">{{ t('pricing.subtitle') }}</p>
    </div>

    <UAlert v-if="data && !data.billingEnabled && !data.manualEnabled" color="warning" variant="soft" icon="i-lucide-credit-card" :title="t('pricing.paymentsSoonTitle')" :description="t('pricing.paymentsSoonText')" />
    <UAlert v-else-if="data && !data.billingEnabled && data.manualEnabled" color="info" variant="soft" icon="i-lucide-hand-coins" :title="t('pricing.manualAvailableTitle')" :description="t('pricing.manualAvailableText')" />

    <UAlert v-if="purchases?.subscriptions?.some(s => s.status === 'active')" color="success" variant="soft" icon="i-lucide-badge-check" :title="t('pricing.membershipActiveTitle')" :description="t('pricing.currentPlan', { plan: purchases.subscriptions.find(s => s.status === 'active')?.planName || '' })" />

    <div v-if="data?.plans.length" class="grid gap-4 md:grid-cols-2">
      <UCard
        v-for="plan in data.plans" :key="plan.id" class="flex flex-col"
        :class="plan.featured ? 'ring-2 ring-warning' : ''"
      >
        <div class="flex items-start justify-between gap-2">
          <h2 class="text-lg font-bold">{{ plan.name }}</h2>
          <UBadge v-if="plan.featured" color="warning" variant="solid" icon="i-lucide-star">{{ t('pricing.featured') }}</UBadge>
        </div>
        <p class="mt-1 flex-1 text-sm text-muted">{{ plan.description }}</p>
        <p class="mt-3 text-3xl font-bold">{{ money(plan.priceCents) }}<span class="text-base font-normal text-muted">{{ intervalLabel(plan.interval) }}</span></p>
        <ul class="mt-3 space-y-1 text-sm text-muted">
          <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 text-green-500" /> {{ t('pricing.featureAllChannels') }}</li>
          <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 text-green-500" /> {{ t('pricing.featureLibrary') }}</li>
          <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 text-green-500" /> {{ t('pricing.featureSessions') }}</li>
        </ul>
        <div class="mt-4 flex flex-col gap-2">
          <UButton v-if="data.billingEnabled" block :label="t('pricing.subscribe')" icon="i-lucide-credit-card" :loading="buying === `plan-${plan.id}`" @click="buy(`plan-${plan.id}`, { kind: 'plan', planId: plan.id })" />
          <UButton v-if="data.manualEnabled && manualPending('plan', plan.id)" block color="warning" variant="soft" icon="i-lucide-hourglass" :label="t('pricing.paymentInReview')" :disabled="true" />
          <UButton v-else-if="data.manualEnabled" block color="neutral" variant="soft" :label="t('pricing.manualPayment')" icon="i-lucide-hand-coins" @click="openManual('plan', { planId: plan.id, productName: t('pricing.membershipProduct', { name: plan.name }), amountCents: plan.priceCents })" />
          <UButton v-if="!data.billingEnabled && !data.manualEnabled" block color="neutral" variant="soft" :label="t('pricing.comingSoon')" :disabled="true" />
        </div>
      </UCard>
    </div>

    <UCard v-if="data?.channels.length">
      <h2 class="mb-3 font-bold">{{ t('pricing.oneTimeAccesses') }}</h2>
      <ul class="divide-y divide-default">
        <li v-for="ch in data.channels" :key="ch.slug" class="flex flex-wrap items-center gap-3 py-3">
          <div class="min-w-0 flex-1">
            <p class="font-medium">{{ ch.name }} <span class="text-muted">{{ money(ch.priceCents) }}{{ t('pricing.oneTimeSuffix') }}</span></p>
            <p class="truncate text-sm text-muted">{{ ch.description }}</p>
          </div>
          <UButton :to="`/channels/${ch.slug}`" size="sm" color="neutral" variant="soft" :label="t('pricing.viewChannel')" />
          <UButton v-if="data.billingEnabled" size="sm" :label="t('pricing.buyAccess')" icon="i-lucide-credit-card" :loading="buying === `ch-${ch.slug}`" @click="buy(`ch-${ch.slug}`, { kind: 'channel', slug: ch.slug })" />
          <UButton v-if="data.manualEnabled && manualPending('channel', ch.id)" size="sm" color="warning" variant="soft" icon="i-lucide-hourglass" :label="t('pricing.paymentInReview')" :disabled="true" />
          <UButton v-else-if="data.manualEnabled" size="sm" color="neutral" variant="soft" :label="t('pricing.manualPayment')" icon="i-lucide-hand-coins" @click="openManual('channel', { slug: ch.slug, itemId: ch.id, productName: t('pricing.channelProduct', { name: ch.name }), amountCents: ch.priceCents })" />
        </li>
      </ul>
    </UCard>

    <UCard v-if="data?.courses.length">
      <h2 class="mb-3 font-bold">{{ t('pricing.paidCourses') }}</h2>
      <ul class="divide-y divide-default">
        <li v-for="co in data.courses" :key="co.slug" class="flex flex-wrap items-center gap-3 py-3">
          <div class="min-w-0 flex-1">
            <p class="font-medium">{{ co.title }} <span class="text-muted">{{ money(co.priceCents) }}{{ t('pricing.oneTimeSuffix') }}</span></p>
            <p class="truncate text-sm text-muted">{{ co.description }}</p>
          </div>
          <UButton :to="`/courses/${co.slug}`" size="sm" color="neutral" variant="soft" :label="t('pricing.viewCourse')" />
          <UButton v-if="data.billingEnabled" size="sm" :label="t('pricing.buyCourse')" icon="i-lucide-credit-card" :loading="buying === `co-${co.slug}`" @click="buy(`co-${co.slug}`, { kind: 'course', slug: co.slug })" />
          <UButton v-if="data.manualEnabled && manualPending('course', co.id)" size="sm" color="warning" variant="soft" icon="i-lucide-hourglass" :label="t('pricing.paymentInReview')" :disabled="true" />
          <UButton v-else-if="data.manualEnabled" size="sm" color="neutral" variant="soft" :label="t('pricing.manualPayment')" icon="i-lucide-hand-coins" @click="openManual('course', { slug: co.slug, itemId: co.id, productName: t('pricing.courseProduct', { title: co.title }), amountCents: co.priceCents })" />
        </li>
      </ul>
    </UCard>

    <UCard v-if="purchases?.payments.length">
      <h2 class="mb-3 font-bold">{{ t('pricing.myPurchases') }}</h2>
      <ul class="divide-y divide-default text-sm">
        <li v-for="p in purchases.payments" :key="p.id" class="flex items-center gap-3 py-2">
          <span class="flex-1">{{ p.itemName || p.kind }} <span v-if="p.gateway === 'manual'" class="text-muted">{{ t('pricing.manualTag') }}</span></span>
          <span class="text-muted">{{ money(p.amountCents) }}</span>
          <UBadge :color="paymentBadge(p).color" variant="subtle">{{ paymentBadge(p).label }}</UBadge>
        </li>
      </ul>
      <p class="mt-2 text-xs text-muted">{{ t('pricing.purchasesNote') }}</p>
    </UCard>

    <ManualPaymentDialog
      v-model:open="manual.open" :kind="manual.kind" :slug="manual.slug || undefined" :plan-id="manual.planId || undefined" :item-id="manual.itemId || undefined"
      :product-name="manual.productName" :amount-cents="manual.amountCents"
      @sent="refreshPurchases"
    />
  </div>
</template>
