const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const { initDb, closeDb, getDb } = require('../src/db');

async function runT1Tests() {
  console.log('--- Starting T1: Daily Delivery Notifications Automated Tests ---');

  const testDbPath = path.join(__dirname, '../../data/test_t1.db');
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  const testWal = testDbPath + '-wal';
  const testShm = testDbPath + '-shm';
  if (fs.existsSync(testWal)) fs.unlinkSync(testWal);
  if (fs.existsSync(testShm)) fs.unlinkSync(testShm);

  initDb(testDbPath);
  const db = getDb();

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`T1 test server running on ${baseUrl}`);

  try {
    // Setup test customers and subscriptions:
    // Customer 1: Active weekday customer (Rajesh)
    const c1 = db.prepare(`
      INSERT INTO customers (name, phone, created_at, updated_at)
      VALUES ('Rajesh Kumar', '9876500001', datetime('now'), datetime('now'))
    `).run().lastInsertRowid;

    db.prepare(`
      INSERT INTO subscriptions (customer_id, plan_name, monthly_price, start_date, status, created_at, updated_at)
      VALUES (?, 'South Indian Lunch', 3000, '2026-09-01', 'active', datetime('now'), datetime('now'))
    `).run(c1);

    // Customer 2: Paused customer on 2026-09-17 (Pooja)
    const c2 = db.prepare(`
      INSERT INTO customers (name, phone, created_at, updated_at)
      VALUES ('Pooja Sharma', '9876500002', datetime('now'), datetime('now'))
    `).run().lastInsertRowid;

    const s2 = db.prepare(`
      INSERT INTO subscriptions (customer_id, plan_name, monthly_price, start_date, status, created_at, updated_at)
      VALUES (?, 'North Indian Thali', 3500, '2026-09-01', 'paused', datetime('now'), datetime('now'))
    `).run(c2).lastInsertRowid;

    db.prepare(`
      INSERT INTO pauses (customer_id, subscription_id, start_date, end_date, reason, created_at, updated_at)
      VALUES (?, ?, '2026-09-15', '2026-09-20', 'Festival leave', datetime('now'), datetime('now'))
    `).run(c2, s2);

    // Customer 3: Future subscription starting 2026-10-01 (Anil)
    const c3 = db.prepare(`
      INSERT INTO customers (name, phone, created_at, updated_at)
      VALUES ('Anil Verma', '9876500003', datetime('now'), datetime('now'))
    `).run().lastInsertRowid;

    db.prepare(`
      INSERT INTO subscriptions (customer_id, plan_name, monthly_price, start_date, status, created_at, updated_at)
      VALUES (?, 'Diet Meal Plan', 4000, '2026-10-01', 'active', datetime('now'), datetime('now'))
    `).run(c3);

    // Customer 4: Second active customer on 2026-09-17 (Sunita)
    const c4 = db.prepare(`
      INSERT INTO customers (name, phone, created_at, updated_at)
      VALUES ('Sunita Patel', '9876500004', datetime('now'), datetime('now'))
    `).run().lastInsertRowid;

    db.prepare(`
      INSERT INTO subscriptions (customer_id, plan_name, monthly_price, start_date, status, created_at, updated_at)
      VALUES (?, 'Standard Veg Lunch', 3000, '2026-09-01', 'active', datetime('now'), datetime('now'))
    `).run(c4);

    // 1. Test Weekday clock execution (2026-09-17 is Thursday)
    console.log('\n1. Testing POST /clock on weekday (2026-09-17)...');
    const clockRes = await fetch(`${baseUrl}/clock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-09-17' })
    });
    assert.strictEqual(clockRes.status, 200);
    const clockData = await clockRes.json();
    assert.strictEqual(clockData.isWeekday, true);
    assert.strictEqual(clockData.eligibleCount, 2, 'C1 and C4 are eligible (C2 paused, C3 future)');
    assert.strictEqual(clockData.generatedCount, 2);
    console.log('   ✓ Active weekday customers received notification (paused and future did not)');

    // 2. Test GET /outbox
    console.log('\n2. Testing GET /outbox...');
    const outboxRes = await fetch(`${baseUrl}/outbox?date=2026-09-17`);
    assert.strictEqual(outboxRes.status, 200);
    const outboxData = await outboxRes.json();
    assert.strictEqual(outboxData.total, 2);
    const phones = outboxData.notifications.map(n => n.phone);
    assert(phones.includes('9876500001'), 'Rajesh must receive delivery notification');
    assert(phones.includes('9876500004'), 'Sunita must receive delivery notification');
    assert(!phones.includes('9876500002'), 'Paused customer must NOT receive notification');
    assert(!phones.includes('9876500003'), 'Inactive subscription must NOT receive notification');
    console.log('   ✓ Outbox verified with correct recipient phones and messages');

    // 3. Test duplicate POST /clock call (deduplication)
    console.log('\n3. Testing duplicate POST /clock (idempotency)...');
    const clockRepeatRes = await fetch(`${baseUrl}/api/clock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-09-17' })
    });
    assert.strictEqual(clockRepeatRes.status, 200);
    const clockRepeatData = await clockRepeatRes.json();
    assert.strictEqual(clockRepeatData.generatedCount, 0, 'No duplicates should be generated');

    const outboxAfter = await (await fetch(`${baseUrl}/api/outbox?date=2026-09-17`)).json();
    assert.strictEqual(outboxAfter.total, 2, 'Total in outbox must still be exactly 2');
    console.log('   ✓ Repeated clock call produced 0 duplicate notifications');

    // 4. Test Weekend clock execution (2026-09-20 is Sunday)
    console.log('\n4. Testing POST /clock on weekend (2026-09-20)...');
    const weekendRes = await fetch(`${baseUrl}/clock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-09-20' })
    });
    assert.strictEqual(weekendRes.status, 200);
    const weekendData = await weekendRes.json();
    assert.strictEqual(weekendData.isWeekday, false);
    assert.strictEqual(weekendData.generatedCount, 0);
    assert.match(weekendData.message, /weekend/i);
    console.log('   ✓ Weekend produced 0 notifications as expected');

    console.log('\nALL T1 NOTIFICATION TESTS PASSED SUCCESSFULLY! 🎉\n');
  } finally {
    server.close();
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testWal)) fs.unlinkSync(testWal);
    if (fs.existsSync(testShm)) fs.unlinkSync(testShm);
  }
}

runT1Tests().catch(err => {
  console.error('T1 test suite failed:', err);
  process.exit(1);
});
