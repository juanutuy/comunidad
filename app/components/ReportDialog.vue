<script setup lang="ts">
// Diálogo «Reportar» (Fase 12): categoría obligatoria y nota
// opcional. El servidor valida que el contenido no sea propio y que
// no exista ya un reporte pendiente de la misma persona; si ya
// existía, la respuesta lo dice y acá se muestra como aviso amable.
const { open, target, closeReport } = useReportDialog()
const api = useApi()
const toast = useToast()

const reasons = [
  { value: 'spam', label: 'Spam o publicidad no deseada' },
  { value: 'acoso', label: 'Acoso o conducta ofensiva' },
  { value: 'inapropiado', label: 'Contenido inapropiado' },
  { value: 'otro', label: 'Otro motivo' },
]
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
      toast.add({ title: 'Ya reportaste este contenido', description: 'Tu reporte anterior sigue en la cola de moderación.', color: 'warning' })
    else
      toast.add({ title: 'Reporte enviado', description: 'Un administrador lo va a revisar. Gracias por cuidar la comunidad.', color: 'success' })
    closeReport()
  }
  catch (e) {
    toast.add({ title: 'No se pudo enviar el reporte', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { sending.value = false }
}
</script>

<template>
  <UModal v-model:open="open" title="Reportar contenido" description="Contanos qué pasa con este contenido. Un administrador lo revisa desde la consola de moderación.">
    <template #body>
      <div class="space-y-4">
        <p v-if="target" class="truncate rounded-lg bg-elevated px-3 py-2 text-sm text-muted">
          {{ target.type === 'post' ? 'Publicación' : 'Comentario' }}: «{{ target.label }}»
        </p>
        <UFormField label="Motivo">
          <URadioGroup v-model="reason" :items="reasons" />
        </UFormField>
        <UFormField label="Nota (opcional)" description="Cualquier detalle que ayude al administrador.">
          <UTextarea v-model="note" :rows="3" :maxlength="500" class="w-full" placeholder="Ej.: es publicidad repetida en varios canales…" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" label="Cancelar" @click="closeReport" />
        <UButton color="error" variant="soft" label="Enviar reporte" icon="i-lucide-flag" :loading="sending" @click="submit" />
      </div>
    </template>
  </UModal>
</template>
