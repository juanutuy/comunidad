import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const braces = require('braces')
const forge = require('node-forge')

test('patched braces rejects deep patterns and ASTs before recursive stack exhaustion', () => {
  const pattern = '{'.repeat(3000) + 'a,b' + '}'.repeat(3000)
  for (const fn of ['parse', 'compile', 'expand', 'stringify']) assert.throws(() => braces[fn](pattern), /safe depth/)
  let ast: any = { type: 'text', value: 'leaf' }
  for (let i = 0; i < 5000; i++) ast = { type: 'root', nodes: [ast] }
  for (const fn of ['compile', 'expand', 'stringify']) assert.throws(() => braces[fn](ast), /safe depth/)
  assert.deepEqual(braces.expand('src/{app,server}/{a,b}.ts'), ['src/app/a.ts', 'src/app/b.ts', 'src/server/a.ts', 'src/server/b.ts'])
})

test('patched forge rejects extra nested DigestAlgorithm elements in a valid RSA envelope', () => {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 })
  const md = forge.md.sha256.create().update('dependency regression')
  const digest = md.digest().getBytes()
  const a = forge.asn1
  const algorithm = [a.create(a.Class.UNIVERSAL, a.Type.OID, false, a.oidToDer(forge.oids.sha256).getBytes()), a.create(a.Class.UNIVERSAL, a.Type.NULL, false, '')]
  const info = (extra: boolean) => a.toDer(a.create(a.Class.UNIVERSAL, a.Type.SEQUENCE, true, [
    a.create(a.Class.UNIVERSAL, a.Type.SEQUENCE, true, extra ? [...algorithm, a.create(a.Class.UNIVERSAL, a.Type.NULL, false, '')] : algorithm),
    a.create(a.Class.UNIVERSAL, a.Type.OCTETSTRING, false, digest),
  ])).getBytes()
  // NONE applies PKCS#1 v1.5 padding around our explicit DigestInfo.
  const valid = keys.privateKey.sign(info(false), 'NONE')
  const malformed = keys.privateKey.sign(info(true), 'NONE')
  assert.equal(keys.publicKey.verify(digest, valid), true)
  assert.throws(() => keys.publicKey.verify(digest, malformed), /DigestInfo/)
})
