// Estado ÚNICO de los comentarios por publicación (Fase 16-G).
// La tarjeta (feed, canales, perfil, guardados, búsqueda) y la
// página de detalle muestran la misma conversación: ambas leen y
// escriben este estado compartido por post, así un comentario o
// una reacción hechos en una superficie se ven en la otra sin
// recargar y sin estados gemelos que se pisen.
//
// El árbol viene del servidor ya armado (utils/comments.ts en el
// servidor): raíces + respuestas de un nivel, reacciones por
// comentario y adjuntos. Las mutaciones aplican la respuesta del
// servidor sobre el árbol local.
import type { CommentNode } from '~/utils/reactions'

export interface PostCommentsState {
  loaded: boolean
  loading: boolean
  roots: CommentNode[]
  total: number
  withheld: boolean
  sort: 'recent' | 'oldest'
}

export interface CommentMediaInput { mediaType: string, mediaUrl: string, mediaName: string }

function emptyState(): PostCommentsState {
  return { loaded: false, loading: false, roots: [], total: 0, withheld: false, sort: 'recent' }
}

export function usePostComments() {
  const states = useState<Record<number, PostCommentsState>>('post-comments', () => ({}))
  const api = useApi()

  function state(postId: number): PostCommentsState {
    if (!states.value[postId]) states.value[postId] = emptyState()
    return states.value[postId]!
  }

  // Siembra desde el SSR del detalle (solo si todavía no se cargó:
  // el estado vivo del cliente manda sobre la foto inicial).
  function seed(postId: number, roots: CommentNode[], total: number, withheld: boolean) {
    const s = state(postId)
    if (s.loaded) return
    s.roots = roots
    s.total = total
    s.withheld = withheld
    s.loaded = true
  }

  async function load(postId: number) {
    const s = state(postId)
    if (s.loaded || s.loading) return
    s.loading = true
    try {
      const res = await api<{ comments: CommentNode[], total: number, withheld: boolean }>(`/api/posts/${postId}/comments`)
      s.roots = res.comments
      s.total = res.total
      s.withheld = !!res.withheld
      s.loaded = true
    }
    catch { /* sin acceso o sin red: la sección queda vacía */ }
    finally { s.loading = false }
  }

  async function reload(postId: number) {
    const s = state(postId)
    s.loaded = false
    await load(postId)
  }

  function findNode(s: PostCommentsState, commentId: number): CommentNode | null {
    for (const root of s.roots) {
      if (root.id === commentId) return root
      for (const reply of root.replies) if (reply.id === commentId) return reply
    }
    return null
  }

  async function add(postId: number, input: { body: string, media: CommentMediaInput | null, parentId?: number | null }): Promise<CommentNode> {
    const s = state(postId)
    const res = await api<{ id: number, comment: CommentNode }>(`/api/posts/${postId}/comments`, {
      method: 'POST',
      body: {
        body: input.body,
        parentId: input.parentId ?? undefined,
        mediaType: input.media?.mediaType,
        mediaUrl: input.media?.mediaUrl,
        mediaName: input.media?.mediaName,
      },
    })
    const node = res.comment
    if (node.parentId) {
      const root = s.roots.find(r => r.id === node.parentId)
      if (root) root.replies.push(node)
      else s.roots.push(node)
    }
    else s.roots.unshift(node)
    s.total += 1
    return node
  }

  async function react(postId: number, commentId: number, emoji: string): Promise<void> {
    const s = state(postId)
    const node = findNode(s, commentId)
    const res = await api<{ reactions: Record<string, number>, reactionTop: string[], reactionTotal: number, myReaction: string | null }>(`/api/comments/${commentId}/reactions`, { method: 'POST', body: { type: emoji } })
    if (node) {
      node.reactions = res.reactions
      node.reactionTop = res.reactionTop
      node.reactionTotal = res.reactionTotal
      node.myReaction = res.myReaction
    }
  }

  async function edit(postId: number, commentId: number, body: string): Promise<void> {
    const s = state(postId)
    const res = await api<{ comment: CommentNode }>(`/api/comments/${commentId}`, { method: 'PUT', body: { body } })
    const node = findNode(s, commentId)
    if (node && res.comment) node.body = res.comment.body
  }

  async function remove(postId: number, commentId: number): Promise<void> {
    const s = state(postId)
    await api(`/api/comments/${commentId}`, { method: 'DELETE' })
    const rootIdx = s.roots.findIndex(r => r.id === commentId)
    if (rootIdx >= 0) {
      s.total -= 1 + s.roots[rootIdx]!.replies.length
      s.roots.splice(rootIdx, 1)
      return
    }
    for (const root of s.roots) {
      const idx = root.replies.findIndex(r => r.id === commentId)
      if (idx >= 0) {
        root.replies.splice(idx, 1)
        s.total -= 1
        return
      }
    }
  }

  // Raíces según el orden elegido (las respuestas siempre van
  // cronológicas, como las arma el servidor).
  function sortedRoots(postId: number): CommentNode[] {
    const s = state(postId)
    const list = [...s.roots]
    list.sort((a, b) => s.sort === 'recent'
      ? (b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
      : (a.createdAt.localeCompare(b.createdAt) || a.id - b.id))
    return list
  }

  return { state, seed, load, reload, add, react, edit, remove, sortedRoots }
}
