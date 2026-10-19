<script setup lang="ts">
// Solicitudes de ingreso (solo admin, Fase 14): la cola de personas
// que se registraron con la aprobación previa encendida, con las
// respuestas que dieron a las preguntas de ingreso. Aprobar = acceso
// inmediato (con auto-ingreso a canales); rechazar = la cuenta queda
// «declined» y puede volver a solicitar tras el tiempo de espera
// configurado en Ajustes → Ingreso de miembros.
definePageMeta({ layout: 'admin' })
const { user, tenant } = useAuth()
const membersMenuItems = useMembersMenuItems()
const api = useApi()
const toast = useToast()
const { fmtDate, fmtDateTime, initials } = useFormat()

interface ReqRow {
  id: number, status: string, createdAt: string, decidedAt: string, decidedByName: string
  answers: string[]
  user: { id: number, name: string, slug: string, email: string, avatarUrl: string, createdAt: string }
}
interface ReqData { questions: string[], approval: boolean, pending: number, requests: ReqRow[] }
const { data, refresh } = await useAsyncData('admin-member-requests', () =>
  user.value?.role === 'admin' ? api<ReqData>('/api/admin/members/requests') : Promise.resolve(null))

const pendingReqs = computed(() => (data.value?.requests || []).filter(r => r.status === 'pending'))
const decidedReqs = computed(() => (data.value?.requests || []).filter(r => r.status !== 'pending'))

const busy = ref(0)
async function decide(r: ReqRow, action: 'approve' | 'decline') {
  busy.value = r.id
  try {
    await api(`/api/admin/members/requests/${r.id}/${action}`, { method: 'POST' })
    toast.add({
      title: action === 'approve' ? `${r.user.name} ya es miembro` : `Solicitud de ${r.user.name} rechazada`,
      color: 'success',
    })
    await refresh()
    await refreshNuxtData('admin-stats')
  }
  catch (e) {
    toast.add({ title: 'No se pudo resolver la solicitud', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { busy.value = 0 }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Miembros</h1>
      <p class="text-muted">Solicitudes de ingreso a {{ tenant?.name }} y su historial.</p>
    </div>
    <UAlert v-if="user && user.role !== 'admin'" color="warning" variant="soft" title="Solo administradores" description="Las solicitudes de ingreso las resuelve un administrador." />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <template v-else>
      <div class="flex flex-col gap-5 lg:flex-row lg:items-start">
      <AdminSubMenu :items="membersMenuItems" />
      <div class="min-w-0 flex-1 space-y-5">
      <UAlert
        v-if="data && !data.approval" color="neutral" variant="soft" icon="i-lucide-info"
        title="La aprobación previa está apagada"
        description="Quien se registra entra de inmediato, así que acá no llegan solicitudes nuevas. Se activa en Ajustes de la comunidad → Ingreso de miembros. El historial de solicitudes anteriores queda abajo."
      />

      <UCard>
        <template #header>
          <h2 class="flex items-center gap-2 font-bold">
            <UIcon name="i-lucide-hourglass" /> Esperando tu decisión
            <UBadge v-if="pendingReqs.length" color="warning" variant="subtle">{{ pendingReqs.length }}</UBadge>
          </h2>
        </template>
        <ul v-if="pendingReqs.length" class="divide-y divide-default">
          <li v-for="r in pendingReqs" :key="r.id" class="py-4 first:pt-0 last:pb-0">
            <div class="flex flex-wrap items-start gap-3">
              <UAvatar :src="r.user.avatarUrl || undefined" :text="initials(r.user.name)" size="lg" />
              <div class="min-w-0 flex-1">
                <p class="font-semibold">{{ r.user.name }}</p>
                <p class="text-xs text-muted">{{ r.user.email }} · solicitó el {{ fmtDateTime(r.createdAt) }}</p>
                <dl v-if="data?.questions.length" class="mt-3 space-y-2">
                  <div v-for="(q, i) in data.questions" :key="i" class="rounded-lg bg-elevated px-3 py-2">
                    <dt class="text-xs font-semibold text-muted">{{ q }}</dt>
                    <dd class="mt-0.5 text-sm whitespace-pre-wrap">{{ r.answers[i] || '— (sin respuesta)' }}</dd>
                  </div>
                </dl>
              </div>
              <div class="flex shrink-0 gap-2">
                <UButton color="error" variant="soft" size="sm" icon="i-lucide-x" label="Rechazar" :loading="busy === r.id" @click="decide(r, 'decline')" />
                <UButton size="sm" icon="i-lucide-check" label="Aprobar ingreso" :loading="busy === r.id" @click="decide(r, 'approve')" />
              </div>
            </div>
          </li>
        </ul>
        <p v-else class="py-4 text-center text-sm text-muted">Nadie está esperando. Las solicitudes nuevas aparecen acá apenas alguien se registra.</p>
      </UCard>

      <UCard v-if="decidedReqs.length">
        <template #header>
          <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-history" /> Historial reciente</h2>
        </template>
        <ul class="divide-y divide-default">
          <li v-for="r in decidedReqs" :key="r.id" class="flex flex-wrap items-center gap-3 py-2.5">
            <UAvatar :src="r.user.avatarUrl || undefined" :text="initials(r.user.name)" size="sm" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">{{ r.user.name }}</span>
              <span class="block text-xs text-muted">{{ r.user.email }} · {{ fmtDate(r.createdAt) }}</span>
            </span>
            <UBadge :color="r.status === 'approved' ? 'success' : 'error'" variant="subtle" size="sm">
              {{ r.status === 'approved' ? 'Aprobada' : 'Rechazada' }}
            </UBadge>
            <span class="text-xs text-muted">{{ r.decidedByName }} · {{ fmtDate(r.decidedAt) }}</span>
          </li>
        </ul>
      </UCard>
      </div>
      </div>
    </template>
  </div>
</template>
