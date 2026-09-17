const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const { initDb, closeDb } = require('../src/db');

async function runCustomerIntegrationTests() {
  console.log('--- Starting Customer & Billing API Integration Tests ---');

  // Setup isolated test database
  const testDbPath = path.join(__dirname, '../../data/test_customers.db');
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
  console.log(`Integration test server running on ${baseUrl}`);

  try {
    // 0. Register user & get JWT token
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Tiffin Manager',
        email: 'manager@tiffin.com',
        password: 'securePassword123'
      })
    });
    const regData = await regRes.json();
    const token = regData.token;
    assert(token, 'Must receive auth token');
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };

    // 1. Rejection of unauthenticated request
    console.log('\n1. Testing Protected Routes (401 without token)...');
    const unauthRes = await fetch(`${baseUrl}/api/customers`);
    assert.strictEqual(unauthRes.status, 401, 'Must reject unauthenticated request with 401');
    console.log('   ✓ Unauthenticated access blocked');

    // 2. Create Customer
    console.log('\n2. Testing Customer Creation...');
    const createRes = await fetch(`${baseUrl}/api/customers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Rajesh Kumar',
        phone: '9876543210',
        email: 'rajesh@example.com',
        address: 'Flat 402, Sunshine Apts',
        notes: 'Less spicy food preferred'
      })
    });
    assert.strictEqual(createRes.status, 201);
    const createData = await createRes.json();
    assert.strictEqual(createData.customer.name, 'Rajesh Kumar');
    assert.strictEqual(createData.customer.phone, '9876543210');
    const customerId = createData.customer.id;
    console.log(`   ✓ Customer created successfully (ID: ${customerId})`);

    // 2b. Duplicate phone rejection
    const dupRes = await fetch(`${baseUrl}/api/customers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Another Person',
        phone: '9876543210'
      })
    });
    assert.strictEqual(dupRes.status, 409, 'Duplicate phone number must return 409 Conflict');
    console.log('   ✓ Duplicate phone number properly rejected with 409 Conflict');

    // 3. Search Customer by Phone
    console.log('\n3. Testing Phone Search...');
    const searchRes = await fetch(`${baseUrl}/api/customers/search?phone=98765`, {
      headers: authHeaders
    });
    assert.strictEqual(searchRes.status, 200);
    const searchData = await searchRes.json();
    assert.strictEqual(searchData.customers.length, 1);
    assert.strictEqual(searchData.customers[0].phone, '9876543210');
    console.log('   ✓ Phone search returned correct customer');

    // 4. Get Customer by ID
    console.log('\n4. Testing Get Customer by ID...');
    const getRes = await fetch(`${baseUrl}/api/customers/${customerId}`, {
      headers: authHeaders
    });
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.customer.id, customerId);
    assert.strictEqual(getData.status, 'no_subscription');
    console.log('   ✓ Customer retrieved with initial status "no_subscription"');

    // 5. Subscribe Customer to a ₹3000 Plan
    console.log('\n5. Testing Customer Subscription...');
    const subRes = await fetch(`${baseUrl}/api/customers/${customerId}/subscribe`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        planName: 'Deluxe Veg Lunch Plan',
        monthlyPrice: 3000,
        startDate: '2026-09-01'
      })
    });
    assert.strictEqual(subRes.status, 201);
    const subData = await subRes.json();
    assert.strictEqual(subData.subscription.monthly_price, 3000);
    assert.strictEqual(subData.subscription.status, 'active');
    console.log('   ✓ Customer successfully subscribed to ₹3000/mo plan');

    // 6. Test Billing API (Full month before pauses)
    console.log('\n6. Testing Monthly Bill API (Full month)...');
    const billRes1 = await fetch(`${baseUrl}/api/customers/${customerId}/bill?month=2026-09`, {
      headers: authHeaders
    });
    assert.strictEqual(billRes1.status, 200);
    const billData1 = await billRes1.json();
    assert.strictEqual(billData1.month, '2026-09');
    assert.strictEqual(billData1.totalWeekdaysInMonth, 22);
    assert.strictEqual(billData1.servedWeekdays, 22);
    assert.strictEqual(billData1.totalBill, 3000);
    console.log('   ✓ Bill API verified for full month: ₹3000 for 22 days');

    // 7. Pause Customer Subscription for 5 weekdays (Sept 7 to Sept 11)
    console.log('\n7. Testing Pause Subscription...');
    const pauseRes = await fetch(`${baseUrl}/api/customers/${customerId}/pause`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        startDate: '2026-09-07',
        endDate: '2026-09-11',
        reason: 'Out of town for family function'
      })
    });
    assert.strictEqual(pauseRes.status, 201);
    const pauseData = await pauseRes.json();
    assert.strictEqual(pauseData.pause.start_date, '2026-09-07');
    assert.strictEqual(pauseData.pause.end_date, '2026-09-11');
    console.log('   ✓ Pause period created successfully');

    // 8. Test Billing API after Pause (5 weekdays paused)
    console.log('\n8. Testing Monthly Bill API after Pause (17 served days)...');
    const billRes2 = await fetch(`${baseUrl}/api/customers/${customerId}/bill?month=2026-09`, {
      headers: authHeaders
    });
    assert.strictEqual(billRes2.status, 200);
    const billData2 = await billRes2.json();
    assert.strictEqual(billData2.totalWeekdaysInMonth, 22);
    assert.strictEqual(billData2.pausedWeekdays, 5);
    assert.strictEqual(billData2.servedWeekdays, 17);
    assert.strictEqual(billData2.totalBill, 2318.18);
    assert(billData2.dailyBreakdown.length === 30);
    console.log('   ✓ Bill API verified with pause: ₹2318.18 for 17 served days');

    // 9. Status API
    console.log('\n9. Testing Customer Status API...');
    const statusRes = await fetch(`${baseUrl}/api/customers/${customerId}/status`, {
      headers: authHeaders
    });
    assert.strictEqual(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert(statusData.customer);
    assert(statusData.subscription);
    assert(Array.isArray(statusData.recentPauses));
    assert.strictEqual(statusData.recentPauses.length, 1);
    console.log(`   ✓ Customer status API returned current subscription and pause history`);

    // 10. Resume Subscription
    console.log('\n10. Testing Resume Subscription...');
    const resumeRes = await fetch(`${baseUrl}/api/customers/${customerId}/resume`, {
      method: 'POST',
      headers: authHeaders
    });
    assert.strictEqual(resumeRes.status, 200);
    const resumeData = await resumeRes.json();
    assert.strictEqual(resumeData.subscription.status, 'active');

    // Check that historical pause record is STILL in database
    const histCheckRes = await fetch(`${baseUrl}/api/customers/${customerId}`, {
      headers: authHeaders
    });
    const histCheckData = await histCheckRes.json();
    assert(histCheckData.pauses.length >= 1, 'Historical pause record must be preserved');
    console.log('   ✓ Resumed subscription without deleting pause history');

    // 10b. Same-day pause and resume test (verifies active status restoration)
    console.log('\n10b. Testing Same-Day Pause & Resume Lifecycle...');
    const todayStr = new Date().toISOString().slice(0, 10);
    const pauseSameDay = await fetch(`${baseUrl}/api/customers/${customerId}/pause`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        startDate: todayStr,
        endDate: '2099-12-31',
        reason: 'Temporary pause starting today'
      })
    });
    assert.strictEqual(pauseSameDay.status, 201);
    
    // Status must be paused
    const statusBefore = await (await fetch(`${baseUrl}/api/customers/${customerId}/status`, { headers: authHeaders })).json();
    assert.strictEqual(statusBefore.status, 'paused', 'Status should be paused when active today');

    // Resume
    const resumeToday = await fetch(`${baseUrl}/api/customers/${customerId}/resume`, {
      method: 'POST',
      headers: authHeaders
    });
    assert.strictEqual(resumeToday.status, 200);

    // Status must now immediately be active
    const statusAfter = await (await fetch(`${baseUrl}/api/customers/${customerId}/status`, { headers: authHeaders })).json();
    assert.strictEqual(statusAfter.status, 'active', 'Status must immediately be active after resume');
    console.log('   ✓ Same-day pause & resume restored active status immediately');

    // 11. Update Customer
    console.log('\n11. Testing Customer Update...');
    const updateRes = await fetch(`${baseUrl}/api/customers/${customerId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Rajesh K. Sharma',
        phone: '9876543210',
        email: 'rajesh.sharma@example.com',
        address: 'Flat 402, Tower B',
        notes: 'Extra rotis on Fridays'
      })
    });
    assert.strictEqual(updateRes.status, 200);
    const updateData = await updateRes.json();
    assert.strictEqual(updateData.customer.name, 'Rajesh K. Sharma');
    assert.strictEqual(updateData.customer.notes, 'Extra rotis on Fridays');
    console.log('   ✓ Customer updated successfully');

    // 12. Delete Customer
    console.log('\n12. Testing Customer Delete (and cascade)...');
    const delRes = await fetch(`${baseUrl}/api/customers/${customerId}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    assert.strictEqual(delRes.status, 200);

    const getDeletedRes = await fetch(`${baseUrl}/api/customers/${customerId}`, {
      headers: authHeaders
    });
    assert.strictEqual(getDeletedRes.status, 404, 'Deleted customer should return 404');
    console.log('   ✓ Customer deleted and verified 404');

    console.log('\nALL CUSTOMER & BILLING API INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉\n');
  } finally {
    server.close();
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testWal)) fs.unlinkSync(testWal);
    if (fs.existsSync(testShm)) fs.unlinkSync(testShm);
  }
}

runCustomerIntegrationTests().catch(err => {
  console.error('Integration test suite failed:', err);
  process.exit(1);
});
