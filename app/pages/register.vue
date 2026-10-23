<script setup lang="ts">
const guestAccess = useGuestAccess()
// Registro. Fase 14: si el tenant pide aprobación previa, el
// formulario suma las preguntas de ingreso configuradas por el
// administrador y la cuenta queda «en revisión» al terminar. Si la
// URL trae ?invite=<token> (desde /invite/[token] se redirige acá o
// se enlaza), la invitación cuenta como aprobación y no se
// preguntan respuestas.
definePageMeta({ layout: 'auth' })
const { register, tenant } = useAuth()
const { t } = useI18n()
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
    toast.add({ title: t('auth.welcomeToast'), color: 'success' })
    router.push(guestAccess.returnTo.value)
  }
  catch (e) {
    error.value = (e as { data?: { message?: string } }).data?.message || t('auth.registerFailed')
  }
  finally { loading.value = false }
}
</script>

<template>
  <UCard>
    <h1 class="text-2xl font-bold">{{ t('auth.createAccountTitle') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ t('auth.registerSubtitle') }}</p>
    <UAlert
      v-if="registrationClosed" class="mt-4" color="warning" variant="soft" icon="i-lucide-lock"
      :title="t('auth.closedTitle')"
      :description="t('auth.closedText')"
    />
    <UAlert v-if="error" class="mt-4" color="error" variant="soft" :title="error" />
    <UAlert
      v-if="joinInfo?.approval && !inviteToken" class="mt-4" color="warning" variant="soft" icon="i-lucide-hourglass"
      :title="t('auth.approvalTitle')"
      :description="t('auth.approvalText')"
    />
    <form v-if="!registrationClosed" class="mt-5 space-y-4" @submit.prevent="submit">
      <UFormField :label="t('auth.nameLabel')">
        <UInput v-model="form.name" required :placeholder="t('auth.namePlaceholder')" class="w-full" />
      </UFormField>
      <UFormField :label="t('auth.email')">
        <UInput v-model="form.email" type="email" required :placeholder="t('auth.emailPlaceholder')" class="w-full" />
      </UFormField>
      <UFormField :label="t('auth.password')" :hint="t('auth.passwordHint')">
        <UInput v-model="form.password" type="password" required minlength="8" :placeholder="t('auth.newPasswordPlaceholder')" class="w-full" />
      </UFormField>
      <template v-if="questions.length">
        <p class="border-t border-default pt-4 text-sm font-semibold">{{ t('auth.tellCommunity') }}</p>
        <UFormField v-for="(q, i) in questions" :key="i" :label="q">
          <UTextarea v-model="answers[i]" :rows="2" class="w-full" :placeholder="t('auth.yourAnswer')" />
        </UFormField>
      </template>
      <UButton type="submit" block :label="joinInfo?.approval && !inviteToken ? t('auth.submitApproval') : t('auth.createAccountButton')" :loading="loading" />
    </form>
    <p class="mt-4 text-center text-sm text-muted">
      {{ t('auth.haveAccount') }} <NuxtLink to="/login" class="font-medium text-primary hover:underline">{{ t('nav.login') }}</NuxtLink>
    </p>
    <p v-if="tenant" class="mt-2 text-center text-xs text-muted">{{ t('auth.creatingIn', { name: tenant.name }) }}</p>
  </UCard>
</template>
