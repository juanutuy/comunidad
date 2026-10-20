import { openSQLite } from '../database/local'
import { migrateDb } from '../database/migrate'
export async function memoryDatabase() {
  const connection = openSQLite(':memory:')
  await migrateDb(connection.db)
  return connection
}
