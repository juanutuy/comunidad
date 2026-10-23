import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'
import { useAuth } from '../app/composables/useAuth'
import { usePostComments } from '../app/composables/usePostComments'

test('logout clears private comment state and discards a late response', async () => {
  const states = new Map<string, ReturnType<typeof ref>>()
  let finish: (value: unknown) => void = () => {}
  const pending = new Promise(resolve => { finish = resolve })
  let cleared = false
  const locale = ref('es')
  Object.assign(globalThis, {
    useState: (key: string, initial = () => undefined) => {
      if (!states.has(key)) states.set(key, ref(initial()))
      return states.get(key)
    },
    useApi: () => (path: string) => path.includes('/comments') ? pending : Promise.resolve({}),
    useI18n: () => ({ locale, applyResolved: () => {} }),
    useNuxtApp: () => ({ runWithContext: (fn: () => void) => fn() }),
    clearNuxtData: () => { cleared = true },
  })
  const auth = useAuth()
  auth.user.value = { id: 1, name: 'Member', slug: 'member', email: 'member@test', bio: '', location: '', avatarUrl: '', memberSince: '', role: 'member' }
  const comments = usePostComments()
  const loading = comments.load(5)
  await auth.logout()
  finish({ comments: [{ id: 99, body: 'private stale content' }], total: 1, withheld: false })
  await loading
  assert.equal(cleared, true)
  assert.equal(auth.user.value, null)
  assert.deepEqual(comments.state(5).roots, [])
  assert.equal(comments.state(5).loaded, false)
  states.get('auth-tenant')!.value = { name: 'ServGT Comunidad', nameEs: 'ServGT Comunidad', nameEn: 'ServGT Community' }
  assert.equal(auth.tenant.value?.name, 'ServGT Comunidad')
  locale.value = 'en'
  assert.equal(auth.tenant.value?.name, 'ServGT Community')
  locale.value = 'es'
  assert.equal(auth.tenant.value?.name, 'ServGT Comunidad')
  for (let id = 10; id < 120; id++) comments.state(id)
  assert.ok(Object.keys(states.get('post-comments')!.value).length <= 100)
})
