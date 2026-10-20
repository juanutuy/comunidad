import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const patches = 'node_modules/patch-package/index.js'
if (existsSync(patches)) {
  const patched = spawnSync(process.execPath, [patches, '--error-on-fail'], { stdio: 'inherit' })
  if (patched.error) throw patched.error
  if (patched.status !== 0) process.exit(patched.status ?? 1)
}
const cli = 'node_modules/nuxt/bin/nuxt.mjs'
if (existsSync(cli)) {
  const result = spawnSync(process.execPath, [cli, 'prepare'], { stdio: 'inherit' })
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}
