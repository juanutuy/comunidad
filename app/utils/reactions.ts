// Reacciones con emojis (Fase 16-G): el MISMO catálogo fijo y
// ordenado que valida el servidor (server/utils/reactions.ts).
// Una reacción por usuario y objetivo (post o comentario).
export { REACTION_CATALOG } from '#shared/reactions'

export interface ReactionData {
  reactions: Record<string, number>
  reactionTop: string[]
  reactionTotal: number
  myReaction: string | null
}

// Un comentario del árbol (Fase 16-G): raíz con respuestas de un
// solo nivel, adjunto opcional y resumen de reacciones propio.
export interface CommentNode extends ReactionData {
  id: number
  body: string
  createdAt: string
  parentId: number | null
  mediaType: string
  mediaUrl: string
  mediaName: string
  author: { name: string, slug: string, avatarUrl?: string }
  replies: CommentNode[]
}
