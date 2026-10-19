<script setup lang="ts">
// Diálogo «Reportar» (Fase 12): categoría obligatoria y nota
// opcional. El servidor valida que el contenido no sea propio y que
// no exista ya un reporte pendiente de la misma persona; si ya
// existía, la respuesta lo dice y acá se muestra como aviso amable.
const { open, target, closeReport } = useReportDialog()
const { t } = useI18n()
const api = useApi()
const toast = useToast()

const reasons = computed(() => [
  { value: 'spam', label: t('report.reasonSpam') },
  { value: 'acoso', label: t('report.reasonHarassment') },
  { value: 'inapropiado', label: t('report.reasonInappropriate') },
  { value: 'otro', label: t('report.reasonOther') },
])
const reason = ref('spam')
const note = ref('')
const sending = ref(false)

watch(open, (v) => {
  if (v) { reason.value = 'spam'; note.value = '' }
})

async function submit() {
  if (!target.value || sending.value) return
  sending.value = true
  try {
    const res = await api<{ ok: boolean, alreadyReported?: boolean }>('/api/reports', {
      method: 'POST',
      body: { targetType: target.value.type, targetId: target.value.id, reason: reason.value, note: note.value },
    })
    if (res.alreadyReported)
      toast.add({ title: t('report.alreadyToast'), description: t('report.alreadyToastText'), color: 'warning' })
    else
      toast.add({ title: t('report.sentToast'), description: t('report.sentToastText'), color: 'success' })
    closeReport()
  }
  catch (e) {
    toast.add({ title: t('report.failedToast'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { sending.value = false }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('report.title')" :description="t('report.description')">
    <template #body>
      <div class="space-y-4">
        <p v-if="target" class="truncate rounded-lg bg-elevated px-3 py-2 text-sm text-muted">
          {{ target.type === 'post' ? t('report.postLabel') : t('report.commentLabel') }}: «{{ target.label }}»
        </p>
        <UFormField :label="t('report.reasonLabel')">
          <URadioGroup v-model="reason" :items="reasons" />
        </UFormField>
        <UFormField :label="t('report.noteLabel')" :description="t('report.noteHelp')">
          <UTextarea v-model="note" :rows="3" :maxlength="500" class="w-full" :placeholder="t('report.notePlaceholder')" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="closeReport" />
        <UButton color="error" variant="soft" :label="t('report.submit')" icon="i-lucide-flag" :loading="sending" @click="submit" />
      </div>
    </template>
  </UModal>
</template>
