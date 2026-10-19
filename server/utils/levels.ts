// Niveles e insignias (Fase 2), derivados de los puntos de actividad que
// ya calcula el ranking: publicación = 10, comentario = 3, reacción
// recibida = 2. Todo se calcula al vuelo, sin tablas de estado.
//
// Umbrales de nivel (puntos acumulados):
//   Inicial       0 – 24
//   Activo       25 – 59
//   Colaborador  60 – 119
//   Referente   120 – 249
//   Leyenda     250+
import type { H3Event } from 'h3'
import { dbFor } from './db'
import { extraPoints } from './points'

export interface Level { name: string, min: number, nextAt: number | null }

export const LEVELS: { name: string, min: number }[] = [
  { name: 'Leyenda', min: 250 },
  { name: 'Referente', min: 120 },
  { name: 'Colaborador', min: 60 },
  { name: 'Activo', min: 25 },
  { name: 'Inicial', min: 0 },
]

export function levelFor(points: number): Level {
  const idx = LEVELS.findIndex(l => points >= l.min)
  const current = LEVELS[idx]!
  const next = idx > 0 ? LEVELS[idx - 1]! : null
  return { name: current.name, min: current.min, nextAt: next ? next.min : null }
}

export interface MemberStats {
  posts: number
  comments: number
  reactionsReceived: number
  coursesCompleted: number
  bookmarks: number
  points: number
}

export async function memberStats(event: H3Event, tenantId: number, userId: number): Promise<MemberStats> {
  const db = await dbFor(event)
  const one = async (sql: string, ...p: unknown[]) => ((await db.prepare(sql).get(...p)) as { n: number }).n
  const posts = await one("SELECT COUNT(*) AS n FROM posts WHERE author_id = ? AND tenant_id = ? AND status = 'published'", userId, tenantId)
  const comments = await one('SELECT COUNT(*) AS n FROM comments WHERE author_id = ? AND tenant_id = ?', userId, tenantId)
  const reactionsReceived = await one('SELECT COUNT(*) AS n FROM reactions r JOIN posts p ON p.id = r.post_id WHERE p.author_id = ? AND p.tenant_id = ?', userId, tenantId)
  const bookmarks = await one('SELECT COUNT(*) AS n FROM bookmarks WHERE user_id = ? AND tenant_id = ?', userId, tenantId)
  // Cursos completados: cursos del tenant donde el usuario completó
  // TODAS las lecciones (y el curso tiene al menos una lección).
  const coursesCompleted = await one(`
    SELECT COUNT(*) AS n FROM courses c
    WHERE c.tenant_id = ?
      AND (SELECT COUNT(*) FROM lessons l JOIN chapters ch ON ch.id = l.chapter_id WHERE ch.course_id = c.id) > 0
      AND (SELECT COUNT(*) FROM lessons l JOIN chapters ch ON ch.id = l.chapter_id WHERE ch.course_id = c.id)
        = (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l2 ON l2.id = lp.lesson_id JOIN chapters ch2 ON ch2.id = l2.chapter_id
           WHERE ch2.course_id = c.id AND lp.user_id = ? AND lp.tenant_id = ?)`,
  tenantId, userId, tenantId)
  // Fase 5: se suman los hitos de point_events (cursos y eventos).
  const extra = await extraPoints(event, tenantId, userId).catch(() => 0)
  return { posts, comments, reactionsReceived, coursesCompleted, bookmarks, points: posts * 10 + comments * 3 + reactionsReceived * 2 + extra }
}

export interface Badge { id: string, name: string, description: string, icon: string, earned: boolean }

export function badgesFor(stats: MemberStats): Badge[] {
  return [
    { id: 'primera-publicacion', name: 'Primera publicación', description: 'Publicó su primer contenido en la comunidad', icon: 'i-lucide-pen-line', earned: stats.posts >= 1 },
    { id: 'comentarista', name: 'Comentarista', description: 'Hizo 10 comentarios o más', icon: 'i-lucide-messages-square', earned: stats.comments >= 10 },
    { id: 'estrella', name: 'Estrella', description: 'Recibió 20 reacciones o más en sus publicaciones', icon: 'i-lucide-star', earned: stats.reactionsReceived >= 20 },
    { id: 'graduado', name: 'Graduado', description: 'Completó un curso entero', icon: 'i-lucide-graduation-cap', earned: stats.coursesCompleted >= 1 },
    { id: 'coleccionista', name: 'Coleccionista', description: 'Guardó 5 publicaciones o más', icon: 'i-lucide-bookmark', earned: stats.bookmarks >= 5 },
  ]
}

// ¿El usuario tiene acceso al contenido premium del tenant? Admin, o
// algún acceso registrado a un canal pago (misma vía que el paywall).
export async function hasPremiumAccess(event: H3Event, tenantId: number, userId: number, role: string | null): Promise<boolean> {
  if (role === 'admin') return true
  const db = await dbFor(event)
  const row = await db.prepare(`SELECT ca.id FROM channel_access ca JOIN channels c ON c.id = ca.channel_id
    WHERE ca.tenant_id = ? AND ca.user_id = ? AND c.type = 'paid' LIMIT 1`).get(tenantId, userId)
  return !!row
}
