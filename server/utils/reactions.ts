// Reacciones con emojis (Fase 16-G): UN catálogo fijo y ordenado de
// 21 emojis Unicode, compartido por publicaciones y comentarios.
// Antes había 4 tipos palabra (like/love/fire/clap) y el serializador
// devolvía conteos por tipo con varias reacciones por usuario; desde
// esta fase la semántica es la de la referencia: UNA reacción por
// usuario y objetivo — elegir un emoji crea o REEMPLAZA la propia,
// elegir el mismo la quita. La migración de db.ts mapea las palabras
// legadas a su emoji (like→👍, love→❤️, fire→🔥, clap→👏) y colapsa
// las filas múltiples conservando la más reciente.

export const REACTION_CATALOG: string[] = [
  '👍', '❤️', '😍', '🫀', '😂', '🥳', '🎉', '👏', '🔥', '💯',
  '🚀', '💪', '😮', '🤯', '👀', '🤔', '💡', '🙏', '🤝', '😢', '😡',
]

const CATALOG_SET = new Set(REACTION_CATALOG)

export function isReactionType(value: unknown): value is string {
  return typeof value === 'string' && CATALOG_SET.has(value)
}

export interface ReactionSummaryData {
  // Conteos por emoji, solo emojis con al menos una reacción,
  // ordenados por el orden del catálogo.
  counts: Record<string, number>
  total: number
  // Hasta 3 emojis más usados (empates: orden del catálogo).
  top: string[]
}

export function summarizeReactionRows(rows: { type: string, n: number }[]): ReactionSummaryData {
  const counts: Record<string, number> = {}
  let total = 0
  for (const r of rows) {
    if (!CATALOG_SET.has(r.type)) continue
    const n = Number(r.n) || 0
    counts[r.type] = n
    total += n
  }
  const ordered = REACTION_CATALOG.filter(e => counts[e])
  const top = [...ordered].sort((a, b) => (counts[b]! - counts[a]!) || (REACTION_CATALOG.indexOf(a) - REACTION_CATALOG.indexOf(b))).slice(0, 3)
  const sortedCounts: Record<string, number> = {}
  for (const e of ordered) sortedCounts[e] = counts[e]!
  return { counts: sortedCounts, total, top }
}
