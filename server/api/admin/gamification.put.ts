// Guardar la configuración de gamificación del tenant (solo admin,
// Fase 9). La lista de niveles se reemplaza completa (así editar,
// agregar y eliminar comparten un solo camino) y los puntos se
// actualizan por acción. Guardas:
//   - al menos un nivel y exactamente una base con umbral 0;
//   - umbrales enteros ≥ 0 y estrictamente crecientes (sin duplicados);
//   - nombres no vacíos y sin repetir; icono lucide no vacío;
//   - puntos enteros ≥ 0 para las acciones conocidas.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { DEFAULT_POINTS, POINT_ACTION_META } from '../../utils/gamification'
import type { PointAction } from '../../utils/gamification'

interface LevelInput { name?: unknown, min?: unknown, icon?: unknown }

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const body = await readBody<{ levels?: LevelInput[], points?: Record<string, unknown> }>(event)

  const rawLevels = Array.isArray(body.levels) ? body.levels : []
  if (!rawLevels.length) throw createError({ statusCode: 400, message: 'Tiene que haber al menos un nivel.' })
  if (rawLevels.length > 20) throw createError({ statusCode: 400, message: 'Demasiados niveles (máximo 20).' })
  const levels = rawLevels.map((l) => {
    const name = String(l.name ?? '').trim().slice(0, 40)
    const min = Number(l.min)
    const icon = String(l.icon ?? '').trim().slice(0, 60)
    if (!name) throw createError({ statusCode: 400, message: 'Todos los niveles necesitan un nombre.' })
    if (!Number.isInteger(min) || min < 0) throw createError({ statusCode: 400, message: `El umbral de «${name}» tiene que ser un entero de 0 o más.` })
    if (!icon.startsWith('i-lucide-')) throw createError({ statusCode: 400, message: `El icono de «${name}» tiene que ser un icono de Lucide (por ejemplo i-lucide-star).` })
    return { name, min, icon }
  }).sort((a, b) => a.min - b.min)
  const names = new Set(levels.map(l => l.name.toLowerCase()))
  if (names.size !== levels.length) throw createError({ statusCode: 400, message: 'Hay nombres de nivel repetidos.' })
  for (let i = 1; i < levels.length; i++) {
    if (levels[i]!.min <= levels[i - 1]!.min)
      throw createError({ statusCode: 400, message: 'Los umbrales tienen que ser estrictamente crecientes, sin repetir.' })
  }
  if (levels[0]!.min !== 0)
    throw createError({ statusCode: 400, message: 'El nivel base tiene que empezar en 0 puntos: sin él habría miembros sin nivel.' })

  const pointsInput = body.points && typeof body.points === 'object' ? body.points : {}
  const points: Partial<Record<PointAction, number>> = {}
  for (const meta of POINT_ACTION_META) {
    const v = pointsInput[meta.action]
    if (v === undefined) continue
    const n = Number(v)
    if (!Number.isInteger(n) || n < 0 || n > 100000)
      throw createError({ statusCode: 400, message: `Los puntos de «${meta.label}» tienen que ser un entero de 0 o más.` })
    points[meta.action] = n
  }

  const db = await dbFor(event)
  await db.prepare('DELETE FROM gamification_levels WHERE tenant_id = ?').run(tenant.id)
  for (const [i, l] of levels.entries()) {
    await db.prepare('INSERT INTO gamification_levels (tenant_id, name, min_points, icon, position) VALUES (?, ?, ?, ?, ?)')
      .run(tenant.id, l.name, l.min, l.icon, i + 1)
  }
  for (const [action, value] of Object.entries(points)) {
    await db.prepare(`INSERT INTO gamification_points (tenant_id, action, points) VALUES (?, ?, ?)
      ON CONFLICT(tenant_id, action) DO UPDATE SET points = excluded.points`)
      .run(tenant.id, action, value)
  }
  return { ok: true, levels, points: { ...DEFAULT_POINTS, ...points } }
})
