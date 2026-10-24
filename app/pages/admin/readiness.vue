<script setup lang="ts">
definePageMeta({ layout: 'admin' })
const { locale } = useI18n()
const en = computed(() => locale.value === 'en')
const api = useApi()
const { data } = await useAsyncData('admin-readiness', () => api<{ email: boolean, stripe: boolean, digest: boolean, branding: boolean, domains: string[], platform: { domain: string, enabled: boolean } }>('/api/admin/readiness'))
const rows = computed(() => [
  { label: en.value ? 'Brand assets' : 'Recursos de marca', ready: data.value?.branding, to: '/admin/settings', description: en.value ? 'Community icon and logo.' : 'Icono y logo de la comunidad.' },
  { label: en.value ? 'Email provider' : 'Proveedor de correo', ready: data.value?.email, to: '/admin/emails', description: en.value ? 'Provider, credentials and sender configured.' : 'Proveedor, credenciales y remitente configurados.' },
  { label: 'Stripe', ready: data.value?.stripe, to: '/admin/settings?tab=pagos', description: en.value ? 'Secret, public key and webhook secret configured.' : 'Claves privada, pública y secreto de webhook configurados.' },
  { label: en.value ? 'Scheduled digest' : 'Resumen programado', ready: data.value?.digest, to: '/admin/emails', description: en.value ? 'Scheduling secret configured; scheduler delivery is managed separately.' : 'Secreto configurado; la ejecución del programador se gestiona aparte.' },
  { label: en.value ? 'Community creation' : 'Creación de comunidades', ready: data.value?.platform.enabled, to: '/communities/new', description: data.value?.platform.domain ? `nombre.${data.value.platform.domain}` : '' },
])
</script>

<template>
  <div class="max-w-4xl space-y-6">
    <div><h1 class="text-2xl font-bold">{{ en ? 'Service configuration' : 'Configuración de servicios' }}</h1>
      <p class="mt-2 text-muted">{{ en ? 'Configuration status. These checks do not confirm DNS, delivery or live payments.' : 'Estado de configuración. Estas comprobaciones no confirman DNS, entregas ni pagos reales.' }}</p></div>
    <UCard v-for="row in rows" :key="row.label">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div><h2 class="font-semibold">{{ row.label }}</h2><p class="mt-1 text-sm text-muted">{{ row.description }}</p></div>
        <div class="flex items-center gap-3"><UBadge :color="row.ready ? 'success' : 'warning'" variant="subtle">{{ row.ready ? (en ? 'Configured' : 'Configurado') : (en ? 'Pending' : 'Pendiente') }}</UBadge>
          <UButton :to="row.to" color="neutral" variant="ghost" icon="i-lucide-arrow-up-right" :aria-label="row.label" /></div>
      </div>
    </UCard>
    <UCard><h2 class="font-semibold">{{ en ? 'Registered domains' : 'Dominios registrados' }}</h2>
      <ul class="mt-3 space-y-2"><li v-for="domain in data?.domains || []" :key="domain">{{ domain }}</li></ul>
      <p class="mt-3 text-sm text-muted">{{ en ? 'Domain registration does not activate DNS or certificates.' : 'Registrar un dominio no activa DNS ni certificados.' }}</p>
      <UButton class="mt-4" to="/admin/domains" variant="soft">{{ en ? 'Manage domains' : 'Gestionar dominios' }}</UButton>
    </UCard>
  </div>
</template>
