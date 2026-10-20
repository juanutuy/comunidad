import test from 'node:test'
import assert from 'node:assert/strict'
import { memoryDatabase } from './helpers'
import { migrateDb } from '../database/migrate'
import { paymentGrantCommands } from '../server/utils/payments'

test('migrations run once, preserve data and propagate errors', async () => {
  const { db, close } = await memoryDatabase()
  try {
    await db.prepare("INSERT INTO tenants(slug,name,created_at) VALUES('kept','Kept','')").run()
    const wrapped = { ...db, batch: async () => { throw Error('must not rerun') } }
    await migrateDb(wrapped)
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM tenants').get()).n, 1)
    await db.prepare("DELETE FROM app_meta WHERE key='schema_version'").run()
    await assert.rejects(migrateDb(wrapped), /must not rerun/)
  }
  finally { close() }
})

test('payment grant and receipt rollback together and retry succeeds', async () => {
  const { db, close } = await memoryDatabase()
  try {
    await db.prepare("INSERT INTO payments(id,tenant_id,user_id,kind,item_id,created_at,updated_at) VALUES(1,1,1,'channel',4,'','')").run()
    const payment = await db.prepare('SELECT * FROM payments WHERE id=1').get()
    const commands = [...paymentGrantCommands(payment, { source: 'stripe' }),
      { sql: "UPDATE payments SET status='paid' WHERE id=1" },
      { sql: "INSERT INTO stripe_events(id,type,processed_at) VALUES('evt','checkout','')" }]
    await db.exec("CREATE TRIGGER fail_grant BEFORE INSERT ON channel_access BEGIN SELECT RAISE(ABORT,'injected'); END;")
    await assert.rejects(db.batch(commands), /injected/)
    assert.equal((await db.prepare('SELECT status FROM payments WHERE id=1').get()).status, 'pending')
    assert.equal(await db.prepare("SELECT id FROM stripe_events WHERE id='evt'").get(), undefined)
    await db.exec('DROP TRIGGER fail_grant')
    await db.batch(commands)
    assert.equal((await db.prepare('SELECT status FROM payments WHERE id=1').get()).status, 'paid')
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM channel_access').get()).n, 1)
    // Re-running the grant cannot mint a duplicate access.
    await db.batch(paymentGrantCommands(payment, { source: 'stripe' }))
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM channel_access').get()).n, 1)
  }
  finally { close() }
})

test('plan grants preserve source, expiration and cancellation ordering', async () => {
  const { db, close } = await memoryDatabase()
  try {
    await db.prepare("INSERT INTO plans(id,tenant_id,name,interval,created_at) VALUES(1,1,'Monthly','month','')").run()
    await db.prepare("INSERT INTO payments(id,tenant_id,user_id,kind,item_id,plan_id,created_at,updated_at) VALUES(1,1,1,'plan',1,1,'','')").run()
    const payment = await db.prepare('SELECT * FROM payments WHERE id=1').get()
    await db.batch(paymentGrantCommands(payment, { source: 'stripe', periodEnd: '2999-01-01', stripeSubscriptionId: 'sub_new', stripeEventCreated: 100 }))
    let subscription = await db.prepare('SELECT * FROM member_subscriptions').get()
    assert.equal(subscription.source, 'stripe')
    assert.equal(subscription.current_period_end, '2999-01-01')
    await db.prepare("UPDATE member_subscriptions SET status='canceled',stripe_event_created=200").run()
    await db.batch(paymentGrantCommands(payment, { source: 'stripe', periodEnd: '2999-01-01', stripeSubscriptionId: 'sub_new', stripeEventCreated: 100 }))
    assert.equal((await db.prepare('SELECT status FROM member_subscriptions').get()).status, 'canceled')
    await db.batch(paymentGrantCommands(payment, { source: 'manual', periodEnd: '2998-01-01' }))
    subscription = await db.prepare('SELECT * FROM member_subscriptions').get()
    assert.equal(subscription.source, 'manual')
    assert.equal(subscription.stripe_subscription_id, '')
    assert.equal(subscription.status, 'active')
  }
  finally { close() }
})
