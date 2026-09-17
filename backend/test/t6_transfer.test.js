const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const { initDb, closeDb } = require('../src/db');

async function runT6Tests() {
  console.log('--- Starting T6: Mid-Cycle Subscription Transfer Automated Tests ---');

  const testDbPath = path.join(__dirname, '../../data/test_t6.db');
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  const testWal = testDbPath + '-wal';
  const testShm = testDbPath + '-shm';
  if (fs.existsSync(testWal)) fs.unlinkSync(testWal);
  if (fs.existsSync(testShm)) fs.unlinkSync(testShm);

  initDb(testDbPath);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`T6 test server running on ${baseUrl}`);

  try {
    // 0. Register user & get JWT
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Manager',
        email: 'mgr@tiffin.com',
        password: 'password123'
      })
    });
    const { token } = await regRes.json();
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };

    // Create Customer A (Amit)
    const cARes = await fetch(`${baseUrl}/api/customers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Amit Shah', phone: '9111111111' })
    });
    const custA = (await cARes.json()).customer;

    // Create Customer B (Bhavna)
    const cBRes = await fetch(`${baseUrl}/api/customers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Bhavna Dave', phone: '9222222222' })
    });
    const custB = (await cBRes.json()).customer;

    // 1. Subscribe Customer A to ₹3000/mo plan starting Sept 1, 2026
    console.log('\n1. Subscribing Customer A...');
    const subRes = await fetch(`${baseUrl}/api/customers/${custA.id}/subscribe`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        planName: 'Deluxe Veg Plan',
        monthlyPrice: 3000,
        startDate: '2026-09-01'
      })
    });
    const subA = (await subRes.json()).subscription;
    assert.strictEqual(subA.monthly_price, 3000);
    console.log(`   ✓ Customer A subscribed (ID: ${subA.id})`);

    // 2. Transfer Subscription on a Weekday (Tuesday, Sept 15, 2026)
    console.log('\n2. Testing Mid-month Transfer on Weekday (2026-09-15)...');
    const transferRes = await fetch(`${baseUrl}/api/subscriptions/${subA.id}/transfer`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        newCustomerId: custB.id,
        transferDate: '2026-09-15'
      })
    });
    assert.strictEqual(transferRes.status, 200);
    const transferData = await transferRes.json();
    assert.strictEqual(transferData.transfer.fromCustomerId, custA.id);
    assert.strictEqual(transferData.transfer.toCustomerId, custB.id);
    assert.strictEqual(transferData.transfer.transferDate, '2026-09-15');
    assert.strictEqual(transferData.originalSubscription.end_date, '2026-09-14', 'Original sub ended on day before transfer');
    assert.strictEqual(transferData.newSubscription.start_date, '2026-09-15', 'New sub started on transfer date');
    console.log('   ✓ Transfer API successfully updated original sub and created new carried-over sub');

    // 3. Billing Before & After Transfer (No double billing)
    console.log('\n3. Testing Split Billing for September 2026...');
    const billARes = await fetch(`${baseUrl}/api/customers/${custA.id}/bill?month=2026-09`, {
      headers: authHeaders
    });
    const billA = await billARes.json();
    assert.strictEqual(billA.totalWeekdaysInMonth, 22);
    assert.strictEqual(billA.eligibleWeekdays, 10, 'Weekdays Sept 1..14 = 10 days');
    assert.strictEqual(billA.servedWeekdays, 10);
    assert.strictEqual(billA.totalBill, 1363.64); // (3000 / 22) * 10 = 1363.636... -> 1363.64
    console.log(`   ✓ Customer A billed for days 1-14: 10 days = ₹${billA.totalBill}`);

    const billBRes = await fetch(`${baseUrl}/api/customers/${custB.id}/bill?month=2026-09`, {
      headers: authHeaders
    });
    const billB = await billBRes.json();
    assert.strictEqual(billB.totalWeekdaysInMonth, 22);
    assert.strictEqual(billB.eligibleWeekdays, 12, 'Weekdays Sept 15..30 = 12 days');
    assert.strictEqual(billB.servedWeekdays, 12);
    assert.strictEqual(billB.totalBill, 1636.36); // (3000 / 22) * 12 = 1636.363... -> 1636.36
    console.log(`   ✓ Customer B billed for days 15-30: 12 days = ₹${billB.totalBill}`);

    // Verify Invariant: Total served weekdays = 22, Total bill = ₹3000
    assert.strictEqual(billA.servedWeekdays + billB.servedWeekdays, 22, 'Combined served days must equal total weekdays (22)');
    assert.strictEqual(Math.round((billA.totalBill + billB.totalBill) * 100) / 100, 3000, 'Sum of bills must equal monthly price ₹3000');
    console.log('   ✓ Zero double billing confirmed: 10 + 12 = 22 days, ₹1363.64 + ₹1636.36 = ₹3000.00');

    // 4. Test Overlapping Pause during Transfer
    console.log('\n4. Testing Transfer with Overlapping Pause...');
    // Create Customer C and Customer D
    const custC = (await (await fetch(`${baseUrl}/api/customers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Chetan', phone: '9333333333' })
    })).json()).customer;

    const custD = (await (await fetch(`${baseUrl}/api/customers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Deepa', phone: '9444444444' })
    })).json()).customer;

    // Sub C from Sept 1
    const subC = (await (await fetch(`${baseUrl}/api/customers/${custC.id}/subscribe`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ planName: 'Executive Meal', monthlyPrice: 3000, startDate: '2026-09-01' })
    })).json()).subscription;

    // Pause C from Sept 14 (Mon) to Sept 16 (Wed) (3 weekdays)
    await fetch(`${baseUrl}/api/customers/${custC.id}/pause`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ startDate: '2026-09-14', endDate: '2026-09-16', reason: 'Travel' })
    });

    // Transfer on Sept 15 (Tuesday - right in the middle of pause)
    const transferSpanningRes = await fetch(`${baseUrl}/api/subscriptions/${subC.id}/transfer`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ newCustomerId: custD.id, transferDate: '2026-09-15' })
    });
    assert.strictEqual(transferSpanningRes.status, 200);

    // Check bills for C and D
    const billC = await (await fetch(`${baseUrl}/api/customers/${custC.id}/bill?month=2026-09`, { headers: authHeaders })).json();
    const billD = await (await fetch(`${baseUrl}/api/customers/${custD.id}/bill?month=2026-09`, { headers: authHeaders })).json();

    // C eligible = 10, paused = 1 (Sept 14), served = 9
    assert.strictEqual(billC.eligibleWeekdays, 10);
    assert.strictEqual(billC.pausedWeekdays, 1);
    assert.strictEqual(billC.servedWeekdays, 9);
    assert.strictEqual(billC.totalBill, 1227.27);

    // D eligible = 12, paused = 2 (Sept 15, Sept 16), served = 10
    assert.strictEqual(billD.eligibleWeekdays, 12);
    assert.strictEqual(billD.pausedWeekdays, 2);
    assert.strictEqual(billD.servedWeekdays, 10);
    assert.strictEqual(billD.totalBill, 1363.64);

    assert.strictEqual(billC.servedWeekdays + billD.servedWeekdays, 19);
    assert.strictEqual(billC.pausedWeekdays + billD.pausedWeekdays, 3);
    console.log('   ✓ Overlapping pause split cleanly between old and new customer without double-counting');

    // 5. Transfer on a Weekend (Sunday, Sept 20, 2026)
    console.log('\n5. Testing Transfer on Weekend (2026-09-20)...');
    const custE = (await (await fetch(`${baseUrl}/api/customers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Eshwar', phone: '9555555555' })
    })).json()).customer;

    const custF = (await (await fetch(`${baseUrl}/api/customers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Falguni', phone: '9666666666' })
    })).json()).customer;

    const subE = (await (await fetch(`${baseUrl}/api/customers/${custE.id}/subscribe`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ planName: 'Weekend Transfer Test', monthlyPrice: 3000, startDate: '2026-09-01' })
    })).json()).subscription;

    const transferWeekendRes = await fetch(`${baseUrl}/api/subscriptions/${subE.id}/transfer`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ newCustomerId: custF.id, transferDate: '2026-09-20' })
    });
    assert.strictEqual(transferWeekendRes.status, 200);

    const billE = await (await fetch(`${baseUrl}/api/customers/${custE.id}/bill?month=2026-09`, { headers: authHeaders })).json();
    const billF = await (await fetch(`${baseUrl}/api/customers/${custF.id}/bill?month=2026-09`, { headers: authHeaders })).json();

    // Days before Sept 20: Sept 1..18 = 14 weekdays
    // Days on/after Sept 20: Sept 21..30 = 8 weekdays
    assert.strictEqual(billE.servedWeekdays, 14);
    assert.strictEqual(billF.servedWeekdays, 8);
    assert.strictEqual(billE.servedWeekdays + billF.servedWeekdays, 22);
    console.log('   ✓ Weekend transfer succeeded: 14 + 8 = 22 weekdays split correctly');

    console.log('\nALL T6 SUBSCRIPTION TRANSFER TESTS PASSED SUCCESSFULLY! 🎉\n');
  } finally {
    server.close();
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testWal)) fs.unlinkSync(testWal);
    if (fs.existsSync(testShm)) fs.unlinkSync(testShm);
  }
}

runT6Tests().catch(err => {
  console.error('T6 test suite failed:', err);
  process.exit(1);
});
