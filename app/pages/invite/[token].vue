<script setup lang="ts">
// Página de invitación (Fase 14): el enlace que genera un
// administrador (por correo o reutilizable). Si la invitación sirve,
// muestra el registro; la cuenta nace APROBADA aunque la comunidad
// pida aprobación previa — la invitación es la aprobación. Si no
// sirve, dice por qué sin vueltas.
definePageMeta({ layout: 'auth' })
const route = useRoute()
const router = useRouter()
const api = useApi()
const { register, user } = useAuth()
const { t } = useI18n()
const toast = useToast()
const token = computed(() => String(route.params.token || ''))

interface InviteInfo { valid: boolean, reason?: string, kind?: string, email?: string, tenantName: string }
const { data } = await useAsyncData(`invite-${token.value}`, () =>
  api<InviteInfo>(`/api/invite/${token.value}`)
    .catch((): InviteInfo => ({ valid: false, reason: 'not_found', tenantName: '' })))

const reasonText = computed(() => {
  switch (data.value?.reason) {
    case 'expired': return t('invite.reasonExpired')
    case 'revoked': return t('invite.reasonRevoked')
    case 'accepted': return t('invite.reasonAccepted')
    default: return t('invite.reasonNotFound')
  }
})

const form = reactive({ name: '', email: '', password: '' })
watchEffect(() => { if (data.value?.email) form.email = data.value.email })
const loading = ref(false)
const error = ref('')

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await register(form.name, form.email, form.password, { inviteToken: token.value })
    toast.add({ title: t('auth.welcomeToast'), color: 'success' })
    router.push('/feeds')
  }
  catch (e) {
    error.value = (e as { data?: { message?: string } }).data?.message || t('auth.registerFailed')
  }
  finally { loading.value = false }
}
</script>

<template>
  <UCard>
    <template v-if="user">
      <h1 class="text-2xl font-bold">{{ t('invite.alreadyAccount') }}</h1>
      <p class="mt-1 text-sm text-muted">{{ t('invite.alreadyAccountText', { name: user.name }) }}</p>
      <UButton class="mt-5" block :label="t('invite.goCommunity')" @click="router.push('/feeds')" />
    </template>
    <template v-else-if="data?.valid">
      <h1 class="text-2xl font-bold">{{ t('invite.invitedTo', { name: data.tenantName }) }}</h1>
      <p class="mt-1 text-sm text-muted">{{ t('invite.inviteText') }}</p>
      <UAlert v-if="error" class="mt-4" color="error" variant="soft" :title="error" />
      <form class="mt-5 space-y-4" @submit.prevent="submit">
        <UFormField :label="t('auth.nameLabel')">
          <UInput v-model="form.name" required :placeholder="t('auth.namePlaceholder')" class="w-full" />
        </UFormField>
        <UFormField :label="t('auth.email')" :hint="data.kind === 'email' ? t('invite.emailHint') : undefined">
          <UInput v-model="form.email" type="email" required :placeholder="t('auth.emailPlaceholder')" :disabled="data.kind === 'email'" class="w-full" />
        </UFormField>
        <UFormField :label="t('auth.password')" :hint="t('auth.passwordHint')">
          <UInput v-model="form.password" type="password" required minlength="8" :placeholder="t('auth.newPasswordPlaceholder')" class="w-full" />
        </UFormField>
        <UButton type="submit" block :label="t('invite.createAndEnter')" :loading="loading" />
      </form>
      <p class="mt-4 text-center text-sm text-muted">
        {{ t('auth.haveAccount') }} <NuxtLink to="/login" class="font-medium text-primary hover:underline">{{ t('nav.login') }}</NuxtLink>
      </p>
    </template>
    <template v-else>
      <div class="flex flex-col items-center py-4 text-center">
        <span class="flex h-14 w-14 items-center justify-center rounded-full bg-elevated">
          <UIcon name="i-lucide-mail-x" class="text-3xl text-muted" />
        </span>
        <h1 class="mt-4 text-2xl font-bold">{{ t('invite.invalidTitle') }}</h1>
        <p class="mt-2 max-w-md text-sm text-muted">{{ reasonText }}</p>
        <UButton class="mt-6" color="neutral" variant="soft" :label="t('invite.goLogin')" @click="router.push('/login')" />
      </div>
    </template>
  </UCard>
</template>
