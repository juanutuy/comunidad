<script setup lang="ts">
// Registro. Fase 14: si el tenant pide aprobación previa, el
// formulario suma las preguntas de ingreso configuradas por el
// administrador y la cuenta queda «en revisión» al terminar. Si la
// URL trae ?invite=<token> (desde /invite/[token] se redirige acá o
// se enlaza), la invitación cuenta como aprobación y no se
// preguntan respuestas.
definePageMeta({ layout: 'auth' })
const { register, tenant } = useAuth()
const api = useApi()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const form = reactive({ name: '', email: '', password: '' })
const loading = ref(false)
const error = ref('')

const inviteToken = computed(() => String(route.query.invite || ''))
const { data: joinInfo } = await useAsyncData('join-info', () =>
  api<{ approval: boolean, questions: string[], registrationClosed?: boolean }>('/api/join-info').catch(() => ({ approval: false, questions: [] as string[], registrationClosed: false })))
// Fase 15: registro público cerrado — sin enlace de invitación no
// hay formulario, hay aviso. Con invitación, el registro sigue.
const registrationClosed = computed(() => !!joinInfo.value?.registrationClosed && !inviteToken.value)
const questions = computed(() => (inviteToken.value ? [] : (joinInfo.value?.questions || [])))
const answers = ref<string[]>([])
watchEffect(() => { answers.value = questions.value.map((_, i) => answers.value[i] || '') })

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const data = await register(form.name, form.email, form.password, {
      inviteToken: inviteToken.value || undefined,
      answers: answers.value,
    })
    if (data.status === 'pending') {
      router.push('/pending')
      return
    }
    toast.add({ title: '¡Cuenta creada! Bienvenido a la comunidad', color: 'success' })
    router.push('/feeds')
  }
  catch (e) {
    error.value = (e as { data?: { message?: string } }).data?.message || 'No se pudo crear la cuenta.'
  }
  finally { loading.value = false }
}
</script>

<template>
  <UCard>
    <h1 class="text-2xl font-bold">Creá tu cuenta</h1>
    <p class="mt-1 text-sm text-muted">Es gratis y toma menos de un minuto.</p>
    <UAlert
      v-if="registrationClosed" class="mt-4" color="warning" variant="soft" icon="i-lucide-lock"
      title="El registro público está cerrado"
      description="Esta comunidad crece por invitación. Si un administrador te compartió un enlace de invitación, abrilo para crear tu cuenta; si no, pedile uno a quien te contó de la comunidad."
    />
    <UAlert v-if="error" class="mt-4" color="error" variant="soft" :title="error" />
    <UAlert
      v-if="joinInfo?.approval && !inviteToken" class="mt-4" color="warning" variant="soft" icon="i-lucide-hourglass"
      title="Esta comunidad revisa los ingresos"
      description="Al crear tu cuenta, un administrador revisa tu solicitud antes de darte acceso. Te avisamos cuando esté aprobada."
    />
    <form v-if="!registrationClosed" class="mt-5 space-y-4" @submit.prevent="submit">
      <UFormField label="Nombre">
        <UInput v-model="form.name" required placeholder="Tu nombre" class="w-full" />
      </UFormField>
      <UFormField label="Correo electrónico">
        <UInput v-model="form.email" type="email" required placeholder="vos@correo.com" class="w-full" />
      </UFormField>
      <UFormField label="Contraseña" hint="Mínimo 8 caracteres">
        <UInput v-model="form.password" type="password" required minlength="8" placeholder="Creá una contraseña" class="w-full" />
      </UFormField>
      <template v-if="questions.length">
        <p class="border-t border-default pt-4 text-sm font-semibold">Contale a la comunidad</p>
        <UFormField v-for="(q, i) in questions" :key="i" :label="q">
          <UTextarea v-model="answers[i]" :rows="2" class="w-full" placeholder="Tu respuesta" />
        </UFormField>
      </template>
      <UButton type="submit" block :label="joinInfo?.approval && !inviteToken ? 'Crear cuenta y enviar solicitud' : 'Crear cuenta'" :loading="loading" />
    </form>
    <p class="mt-4 text-center text-sm text-muted">
      ¿Ya tenés cuenta? <NuxtLink to="/login" class="font-medium text-primary hover:underline">Iniciá sesión</NuxtLink>
    </p>
    <p v-if="tenant" class="mt-2 text-center text-xs text-muted">Estás creando tu cuenta en {{ tenant.name }}.</p>
  </UCard>
</template>
