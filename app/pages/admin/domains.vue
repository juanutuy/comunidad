<script setup lang="ts">
// Dominios personalizados (solo admin, Fase 4): la app resuelve el
// tenant por el host exacto. La activación del dominio en Cloudflare
// for Platforms es un paso de cuenta aparte y esta página lo dice.
definePageMeta({ layout: 'admin' })
const { user, tenant } = useAuth()
const api = useApi()
const toast = useToast()

interface Domain { id: number, domain: string, createdAt: string }
const { data, refresh } = await useAsyncData('admin-domains', () =>
  user.value?.role === 'admin' ? api<{ domains: Domain[] }>('/api/admin/domains') : Promise.resolve(null))

const newDomain = ref('')
const adding = ref(false)
async function add() {
  adding.value = true
  try {
    await api('/api/admin/domains', { method: 'POST', body: { domain: newDomain.value } })
    toast.add({ title: 'Dominio agregado', color: 'success' })
    newDomain.value = ''
    await refresh()
  }
  catch (e) { toast.add({ title: 'No se pudo agregar', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' }) }
  finally { adding.value = false }
}
async function remove(d: Domain) {
  if (!confirm(`¿Quitar el dominio ${d.domain}? La comunidad dejará de responder en esa dirección.`)) return
  await api(`/api/admin/domains/${d.id}`, { method: 'DELETE' })
  await refresh()
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Dominio personalizado</h1>
      <p class="text-muted">Tu comunidad también puede vivir en tu propio dominio, en vez del subdominio de la plataforma.</p>
    </div>
    <UAlert v-if="user && user.role !== 'admin'" color="warning" variant="soft" title="Solo administradores" />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <template v-else>
      <UAlert color="neutral" variant="soft" icon="i-lucide-info" title="Cómo funciona" description="Al agregar un dominio aquí, la plataforma empieza a reconocerlo como la dirección de ESTA comunidad. Para que el tráfico llegue, además tenés que apuntar el DNS y activar el dominio en la cuenta de la plataforma (Cloudflare for Platforms): ese paso lo hace la administración de la plataforma, no se completa solo desde esta pantalla." />
      <UCard>
        <h2 class="mb-3 font-bold">Dominios de {{ tenant?.name }}</h2>
        <ul class="divide-y divide-default">
          <li v-for="d in data?.domains || []" :key="d.id" class="flex items-center gap-3 py-2.5">
            <UIcon name="i-lucide-globe" class="text-muted" />
            <span class="flex-1 font-medium">{{ d.domain }}</span>
            <UButton size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" aria-label="Quitar dominio" @click="remove(d)" />
          </li>
          <li v-if="!data?.domains.length" class="py-2.5 text-sm text-muted">Todavía no hay dominios personalizados.</li>
        </ul>
        <div class="mt-4 flex flex-wrap gap-2">
          <UInput v-model="newDomain" class="min-w-64 flex-1" placeholder="comunidad.tudominio.com" />
          <UButton label="Agregar dominio" icon="i-lucide-plus" :loading="adding" :disabled="!newDomain.trim()" @click="add" />
        </div>
      </UCard>
      <UCard>
        <h2 class="mb-2 font-bold">Pasos de DNS (en tu registrador)</h2>
        <ol class="list-decimal space-y-1.5 pl-5 text-sm text-muted">
          <li>Agregá el dominio en esta pantalla.</li>
          <li>En tu proveedor de DNS creá un registro <strong>CNAME</strong> del subdominio elegido (ej.: <code>comunidad</code>) apuntando al dominio de la plataforma que te indique la administración.</li>
          <li>Avisá a la administración de la plataforma para activar el dominio en Cloudflare for Platforms y emitir el certificado HTTPS.</li>
          <li>Cuando la activación se complete, tu comunidad responde directamente en tu dominio, con su nombre y su color.</li>
        </ol>
      </UCard>
    </template>
  </div>
</template>
