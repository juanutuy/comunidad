<script setup lang="ts">
// Registro de correos (solo admin, Fase 4): transparencia de la capa
// de correo. 'skipped_no_provider' = el correo se generó pero NO se
// envió porque el servidor no tiene proveedor configurado.
const { user, tenant } = useAuth()
const api = useApi()

interface EmailRow { id: number, to: string, kind: string, subject: string, status: string, detail: string, createdAt: string }
const { data } = await useAsyncData('admin-emails', () =>
  user.value?.role === 'admin' ? api<{ emails: EmailRow[], providerConfigured: boolean }>('/api/admin/emails') : Promise.resolve(null))
const { fmtDate } = useFormat()
const kindLabel = (k: string) => k === 'welcome' ? 'Bienvenida' : k === 'digest' ? 'Resumen semanal' : 'Aviso'
const statusColor = (s: string) => s === 'sent' ? 'success' : s === 'failed' ? 'error' : 'warning'
const statusLabel = (s: string) => s === 'sent' ? 'Enviado' : s === 'failed' ? 'Falló' : 'No enviado (sin proveedor)'
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Correos de la comunidad</h1>
      <p class="text-muted">Registro real de los correos de {{ tenant?.name }}: bienvenidas y resúmenes semanales.</p>
    </div>
    <UAlert v-if="user && user.role !== 'admin'" color="warning" variant="soft" title="Solo administradores" />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <template v-else>
      <AdminNav />
      <UAlert v-if="!data?.providerConfigured" color="warning" variant="soft" icon="i-lucide-mail-warning" title="Proveedor de correo no configurado" description="La capa de correo está completa, pero el servidor no tiene un proveedor configurado (variable NUXT_EMAIL_PROVIDER_URL). Los correos se generan y quedan registrados aquí como «No enviado (sin proveedor)»; nadie finge envíos que no ocurrieron. El resumen semanal se dispara por cron contra /api/cron/digest con el secreto NUXT_CRON_SECRET." />
      <UAlert v-else color="success" variant="soft" icon="i-lucide-mail-check" title="Proveedor de correo activo" description="Los correos se están despachando por el proveedor configurado en el servidor." />
      <UCard>
        <ul class="divide-y divide-default">
          <li v-for="e in data?.emails || []" :key="e.id" class="flex flex-wrap items-center gap-3 py-2.5 text-sm">
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ e.subject }}</p>
              <p class="text-muted">Para {{ e.to }} · {{ kindLabel(e.kind) }} · {{ fmtDate(e.createdAt) }}</p>
            </div>
            <UBadge :color="statusColor(e.status)" variant="subtle">{{ statusLabel(e.status) }}</UBadge>
          </li>
          <li v-if="!data?.emails.length" class="py-3 text-sm text-muted">Todavía no hay correos registrados.</li>
        </ul>
      </UCard>
    </template>
  </div>
</template>
