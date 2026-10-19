// Puntos extra por aprendizaje y eventos (Fase 5). Los puntos base
// (publicar/comentar/reacciones) se calculan al vuelo en levels.ts;
// estos hitos se registran una sola vez en point_events gracias al
// índice único (tenant, usuario, tipo, referencia): repetir la acción
// no duplica puntos, y deshacerla (desmarcar lección, cancelar RSVP)
// no los quita.
//
// Fase 9: el valor de cada hito sale de la configuración de
// gamificación del tenant (utils/gamification.ts) vigente al momento
// de la acción, y queda guardado en la fila de point_events.
import type { H3Event } from 'h3'
import { dbFor, nowIso } from './db'
import { DEFAULT_POINTS, getGamification } from './gamification'

export const POINT_VALUES = {
  course_enroll: DEFAULT_POINTS.course_enroll,
  course_complete: DEFAULT_POINTS.course_complete,
  event_rsvp: DEFAULT_POINTS.event_rsvp,
} as const

export type PointKind = keyof typeof POINT_VALUES

export async function awardPoints(event: H3Event, tenantId: number, userId: number, kind: PointKind, refId: number): Promise<boolean> {
  const db = await dbFor(event)
  const { points } = await getGamification(event, tenantId)
  const res = await db.prepare('INSERT OR IGNORE INTO point_events (tenant_id, user_id, kind, ref_id, points, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(tenantId, userId, kind, refId, points[kind], nowIso())
  return (res.changes ?? 0) > 0
}

export async function extraPoints(event: H3Event, tenantId: number, userId: number): Promise<number> {
  const db = await dbFor(event)
  const row = await db.prepare('SELECT COALESCE(SUM(points), 0) AS n FROM point_events WHERE tenant_id = ? AND user_id = ?').get(tenantId, userId) as { n: number }
  return Number(row?.n ?? 0)
}
