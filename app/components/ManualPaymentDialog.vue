<script setup lang="ts">
// Pago manual (Fase 17): el comprador elige uno de los métodos que
// configuró la administración, sigue las instrucciones (paga POR
// FUERA de la plataforma) y declara el pago. Declarar NO concede
// nada: la compra queda «en revisión» hasta que un admin la aprueba
// desde Ingresos. El diálogo lo comparten la página de planes, el
// canal pago y el curso pago.
const props = defineProps<{
  open: boolean
  kind: 'channel' | 'course' | 'plan'
  slug?: string
  planId?: number
  itemId?: number
  productName: string
  amountCents: number
}>()
const emit = defineEmits<{ 'update:open': [value: boolean], 'sent': [] }>()

const api = useApi()
const toast = useToast()
const { fmtMoney } = useFormat()

interface ManualMethod { id: number, type: string, title: string, details: string }
const methods = ref<ManualMethod[]>([])
const loading = ref(false)
const methodId = ref(0)
const reference = ref('')
const submitting = ref(false)
const state = ref<'form' | 'sent' | 'review'>('form')

const typeIcon = (t: string) => t === 'transferencia'
  ? 'i-lucide-landmark'
  : t === 'billetera' ? 'i-lucide-wallet' : t === 'enlace' ? 'i-lucide-link' : 'i-lucide-hand-coins'
const selected = computed(() => methods.value.find(m => m.id === methodId.value))

watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  state.value = 'form'
  reference.value = ''
  loading.value = true
  try {
    // Si ya hay un pago manual pendiente para ESTE producto, el
    // diálogo abre directo en «en revisión» (y el servidor igual
    // rechaza duplicados al enviar).
    const mine = await api<{ payments: { kind: string, itemId: number, planId: number, status: string, gateway: string }[] }>('/api/billing/purchases').catch(() => ({ payments: [] }))
    const targetId = props.kind === 'plan' ? (props.planId || 0) : (props.itemId || 0)
    const already = mine.payments.some(p => p.gateway === 'manual' && p.status === 'pending' && p.kind === props.kind
      && (props.kind === 'plan' ? p.planId === targetId : p.itemId === targetId))
    if (already) { state.value = 'review'; loading.value = false; return }
    const res = await api<{ methods: ManualMethod[] }>('/api/billing/methods')
    methods.value = res.methods
    methodId.value = res.methods[0]?.id || 0
  }
  catch { methods.value = [] }
  finally { loading.value = false }
})

async function submit() {
  if (!methodId.value) { toast.add({ title: 'Elegí un método de pago', color: 'warning' }); return }
  submitting.value = true
  try {
    await api('/api/billing/manual', {
      method: 'POST',
      body: { kind: props.kind, slug: props.slug, planId: props.planId, methodId: methodId.value, reference: reference.value },
    })
    state.value = 'sent'
    emit('sent')
  }
  catch (e) {
    const err = e as { statusCode?: number, data?: { message?: string } }
    if (err.statusCode === 409 || err.data?.message?.includes('en revisión')) state.value = 'review'
    else toast.add({ title: 'No se pudo registrar el pago', description: err.data?.message || '', color: 'error' })
  }
  finally { submitting.value = false }
}
</script>

<template>
  <UModal :open="open" :title="`Pago manual · ${productName}`" @update:open="emit('update:open', $event)">
    <template #body>
      <div v-if="state === 'sent'" class="space-y-3">
        <UAlert color="success" variant="soft" icon="i-lucide-check-circle-2" title="Pago enviado a revisión" description="La administración va a verificarlo. Cuando lo apruebe, el acceso se activa y te llega el aviso acá mismo. Declarar el pago no activa nada por sí solo." />
        <div class="flex justify-end">
          <UButton label="Entendido" @click="emit('update:open', false)" />
        </div>
      </div>
      <div v-else-if="state === 'review'" class="space-y-3">
        <UAlert color="warning" variant="soft" icon="i-lucide-hourglass" title="Tu pago está en revisión" description="Ya hay un pago manual pendiente para esta misma compra. Cuando la administración lo revise, te llega el aviso: no hace falta enviar otro." />
        <div class="flex justify-end">
          <UButton label="Cerrar" color="neutral" variant="soft" @click="emit('update:open', false)" />
        </div>
      </div>
      <div v-else class="space-y-4">
        <p class="text-sm text-muted">
          Total a pagar: <strong class="text-highlighted">{{ fmtMoney(amountCents) }}</strong>.
          Elegí cómo querés pagar, seguí las instrucciones del método y, cuando hayas pagado, declará el pago:
          la administración lo verifica y recién ahí se activa tu acceso.
        </p>
        <div v-if="loading" class="py-4 text-center text-sm text-muted">Cargando métodos…</div>
        <UAlert v-else-if="!methods.length" color="warning" variant="soft" icon="i-lucide-triangle-alert" title="Sin métodos disponibles" description="La comunidad activó los pagos manuales pero todavía no cargó ningún método. Volvé a intentar más tarde." />
        <template v-else>
          <div class="space-y-2">
            <button
              v-for="m in methods" :key="m.id" type="button"
              class="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition"
              :class="methodId === m.id ? 'border-primary bg-primary/5' : 'border-default hover:bg-elevated'"
              @click="methodId = m.id"
            >
              <UIcon :name="typeIcon(m.type)" class="mt-0.5 shrink-0 text-lg" />
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-2 font-medium">{{ m.title }}
                  <UIcon v-if="methodId === m.id" name="i-lucide-check-circle-2" class="text-primary" />
                </span>
                <span v-if="methodId === m.id" class="mt-1 block whitespace-pre-line text-sm text-muted">{{ m.details }}</span>
              </span>
            </button>
          </div>
          <UFormField label="Referencia de tu pago (opcional)" help="N.º de operación, fecha o cualquier dato que ayude a la administración a encontrarlo.">
            <UInput v-model="reference" class="w-full" placeholder="Ej.: transferencia del 19/10, operación 483920" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="soft" label="Cancelar" @click="emit('update:open', false)" />
            <UButton label="Ya realicé el pago — enviar a revisión" icon="i-lucide-send" :loading="submitting" :disabled="!selected" @click="submit" />
          </div>
        </template>
      </div>
    </template>
  </UModal>
</template>
