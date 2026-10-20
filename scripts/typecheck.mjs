import { spawnSync } from 'node:child_process'
const result = spawnSync('npx', ['nuxi', 'typecheck'], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] })
const output = (result.stdout || '') + (result.stderr || '')
process.stdout.write(output)
if (result.error) console.error(result.error)
process.exit(result.error || result.status !== 0 || /Load plugin failed|Failed to create plugin|Resolve plugin path failed/.test(output) ? 1 : 0)
