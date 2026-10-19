import { onMounted, onUnmounted, ref } from 'vue'

// ¿La ventana es de tamaño teléfono (< 768 px, el breakpoint `md` del
// marco)? Se resuelve en el cliente con matchMedia (en SSR arranca en
// false y se corrige al montar). Lo usa el compositor para abrir su
// editor a pantalla completa solo en teléfono (Fase 10).
export function useIsPhone() {
  const isPhone = ref(false)
  onMounted(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    isPhone.value = mq.matches
    const onChange = (e: MediaQueryListEvent) => { isPhone.value = e.matches }
    mq.addEventListener('change', onChange)
    onUnmounted(() => mq.removeEventListener('change', onChange))
  })
  return isPhone
}
