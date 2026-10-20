import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const cli = 'node_modules/nuxt/bin/nuxt.mjs'
if (existsSync(cli)) {
  const result = spawnSync(process.execPath, [cli, 'prepare'], { stdio: 'inherit' })
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}
