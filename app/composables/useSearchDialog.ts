// Diálogo de búsqueda global (corrección: en la referencia la barra
// superior lleva SOLO el icono de lupa y la búsqueda vive en un
// diálogo tipo Cmd+K). Estado compartido: lo abre la lupa de la barra
// y lo renderiza SearchDialog.vue, montado en el layout.
export function useSearchDialog() {
  const open = useState('search-dialog-open', () => false)
  function openSearch() { open.value = true }
  function closeSearch() { open.value = false }
  return { open, openSearch, closeSearch }
}
