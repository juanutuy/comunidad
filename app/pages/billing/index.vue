<script setup lang="ts">
const { user } = useAuth()
const { t } = useI18n()
const { requestAccess } = useGuestAccess()
const { fmtAmount, fmtDate } = useFormat()
const api = useApi()
interface Subscription { id: number, planName: string, interval: string, status: string, source: string, currentPeriodEnd: string, cancelAtPeriodEnd: boolean, canManage: boolean, canChangeRenewal: boolean }
interface Payment { id: number, itemName: string, amountCents: number, currency: string, status: string, createdAt: string }
const { data, error, status, refresh } = await useAsyncData('billing-account', () => user.value ? api<{ subscriptions: Subscription[], payments: Payment[] }>('/api/billing/purchases') : Promise.resolve(null), { watch: [() => user.value?.id] })
const busy = ref(false)
const actionError = ref('')
const target = ref<Subscription | null>(null)
const confirmOpen = computed({ get: () => !!target.value, set: value => { if (!value) target.value = null } })
const subscriptionLabel = (value: string) => value === 'active' ? t('completion.active') : value === 'canceled' ? t('completion.canceled') : t('completion.inactive')
const paymentLabel = (value: string) => value === 'paid' ? t('completion.paid') : value === 'rejected' ? t('completion.rejected') : value === 'failed' ? t('completion.failed') : t('completion.pending')
async function renewal() {
  if (!target.value) return
  busy.value = true
  actionError.value = ''
  try {
    await api(`/api/billing/subscriptions/${target.value.id}`, { method: 'POST', body: { cancelAtPeriodEnd: !target.value.cancelAtPeriodEnd } })
    target.value = null
    await refresh()
  }
  catch (e) { actionError.value = (e as { data?: { message?: string } }).data?.message || t('completion.failed') }
  finally { busy.value = false }
}
async function portal(subscriptionId: number) {
  busy.value = true
  actionError.value = ''
  try {
    const result = await api<{ url: string }>('/api/billing/portal', { method: 'POST', body: { subscriptionId } })
    await navigateTo(result.url, { external: true })
  }
  catch (e) { actionError.value = (e as { data?: { message?: string } }).data?.message || t('completion.failed') }
  finally { busy.value = false }
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <h1 class="text-2xl font-bold">{{ t('completion.billing') }}</h1>
    <UButton v-if="!user" :label="t('nav.login')" icon="i-lucide-log-in" @click="requestAccess('/billing')" />
    <UProgress v-else-if="status === 'pending'" />
    <UAlert v-else-if="error" color="error" :title="t('completion.failed')" />
    <template v-else-if="data">
      <UAlert v-if="actionError" color="error" :title="actionError" />
      <h2 class="text-lg font-semibold">{{ t('completion.subscriptions') }}</h2>
      <UCard v-for="subscription in data.subscriptions" :key="subscription.id">
        <h3 class="font-bold">{{ subscription.planName }}</h3>
        <p class="mt-2 text-sm">{{ subscriptionLabel(subscription.status) }}</p>
        <p v-if="subscription.currentPeriodEnd" class="mt-2 text-sm text-muted">{{ t('completion.accessUntil') }} {{ fmtDate(subscription.currentPeriodEnd) }}</p>
        <p v-if="subscription.cancelAtPeriodEnd" class="mt-2 text-sm text-warning">{{ t('completion.cancelScheduled') }}</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <UButton v-if="subscription.canManage" color="neutral" variant="soft" :loading="busy" :label="t('completion.portal')" @click="portal(subscription.id)" />
          <UButton v-if="subscription.canChangeRenewal" color="neutral" variant="outline" :disabled="busy" :label="subscription.cancelAtPeriodEnd ? t('completion.resume') : t('completion.stopRenewal')" @click="target = subscription" />
        </div>
      </UCard>
      <p v-if="!data.subscriptions.length" class="text-muted">{{ t('completion.noSubscriptions') }}</p>
      <h2 class="text-lg font-semibold">{{ t('completion.payments') }}</h2>
      <UCard v-for="payment in data.payments" :key="payment.id"><div class="flex flex-wrap justify-between gap-3"><span class="font-medium">{{ payment.itemName }}</span><span>{{ fmtAmount(payment.amountCents, payment.currency) }}</span></div><p class="mt-2 text-sm text-muted">{{ fmtDate(payment.createdAt) }} · {{ paymentLabel(payment.status) }}</p></UCard>
      <p v-if="!data.payments.length" class="text-muted">{{ t('completion.noPayments') }}</p>
    </template>
    <UModal v-model:open="confirmOpen" :title="target?.cancelAtPeriodEnd ? t('completion.resume') : t('completion.stopRenewal')" :description="t('completion.renewalHint')" :dismissible="!busy">
      <template #body><UAlert v-if="actionError" color="error" :title="actionError" /></template>
      <template #footer><UButton color="neutral" variant="ghost" :disabled="busy" :label="t('common.cancel')" @click="target = null" /><UButton :loading="busy" :label="t('completion.confirm')" @click="renewal" /></template>
    </UModal>
  </div>
</template>
