<script setup lang="ts">
// Certificado de finalización (Fase 2): solo con el 100% del curso.
// Fase 16: el certificado se EMITE con un diseño (blueprint del curso
// o el diseño por defecto del sistema) y un código único: lo que se
// ve acá es la foto del diseño al emitirse — editar el diseño
// después no cambia este certificado — y cualquiera puede
// verificarlo en /verify con el código. Diseño listo para imprimir:
// al imprimir se oculta el resto de la página (ver <style>).
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const api = useApi()
const { fmtDate } = useFormat()

interface CertDesign {
  blueprintId: number | null, blueprintName: string, accentColor: string, headingText: string
  bodyText: string, signerName: string, signerTitle: string, showLogo: boolean
}
interface CertData {
  eligible: boolean
  certificateEnabled: boolean
  progress: { completed: number, total: number, pct: number }
  certificate: {
    memberName: string, courseTitle: string, communityName: string, finishedAt: string | null
    code: string, issuedAt: string, design: CertDesign, logoUrl: string
  } | null
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
      v-if="data && !data.certificateEnabled"
      color="neutral" variant="soft" icon="i-lucide-award"
      title="Este curso no emite certificado"
      description="La comunidad no habilitó el certificado de finalización para este curso."
    />
    <UAlert
      v-else-if="data && !data.eligible"
      color="warning" variant="soft" icon="i-lucide-lock"
      title="Todavía no completaste el curso"
      :description="`Tu avance es ${data.progress.completed}/${data.progress.total} lecciones (${data.progress.pct}%). El certificado se habilita al llegar al 100%.`"
    />

    <div
      v-if="data?.certificate" id="certificate"
      class="mx-auto max-w-3xl rounded-xl border-4 border-double bg-white p-10 text-center text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-50"
      :style="{ borderColor: data.certificate.design.accentColor }"
    >
      <img v-if="data.certificate.design.showLogo && data.certificate.logoUrl" :src="data.certificate.logoUrl" alt="" class="mx-auto h-14 w-auto object-contain">
      <UIcon name="i-lucide-award" class="mx-auto text-5xl" :style="{ color: data.certificate.design.accentColor, marginTop: data.certificate.design.showLogo && data.certificate.logoUrl ? '1rem' : undefined }" />
      <p class="mt-4 text-sm font-bold tracking-[0.3em] uppercase" :style="{ color: data.certificate.design.accentColor }">{{ data.certificate.design.headingText }}</p>
      <p class="mt-6 text-muted">Se otorga a</p>
      <p class="mt-1 font-serif text-4xl font-bold">{{ data.certificate.memberName }}</p>
      <p class="mx-auto mt-6 max-w-xl leading-relaxed">{{ data.certificate.design.bodyText }}</p>
      <div v-if="data.certificate.design.signerName" class="mx-auto mt-10 max-w-56">
        <div class="border-t border-neutral-400 pt-2">
          <p class="font-semibold">{{ data.certificate.design.signerName }}</p>
          <p v-if="data.certificate.design.signerTitle" class="text-sm text-muted">{{ data.certificate.design.signerTitle }}</p>
        </div>
      </div>
      <p class="mt-8 text-sm text-muted">
        {{ data.certificate.communityName }} · {{ data.certificate.finishedAt ? fmtDate(data.certificate.finishedAt) : '' }}
      </p>
      <p class="mt-3 text-xs text-muted">
        Código de verificación: <span class="font-mono font-semibold text-default">{{ data.certificate.code }}</span>
        · Verificalo en <span class="font-medium text-default">/verify</span>
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
