<script setup lang="ts">
// Invitaciones (solo admin, Fase 14): dos vías para que entre gente
// sin pasar por la aprobación previa — la invitación ES la
// aprobación.
//   - Por correo: personal, de un solo uso, solo sirve para ese
//     correo. El envío pasa por la capa de correos: SIN proveedor
//     configurado queda EN OSCURO (registrado como no enviado) y la
//     página lo dice con franqueza, ofreciendo copiar el enlace.
//   - Por enlace: reutilizable, con vencimiento opcional y contador
//     de usos; se puede revocar en cualquier momento.
definePageMeta({ layout: 'admin' })
const { user, tenant } = useAuth()
const api = useApi()
const toast = useToast()
const { fmtDate, fmtDateTime } = useFormat()

interface InvRow {
  id: number, kind: string, email: string, status: string, uses: number
  expiresAt: string, createdAt: string, createdByName: string, acceptedByName: string, url: string
}
interface InvData { emailEnabled: boolean, invitations: InvRow[] }
const { data, refresh } = await useAsyncData('admin-invitations', () =>
  user.value?.role === 'admin' ? api<InvData>('/api/admin/invitations') : Promise.resolve(null))

const statusMeta: Record<string, { label: string, color: 'success' | 'warning' | 'error' | 'neutral' }> = {
  pending: { label: 'Pendiente', color: 'warning' },
  accepted: { label: 'Aceptada', color: 'success' },
  expired: { label: 'Vencida', color: 'neutral' },
  revoked: { label: 'Revocada', color: 'error' },
}

const emailForm = reactive({ email: '', expiresDays: 7 })
const linkForm = reactive({ expiresDays: 0 })
const creating = ref('')
const lastCreated = ref<{ kind: string, url: string, emailStatus: string | null } | null>(null)

async function createInvite(kind: 'email' | 'link') {
  creating.value = kind
  try {
    const res = await api<{ invitation: { url: string }, emailStatus: string | null }>('/api/admin/invitations', {
      method: 'POST',
      body: kind === 'email'
        ? { kind, email: emailForm.email, expiresDays: emailForm.expiresDays }
        : { kind, expiresDays: linkForm.expiresDays },
    })
    lastCreated.value = { kind, url: res.invitation.url, emailStatus: res.emailStatus }
    if (kind === 'email') emailForm.email = ''
    toast.add({ title: kind === 'email' ? 'Invitación creada' : 'Enlace de invitación creado', color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo crear la invitación', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { creating.value = '' }
}

async function revoke(inv: InvRow) {
  try {
    await api(`/api/admin/invitations/${inv.id}/revoke`, { method: 'POST' })
    toast.add({ title: 'Invitación revocada', description: 'El enlace dejó de servir.', color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo revocar', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: 'Enlace copiado', color: 'success' })
  }
  catch { toast.add({ title: 'No se pudo copiar', description: 'Copialo manualmente del campo.', color: 'error' }) }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Miembros</h1>
      <p class="text-muted">Invitaciones de ingreso a {{ tenant?.name }}.</p>
    </div>
    <UAlert v-if="user && user.role !== 'admin'" color="warning" variant="soft" title="Solo administradores" description="Las invitaciones las gestiona un administrador." />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <template v-else>
      <MembersSubNav />

      <UAlert
        v-if="data && !data.emailEnabled" color="warning" variant="soft" icon="i-lucide-mail-warning"
        title="Los correos están en oscuro"
        description="No hay un proveedor de correo configurado: las invitaciones por correo se crean y quedan registradas como NO enviadas. Compartí el enlace manualmente (botón de copiar en cada invitación) hasta configurar el proveedor en la sección Correos."
      />

      <div class="grid gap-5 lg:grid-cols-2">
        <UCard>
          <template #header>
            <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-mail-plus" /> Invitar por correo</h2>
          </template>
          <p class="mb-4 text-sm text-muted">Invitación personal de un solo uso: solo sirve para ese correo y vence cuando se usa o caduca.</p>
          <form class="space-y-3" @submit.prevent="createInvite('email')">
            <UFormField label="Correo de la persona">
              <UInput v-model="emailForm.email" type="email" required placeholder="persona@correo.com" class="w-full" />
            </UFormField>
            <UFormField label="Vence en (días)" hint="0 = no vence">
              <UInput v-model.number="emailForm.expiresDays" type="number" min="0" max="365" class="w-28" />
            </UFormField>
            <UButton type="submit" label="Crear invitación" icon="i-lucide-send" :loading="creating === 'email'" :disabled="!emailForm.email.trim()" />
          </form>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-link" /> Enlace de invitación</h2>
          </template>
          <p class="mb-4 text-sm text-muted">Un enlace reutilizable para compartir donde quieras (un grupo, una red social). Quien entra con él nace aprobado; podés revocarlo cuando quieras.</p>
          <form class="space-y-3" @submit.prevent="createInvite('link')">
            <UFormField label="Vence en (días)" hint="0 = no vence">
              <UInput v-model.number="linkForm.expiresDays" type="number" min="0" max="365" class="w-28" />
            </UFormField>
            <UButton type="submit" label="Crear enlace" icon="i-lucide-link" :loading="creating === 'link'" />
          </form>
        </UCard>
      </div>

      <UAlert v-if="lastCreated" color="success" variant="soft" icon="i-lucide-check-circle-2" :title="lastCreated.kind === 'email' ? 'Invitación creada' : 'Enlace creado'">
        <template #description>
          <span class="flex flex-wrap items-center gap-2">
            <span v-if="lastCreated.emailStatus && lastCreated.emailStatus !== 'sent'">El correo quedó <strong>sin enviar</strong> (no hay proveedor). Compartí este enlace:</span>
            <span v-else>Compartí este enlace:</span>
            <code class="rounded bg-elevated px-2 py-0.5 font-mono text-xs break-all">{{ lastCreated.url }}</code>
            <UButton size="xs" variant="soft" icon="i-lucide-copy" label="Copiar" @click="copyText(lastCreated.url)" />
          </span>
        </template>
      </UAlert>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-inbox" /> Invitaciones creadas</h2>
        </template>
        <ul class="divide-y divide-default">
          <li v-for="inv in data?.invitations || []" :key="inv.id" class="flex flex-wrap items-center gap-3 px-4 py-3">
            <UIcon :name="inv.kind === 'email' ? 'i-lucide-mail' : 'i-lucide-link'" class="shrink-0 text-muted" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">
                {{ inv.kind === 'email' ? inv.email : 'Enlace reutilizable' }}
                <span v-if="inv.kind === 'link'" class="text-muted">· {{ inv.uses }} uso{{ inv.uses === 1 ? '' : 's' }}</span>
              </p>
              <p class="truncate text-xs text-muted">
                Creada por {{ inv.createdByName }} el {{ fmtDate(inv.createdAt) }}
                <template v-if="inv.expiresAt"> · vence el {{ fmtDate(inv.expiresAt) }}</template>
                <template v-if="inv.acceptedByName"> · aceptada por {{ inv.acceptedByName }}</template>
              </p>
            </div>
            <UBadge :color="statusMeta[inv.status]?.color || 'neutral'" variant="subtle" size="sm">{{ statusMeta[inv.status]?.label || inv.status }}</UBadge>
            <UButton v-if="inv.status === 'pending'" size="sm" color="neutral" variant="ghost" icon="i-lucide-copy" title="Copiar el enlace" @click="copyText(inv.url)" />
            <UButton v-if="inv.status === 'pending'" size="sm" color="error" variant="ghost" icon="i-lucide-ban" label="Revocar" @click="revoke(inv)" />
          </li>
          <li v-if="!(data?.invitations || []).length" class="px-4 py-8 text-center text-sm text-muted">
            Todavía no hay invitaciones. Creá la primera con los formularios de arriba.
          </li>
        </ul>
      </UCard>
      <p class="text-xs text-muted">Las fechas y horas se muestran en tu zona horaria. Última actualización al abrir la página: {{ fmtDateTime(new Date().toISOString()) }}.</p>
    </template>
  </div>
</template>
