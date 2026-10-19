<script setup lang="ts">
// Resultado de la verificación pública (Fase 16), sin sesión:
// válido → nombre del miembro, curso, comunidad y fecha de
// finalización; código inexistente → el mensaje de no encontrado.
// No se expone ningún dato más (sin correos ni perfiles).
definePageMeta({ layout: 'auth' })
const route = useRoute()
const code = computed(() => String(route.params.code || '').toUpperCase())
const api = useApi()
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
          <h1 class="text-xl font-bold">Certificado válido</h1>
          <p class="mt-1 text-sm text-muted">Este código corresponde a un certificado emitido.</p>
        </div>
        <dl class="space-y-2 rounded-lg bg-elevated p-4 text-left text-sm">
          <div class="flex gap-2"><dt class="w-28 shrink-0 text-muted">Miembro</dt><dd class="font-semibold">{{ data.memberName }}</dd></div>
          <div class="flex gap-2"><dt class="w-28 shrink-0 text-muted">Curso</dt><dd class="font-medium">{{ data.courseTitle }}</dd></div>
          <div class="flex gap-2"><dt class="w-28 shrink-0 text-muted">Comunidad</dt><dd>{{ data.communityName }}</dd></div>
          <div class="flex gap-2"><dt class="w-28 shrink-0 text-muted">Finalizado</dt><dd>{{ data.finishedAt ? fmtDate(data.finishedAt) : '—' }}</dd></div>
          <div class="flex gap-2"><dt class="w-28 shrink-0 text-muted">Código</dt><dd class="font-mono">{{ data.code }}</dd></div>
        </dl>
      </template>
      <template v-else-if="notFound">
        <UIcon name="i-lucide-search-x" class="mx-auto text-5xl text-muted" />
        <div>
          <h1 class="text-xl font-bold">Certificado no encontrado</h1>
          <p class="mt-1 text-sm text-muted">No encontramos un certificado con el código <span class="font-mono font-medium">{{ code }}</span>. Revisá que esté completo y bien escrito.</p>
        </div>
      </template>
      <UButton to="/verify" label="Verificar otro código" color="neutral" variant="soft" icon="i-lucide-search" block />
    </div>
  </UCard>
</template>
