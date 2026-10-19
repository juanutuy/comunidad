<script setup lang="ts">
// Resultado de la verificación pública (Fase 16), sin sesión:
// válido → nombre del miembro, curso, comunidad y fecha de
// finalización; código inexistente → el mensaje de no encontrado.
// No se expone ningún dato más (sin correos ni perfiles).
definePageMeta({ layout: 'auth' })
const route = useRoute()
const code = computed(() => String(route.params.code || '').toUpperCase())
const api = useApi()
const { t } = useI18n()
const { fmtDate } = useFormat()

interface VerifyResult {
  valid: boolean, code: string, memberName: string, courseTitle: string
  communityName: string, finishedAt: string, issuedAt: string
}
const { data, error } = await useAsyncData(() => `verify-${code.value}`, () =>
  api<VerifyResult>(`/api/verify/${encodeURIComponent(code.value)}`).catch(() => null), { watch: [code] })
const notFound = computed(() => !!error.value || data.value === null)
</script>

<template>
  <UCard>
    <div class="space-y-4 text-center">
      <template v-if="data">
        <UIcon name="i-lucide-badge-check" class="mx-auto text-5xl text-green-500" />
        <div>
          <h1 class="text-xl font-bold">{{ t('verify.validTitle') }}</h1>
          <p class="mt-1 text-sm text-muted">{{ t('verify.validText') }}</p>
        </div>
        <dl class="space-y-2 rounded-lg bg-elevated p-4 text-left text-sm">
          <div class="flex gap-2"><dt class="w-28 shrink-0 text-muted">{{ t('verify.memberLabel') }}</dt><dd class="font-semibold">{{ data.memberName }}</dd></div>
          <div class="flex gap-2"><dt class="w-28 shrink-0 text-muted">{{ t('verify.courseLabel') }}</dt><dd class="font-medium">{{ data.courseTitle }}</dd></div>
          <div class="flex gap-2"><dt class="w-28 shrink-0 text-muted">{{ t('verify.communityLabel') }}</dt><dd>{{ data.communityName }}</dd></div>
          <div class="flex gap-2"><dt class="w-28 shrink-0 text-muted">{{ t('verify.finishedLabel') }}</dt><dd>{{ data.finishedAt ? fmtDate(data.finishedAt) : '—' }}</dd></div>
          <div class="flex gap-2"><dt class="w-28 shrink-0 text-muted">{{ t('verify.codeLabel') }}</dt><dd class="font-mono">{{ data.code }}</dd></div>
        </dl>
      </template>
      <template v-else-if="notFound">
        <UIcon name="i-lucide-search-x" class="mx-auto text-5xl text-muted" />
        <div>
          <h1 class="text-xl font-bold">{{ t('verify.notFoundTitle') }}</h1>
          <p class="mt-1 text-sm text-muted">{{ t('verify.notFoundTextBefore') }}<span class="font-mono font-medium">{{ code }}</span>{{ t('verify.notFoundTextAfter') }}</p>
        </div>
      </template>
      <UButton to="/verify" :label="t('verify.verifyAnother')" color="neutral" variant="soft" icon="i-lucide-search" block />
    </div>
  </UCard>
</template>
