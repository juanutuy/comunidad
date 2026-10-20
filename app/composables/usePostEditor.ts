// Editor de publicaciones compartido (Fase 16-C): la edición de un
// post abre EL MISMO compositor con el que se crea (PostComposer en
// modo edit), montado una sola vez en el layout de miembro. Este
// composable es el puente: las tarjetas (PostCard) y «Mis borradores»
// dejan acá el post a editar; el compositor anfitrión lo consume y
// abre su modal. Al guardar, el compositor publica el aviso `saved`
// y cada superficie que muestra ese post se actualiza sin recargar
// (la tarjeta aplica su override y emite @changed; borradores
// refresca su lista).
export interface EditablePost {
  id: number
  title: string
  body: string
  bodyHtml: string
  kind: string
  status: string
  channelSlug: string
  channelName: string
  anonymous: boolean
  allowComments: boolean
  pinned: boolean
  scheduledAt?: string
  mediaType: string
  mediaUrl: string
  attachmentName: string
  // Fase 16-F: álbum del post (solo canales de imagen).
  album?: string
  // Etiquetas de las opciones si es encuesta. En edición son SOLO
  // LECTURA (regla del producto: las opciones no se editan en un post
  // ya creado; con votos serían además datos falsos).
  pollOptions: string[]
}

export interface PostSaveNotice {
  id: number
  title: string
  body: string
  bodyHtml: string
  allowComments: boolean
  at: number
}

export function usePostEditor() {
  const target = useState<EditablePost | null>('post-editor-target', () => null)
  const saved = useState<PostSaveNotice | null>('post-editor-saved', () => null)
  function openPostEditor(p: EditablePost) { target.value = p }
  function consumeTarget(): EditablePost | null {
    const t = target.value
    target.value = null
    return t
  }
  function notifySaved(n: Omit<PostSaveNotice, 'at'>) { saved.value = { ...n, at: Date.now() } }
  return { target, saved, openPostEditor, consumeTarget, notifySaved }
}
