<script setup lang="ts">
// Certificado de finalización (Fase 2): solo con el 100% del curso.
// Diseño simple listo para imprimir: al imprimir se oculta el resto de
// la página (ver el bloque <style> al final).
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const api = useApi()
const { fmtDate } = useFormat()

interface CertData {
  eligible: boolean
  progress: { completed: number, total: number, pct: number }
  certificate: { memberName: string, courseTitle: string, communityName: string, finishedAt: string | null } | null
}
const { data } = await useAsyncData(() => `certificate-${slug.value}`, () => api<CertData>(`/api/courses/${slug.value}/certificate`), { watch: [slug] })

function printCert() {
  window.print()
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center gap-2 print:hidden">
      <UButton :to="`/courses/${slug}`" color="neutral" variant="ghost" icon="i-lucide-arrow-left" label="Volver al curso" class="-ml-2" />
      <span class="flex-1" />
      <UButton v-if="data?.eligible" label="Imprimir certificado" icon="i-lucide-printer" @click="printCert" />
    </div>

    <UAlert
      v-if="data && !data.eligible"
      color="warning" variant="soft" icon="i-lucide-lock"
      title="Todavía no completaste el curso"
      :description="`Tu avance es ${data.progress.completed}/${data.progress.total} lecciones (${data.progress.pct}%). El certificado se habilita al llegar al 100%.`"
    />

    <div v-if="data?.certificate" id="certificate" class="mx-auto max-w-3xl rounded-xl border-4 border-double border-primary bg-white p-10 text-center text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-50">
      <UIcon name="i-lucide-award" class="mx-auto text-5xl text-primary" />
      <p class="mt-4 text-sm font-bold tracking-[0.3em] uppercase">Certificado de finalización</p>
      <p class="mt-6 text-muted">Se otorga a</p>
      <p class="mt-1 font-serif text-4xl font-bold">{{ data.certificate.memberName }}</p>
      <p class="mt-6 text-muted">por haber completado el curso</p>
      <p class="mt-1 text-2xl font-bold">{{ data.certificate.courseTitle }}</p>
      <p class="mt-8 text-sm text-muted">
        {{ data.certificate.communityName }} · {{ data.certificate.finishedAt ? fmtDate(data.certificate.finishedAt) : '' }}
      </p>
    </div>
  </div>
</template>

<style>
@media print {
  body * { visibility: hidden; }
  #certificate, #certificate * { visibility: visible; }
  #certificate { position: absolute; inset: 0; margin: 0; box-shadow: none; }
}
</style>
