// Gamificación administrable por tenant (Fase 9).
//
// Antes los niveles y los puntos por acción vivían fijos en el código
// (utils/levels.ts y utils/points.ts). Ahora se persisten por tenant en
// dos tablas:
//   - gamification_levels  (nombre, umbral mínimo, icono, orden)
//   - gamification_points  (acción → puntos) — se eligió tabla propia
//     en vez de JSON en la fila del tenant porque encaja con el patrón
//     del resto del esquema (filas simples + índice único) y permite
//     leer/escribir cada acción sin reescribir un blob completo.
// Si un tenant no tiene filas (bases anteriores a la Fase 9, o la
// semilla fresca), se siembran los valores HISTÓRICOS la primera vez
// que se lee la configuración: niveles Inicial 0 / Activo 25 /
// Colaborador 60 / Referente 120 / Leyenda 250 y puntos post 10,
// comentario 3, reacción recibida 2, inscripción a curso 5, curso
// completo 50, RSVP a evento 10.
//
// La configuración se cachea SOLO dentro del request (event.context):
// los cambios del admin se ven de inmediato en el request siguiente.
import type { H3Event } from 'h3'
import { dbFor } from './db'

export interface GamLevel { id: number, name: string, min: number, icon: string }

export type PointAction = 'post' | 'comment' | 'reaction_received' | 'comment_reaction' | 'course_enroll' | 'course_complete' | 'event_rsvp'

export interface GamificationConfig {
  levels: GamLevel[] // ordenados por umbral ascendente
  points: Record<PointAction, number>
}

export const DEFAULT_LEVELS: { name: string, min: number, icon: string }[] = [
  { name: 'Inicial', min: 0, icon: 'i-lucide-sprout' },
  { name: 'Activo', min: 25, icon: 'i-lucide-leaf' },
  { name: 'Colaborador', min: 60, icon: 'i-lucide-users' },
  { name: 'Referente', min: 120, icon: 'i-lucide-gem' },
  { name: 'Leyenda', min: 250, icon: 'i-lucide-crown' },
]

export const DEFAULT_POINTS: Record<PointAction, number> = {
  post: 10,
  comment: 3,
  reaction_received: 2,
  // Fase 16-G: misma convención que reaction_received (los puntos
  // los recibe el AUTOR del contenido, recalculados desde las filas
  // de comment_reactions): 1 punto por reacción en sus comentarios.
  comment_reaction: 1,
  course_enroll: 5,
  course_complete: 50,
  event_rsvp: 10,
}

// Metadatos de las acciones para la pantalla de administración.
export const POINT_ACTION_META: { action: PointAction, label: string, description: string }[] = [
  { action: 'post', label: 'Publicar una publicación', description: 'Puntos por cada publicación publicada. Se recalculan con el valor actual.' },
  { action: 'comment', label: 'Comentar', description: 'Puntos por cada comentario. Se recalculan con el valor actual.' },
  { action: 'reaction_received', label: 'Recibir una reacción', description: 'Puntos por cada reacción que reciben las publicaciones del miembro. Se recalculan con el valor actual.' },
  { action: 'comment_reaction', label: 'Recibir una reacción en un comentario', description: 'Puntos por cada reacción que reciben los comentarios del miembro. Se recalculan con el valor actual.' },
  { action: 'course_enroll', label: 'Inscribirse a un curso', description: 'Hito único por curso: se registra con el valor vigente al inscribirse.' },
  { action: 'course_complete', label: 'Completar un curso', description: 'Hito único por curso: se registra con el valor vigente al completarlo.' },
  { action: 'event_rsvp', label: 'Confirmar asistencia a un evento', description: 'Hito único por evento: se registra con el valor vigente al confirmar.' },
]

async function seedGamification(event: H3Event, tenantId: number): Promise<void> {
  const db = await dbFor(event)
  const levelCount = (await db.prepare('SELECT COUNT(*) AS n FROM gamification_levels WHERE tenant_id = ?').get(tenantId) as { n: number }).n
  if (levelCount === 0) {
    for (const [i, l] of DEFAULT_LEVELS.entries()) {
      await db.prepare('INSERT OR IGNORE INTO gamification_levels (tenant_id, name, min_points, icon, position) VALUES (?, ?, ?, ?, ?)')
        .run(tenantId, l.name, l.min, l.icon, i + 1)
    }
  }
  for (const [action, points] of Object.entries(DEFAULT_POINTS)) {
    await db.prepare('INSERT OR IGNORE INTO gamification_points (tenant_id, action, points) VALUES (?, ?, ?)')
      .run(tenantId, action, points)
  }
}

export async function getGamification(event: H3Event, tenantId: number): Promise<GamificationConfig> {
  const ctx = event.context as Record<string, unknown>
  const cacheKey = `_gamification_${tenantId}`
  const cached = ctx[cacheKey] as Promise<GamificationConfig> | undefined
  if (cached) return cached
  const pending = (async (): Promise<GamificationConfig> => {
    const db = await dbFor(event)
    await seedGamification(event, tenantId)
    const levelRows = await db.prepare('SELECT id, name, min_points, icon FROM gamification_levels WHERE tenant_id = ? ORDER BY min_points ASC, position ASC')
      .all(tenantId) as { id: number, name: string, min_points: number, icon: string }[]
    const pointRows = await db.prepare('SELECT action, points FROM gamification_points WHERE tenant_id = ?')
      .all(tenantId) as { action: string, points: number }[]
    const points = { ...DEFAULT_POINTS }
    for (const r of pointRows) {
      if (r.action in points) points[r.action as PointAction] = Number(r.points) || 0
    }
    return {
      levels: levelRows.map(r => ({ id: r.id, name: r.name, min: r.min_points, icon: r.icon || 'i-lucide-award' })),
      points,
    }
  })()
  ctx[cacheKey] = pending
  return pending
}

export interface LevelInfo { name: string, min: number, icon: string, nextAt: number | null, nextName: string | null, nextIcon: string | null }

// Nivel de un puntaje según una lista de niveles (ascendente). Si la
// lista viniera vacía se cae a los niveles por defecto.
export function levelForConfig(levels: GamLevel[], points: number): LevelInfo {
  const list = (levels.length ? levels : DEFAULT_LEVELS.map((l, i) => ({ id: i + 1, ...l })))
  let current = list[0]!
  let idx = 0
  for (let i = 0; i < list.length; i++) {
    if (points >= list[i]!.min) { current = list[i]!; idx = i }
  }
  const next = idx + 1 < list.length ? list[idx + 1]! : null
  return {
    name: current.name, min: current.min, icon: current.icon,
    nextAt: next ? next.min : null, nextName: next ? next.name : null, nextIcon: next ? next.icon : null,
  }
}

// Insignias de NIVEL para la tarjeta del perfil: todas las del sistema,
// con su orden y si el puntaje ya las alcanzó.
export function levelBadgesFor(levels: GamLevel[], points: number) {
  const list = (levels.length ? levels : DEFAULT_LEVELS.map((l, i) => ({ id: i + 1, ...l })))
  return list.map((l, i) => ({ id: l.id, name: l.name, min: l.min, icon: l.icon, order: i + 1, earned: points >= l.min }))
}
