<script setup lang="ts">
// Ingresos y órdenes (Fase 17): KPIs reales desde `payments` y la
// tabla de órdenes, como en la referencia — sin buscador, sin
// filtros y sin exportar (la referencia tampoco los tiene).
// El moderador la VE (lectura); la cola de pagos manuales pendientes
// y sus decisiones son solo del admin (la API las exige igual).
definePageMeta({ layout: 'admin' })
const { user, tenant } = useAuth()
const api = useApi()
const toast = useToast()
const { fmtAmount, fmtDate, fmtDateTime } = useFormat()

interface Order {
  id: number, buyerName: string, buyerEmail: string, productName: string, kind: string
  priceType: string, gateway: string, amountCents: number, paymentCurrency: string
  paymentStatus: string, subscriptionStatus: string, nextRenewal: string, createdAt: string
}
interface PendingPayment {
  id: number, kind: string, amountCents: number, paymentCurrency: string, reference: string
  createdAt: string, buyerName: string, buyerEmail: string, productName: string, methodTitle: string
}
interface EarningsData {
  currency: string
  kpis: { totalRevenueCents: number, monthRevenueCents: number, monthOrders: number }
  total: number
  orders: Order[]
}
const canRead = computed(() => user.value?.role === 'admin' || user.value?.role === 'moderator')
const isAdmin = computed(() => user.value?.role === 'admin')
const { data, refresh } = await useAsyncData('admin-earnings', () =>
  canRead.value ? api<EarningsData>('/api/admin/earnings?limit=100') : Promise.resolve(null))
const { data: pendingData, refresh: refreshPending } = await useAsyncData('admin-earnings-pending', () =>
  isAdmin.value ? api<{ pending: PendingPayment[] }>('/api/admin/earnings/pending') : Promise.resolve(null))

const kindLabel = (k: string) => k === 'channel' ? 'Canal' : k === 'course' ? 'Curso' : k === 'plan' ? 'Membresía' : k
const statusBadge = (s: string) => s === 'paid'
  ? { color: 'success' as const, label: 'Pagado' }
  : s === 'pending'
    ? { color: 'warning' as const, label: 'Pendiente' }
    : s === 'rejected'
      ? { color: 'error' as const, label: 'Rechazado' }
      : { color: 'neutral' as const, label: 'Sin completar' }
const subLabel = (o: Order) => o.kind !== 'plan'
  ? '—'
  : o.subscriptionStatus === 'active' ? 'Activa' : o.subscriptionStatus === 'canceled' ? 'Cancelada' : o.subscriptionStatus || '—'

const deciding = ref(0)
async function decide(p: PendingPayment, action: 'approve' | 'reject') {
  const verb = action === 'approve' ? 'aprobar' : 'rechazar'
  if (!confirm(`¿Seguro que querés ${verb} el pago de ${p.buyerName} por ${p.productName} (${fmtAmount(p.amountCents, p.paymentCurrency)})?${action === 'approve' ? ' Al aprobar se concede el acceso en el acto.' : ' Al rechazar no se concede ningún acceso.'}`)) return
  deciding.value = p.id
  try {
    await api(`/api/admin/earnings/${p.id}/${action}`, { method: 'POST' })
    toast.add({ title: action === 'approve' ? 'Pago aprobado: acceso concedido' : 'Pago rechazado', color: 'success' })
    await Promise.all([refresh(), refreshPending()])
  }
  catch (e) { toast.add({ title: 'No se pudo registrar la decisión', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' }) }
  finally { deciding.value = 0 }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Ingresos y órdenes</h1>
      <p class="text-muted">El dinero de {{ tenant?.name }}: ingresos confirmados y todas las órdenes registradas, tal como están en la base.</p>
    </div>
    <UAlert v-if="user && !canRead" color="warning" variant="soft" title="Solo administradores y moderadores" />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta del equipo" />
    <template v-else-if="data">
      <div class="grid gap-4 sm:grid-cols-3">
        <UCard>
          <p class="flex items-center gap-2 text-sm text-muted"><UIcon name="i-lucide-banknote" /> Ingresos totales</p>
          <p class="mt-1 text-3xl font-bold">{{ fmtAmount(data.kpis.totalRevenueCents, data.currency) }}</p>
          <p class="text-xs text-muted">Suma histórica de pagos confirmados.</p>
        </UCard>
        <UCard>
          <p class="flex items-center gap-2 text-sm text-muted"><UIcon name="i-lucide-calendar-check" /> Ingresos de este mes</p>
          <p class="mt-1 text-3xl font-bold">{{ fmtAmount(data.kpis.monthRevenueCents, data.currency) }}</p>
          <p class="text-xs text-muted">Pagos confirmados creados este mes.</p>
        </UCard>
        <UCard>
          <p class="flex items-center gap-2 text-sm text-muted"><UIcon name="i-lucide-shopping-cart" /> Órdenes de este mes</p>
          <p class="mt-1 text-3xl font-bold">{{ data.kpis.monthOrders }}</p>
          <p class="text-xs text-muted">{{ data.total }} órdenes en total.</p>
        </UCard>
      </div>

      <UCard v-if="isAdmin" :ui="{ body: 'p-0 sm:p-0' }">
        <div class="px-4 pt-4 sm:px-5">
          <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-hourglass" /> Pagos pendientes</h2>
          <p class="mt-1 text-sm text-muted">Pagos manuales declarados por los compradores. Recién al aprobarlos se concede el acceso; declarar un pago no concede nada.</p>
        </div>
        <ul class="divide-y divide-default px-4 sm:px-5">
          <li v-for="p in pendingData?.pending || []" :key="p.id" class="flex flex-wrap items-center gap-3 py-3">
            <div class="min-w-0 flex-1">
              <p class="font-medium">{{ p.productName }} <span class="text-muted">· {{ fmtAmount(p.amountCents, p.paymentCurrency) }}</span></p>
              <p class="text-sm text-muted">
                {{ p.buyerName }} ({{ p.buyerEmail }}) · {{ kindLabel(p.kind) }} · {{ p.methodTitle || 'Método manual' }} · {{ fmtDateTime(p.createdAt) }}
                <span v-if="p.reference" class="block">Referencia del comprador: «{{ p.reference }}»</span>
              </p>
            </div>
            <UButton size="sm" color="success" icon="i-lucide-check" label="Aprobar" :loading="deciding === p.id" @click="decide(p, 'approve')" />
            <UButton size="sm" color="error" variant="soft" icon="i-lucide-x" label="Rechazar" :loading="deciding === p.id" @click="decide(p, 'reject')" />
          </li>
          <li v-if="!pendingData?.pending.length" class="py-4 text-sm text-muted">No hay pagos manuales esperando revisión.</li>
        </ul>
      </UCard>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <h2 class="px-4 pt-4 font-bold sm:px-5">Órdenes</h2>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr class="border-b border-default text-xs uppercase text-muted">
                <th class="px-4 py-2 font-medium sm:px-5">Cliente</th>
                <th class="px-4 py-2 font-medium">Producto</th>
                <th class="px-4 py-2 font-medium">Tipo</th>
                <th class="px-4 py-2 font-medium">Precio</th>
                <th class="px-4 py-2 font-medium">Pasarela</th>
                <th class="px-4 py-2 font-medium">Monto</th>
                <th class="px-4 py-2 font-medium">Próx. renovación</th>
                <th class="px-4 py-2 font-medium">Pago</th>
                <th class="px-4 py-2 font-medium">Suscripción</th>
                <th class="px-4 py-2 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="o in data.orders" :key="o.id">
                <td class="px-4 py-2.5 sm:px-5">
                  <p class="font-medium">{{ o.buyerName }}</p>
                  <p class="text-xs text-muted">{{ o.buyerEmail }}</p>
                </td>
                <td class="px-4 py-2.5">{{ o.productName }}</td>
                <td class="px-4 py-2.5">{{ kindLabel(o.kind) }}</td>
                <td class="px-4 py-2.5">{{ o.priceType === 'subscription' ? 'Suscripción' : 'Único' }}</td>
                <td class="px-4 py-2.5">{{ o.gateway === 'manual' ? 'Manual' : 'Stripe' }}</td>
                <td class="px-4 py-2.5 font-medium">{{ fmtAmount(o.amountCents, o.paymentCurrency) }}</td>
                <td class="px-4 py-2.5">{{ o.nextRenewal ? fmtDate(o.nextRenewal) : '—' }}</td>
                <td class="px-4 py-2.5"><UBadge :color="statusBadge(o.paymentStatus).color" variant="subtle">{{ statusBadge(o.paymentStatus).label }}</UBadge></td>
                <td class="px-4 py-2.5">{{ subLabel(o) }}</td>
                <td class="px-4 py-2.5 text-muted">{{ fmtDate(o.createdAt) }}</td>
              </tr>
              <tr v-if="!data.orders.length">
                <td colspan="10" class="px-4 py-6 text-center text-muted sm:px-5">Todavía no hay órdenes registradas.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
    </template>
  </div>
</template>
