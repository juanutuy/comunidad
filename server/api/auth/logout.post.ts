import { destroySession } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  destroySession(event)
  return { ok: true }
})
