export function useGuestAccess() {
  const open = useState('guest-access-open', () => false)
  const returnTo = useState('guest-access-return', () => '/feeds')
  const route = useRoute()
  function requestAccess() {
    returnTo.value = route.fullPath
    open.value = true
  }
  return { open, returnTo, requestAccess }
}
