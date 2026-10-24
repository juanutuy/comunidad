interface LocalTime { year: number, month: number, day: number, hour: number, minute: number, second: number }

function parts(date: Date, timezone: string): LocalTime {
  const values = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date)
  const value = (name: string) => Number(values.find(p => p.type === name)?.value)
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') }
}
const stamp = (p: LocalTime) => Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
function utcForLocal(local: LocalTime, timezone: string): Date {
  const target = stamp(local)
  let instant = target
  for (let attempt = 0; attempt < 5; attempt++) {
    const offset = target - stamp(parts(new Date(instant), timezone))
    if (!offset) return new Date(instant)
    instant += offset
  }
  throw createError({ statusCode: 400, message: 'Una fecha de la serie no existe en esa zona horaria por cambio de hora. Elegí otra hora. / A series date falls in a daylight-saving gap. Choose another time.' })
}

/** Materialize a bounded series. Each occurrence retains its own RSVP and editable details. */
export function eventOccurrences(startsAt: string, endsAt: string, body: Record<string, unknown>) {
  const recurrence = String(body.recurrence || 'none')
  if (!['none', 'daily', 'weekly', 'monthly'].includes(recurrence)) throw createError({ statusCode: 400, message: 'Recurrencia inválida. / Invalid recurrence.' })
  const count = recurrence === 'none' ? 1 : Number(body.occurrences)
  if (!Number.isInteger(count) || count < 1 || count > 52) throw createError({ statusCode: 400, message: 'La serie debe tener de 1 a 52 fechas. / A series requires 1–52 dates.' })
  const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC'
  let initial: LocalTime
  try { initial = parts(new Date(startsAt), timezone) }
  catch { throw createError({ statusCode: 400, message: 'Zona horaria inválida. / Invalid time zone.' }) }
  const duration = new Date(endsAt).getTime() - new Date(startsAt).getTime()
  const dates = Array.from({ length: count }, (_, index) => {
    if (!index) return { startsAt, endsAt }
    const date = new Date(Date.UTC(initial.year, initial.month - 1, initial.day))
    if (recurrence === 'monthly') {
      date.setUTCDate(1)
      date.setUTCMonth(date.getUTCMonth() + index)
      date.setUTCDate(Math.min(initial.day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()))
    }
    else date.setUTCDate(date.getUTCDate() + index * (recurrence === 'weekly' ? 7 : 1))
    const start = utcForLocal({ ...initial, year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }, timezone)
    return { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + duration).toISOString() }
  })
  return { dates, timezone }
}
