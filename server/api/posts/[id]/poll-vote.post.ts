// Votar en una encuesta (Fase 5). Un voto por usuario y encuesta;
// votar de nuevo CAMBIA el voto (no duplica). Solo puede votar quien
// puede ver el post: sesión válida, post publicado y acceso al canal.
import { canAccessChannel, currentAuth, requireCanWrite, requireUser, resolveTenant } from '../../../utils/community'
import { nowIso, dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const { role } = await currentAuth(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ optionId?: number }>(event)
  const optionId = Number(body.optionId || 0)
  // Fase 14: votar es participar — un miembro restringido no vota.
  await requireCanWrite(event, tenant.id, user.id)
  const db = await dbFor(event)
  const post = await db.prepare(`SELECT p.kind, p.status, c.id AS channel_id, c.slug AS channel_slug, c.type AS channel_type, c.tenant_id FROM posts p JOIN channels c ON c.id = p.channel_id WHERE p.id = ? AND p.tenant_id = ?`)
    .get(postId, tenant.id) as Record<string, unknown> | undefined
  if (!post || post.kind !== 'poll' || post.status !== 'published')
    throw createError({ statusCode: 404, message: 'Encuesta no encontrada.' })
  const channel = { id: Number(post.channel_id), tenant_id: tenant.id, group_id: null, slug: String(post.channel_slug), name: '', icon: '', description: '', type: String(post.channel_type), price_cents: 0 }
  if (!(await canAccessChannel(event, user.id, role, channel)))
    throw createError({ statusCode: 403, message: 'No tenés acceso a esta encuesta.' })
  const option = await db.prepare('SELECT id FROM poll_options WHERE id = ? AND post_id = ?').get(optionId, postId)
  if (!option) throw createError({ statusCode: 400, message: 'Opción inválida.' })
  await db.prepare('DELETE FROM poll_votes WHERE post_id = ? AND user_id = ?').run(postId, user.id)
  await db.prepare('INSERT INTO poll_votes (tenant_id, post_id, option_id, user_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(tenant.id, postId, optionId, user.id, nowIso())
  const voteRows = await db.prepare('SELECT option_id, COUNT(*) AS n FROM poll_votes WHERE post_id = ? GROUP BY option_id').all(postId) as { option_id: number, n: number }[]
  const optionRows = await db.prepare('SELECT id, label FROM poll_options WHERE post_id = ? ORDER BY sort, id').all(postId) as { id: number, label: string }[]
  const counts = new Map(voteRows.map(v => [Number(v.option_id), Number(v.n)]))
  const totalVotes = voteRows.reduce((acc, v) => acc + Number(v.n), 0)
  return {
    poll: {
      options: optionRows.map(o => ({
        id: Number(o.id), label: o.label, votes: counts.get(Number(o.id)) ?? 0,
        pct: totalVotes ? Math.round(((counts.get(Number(o.id)) ?? 0) / totalVotes) * 100) : 0,
      })),
      totalVotes, myOptionId: optionId,
    },
  }
})
