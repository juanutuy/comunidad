import { migrateDb } from '../database/migrate'
import { scriptDatabase } from './database'
const { db, close } = scriptDatabase()
try { await migrateDb(db); console.log('Schema updated. No demo users created.') }
finally { close() }
