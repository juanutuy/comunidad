<script setup lang="ts">
// Verificación pública de certificados (Fase 16): cualquiera con el
// código impreso en un certificado puede comprobar su validez, sin
// iniciar sesión. Solo se muestran los datos que el certificado ya
// trae impresos (nombre, curso, comunidad, fecha) — sin correos.
definePageMeta({ layout: 'auth' })
const { t } = useI18n()
const code = ref('')
const router = useRouter()
function submit() {
  const clean = code.value.trim().toUpperCase()
  if (clean) router.push(`/verify/${encodeURIComponent(clean)}`)
}
</script>

<template>
  <UCard>
    <div class="space-y-4 text-center">
      <UIcon name="i-lucide-award" class="mx-auto text-5xl text-primary" />
      <div>
        <h1 class="text-xl font-bold">{{ t('verify.title') }}</h1>
        <p class="mt-1 text-sm text-muted">{{ t('verify.text') }}</p>
      </div>
      <form class="space-y-3" @submit.prevent="submit">
        <UInput v-model="code" placeholder="CERT-XXXXX-XXXXX" class="w-full" size="lg" :ui="{ base: 'text-center font-mono uppercase' }" />
        <UButton type="submit" :label="t('verify.button')" icon="i-lucide-search-check" block size="lg" :disabled="!code.trim()" />
      </form>
    </div>
  </UCard>
</template>
