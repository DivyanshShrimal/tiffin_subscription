const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const { initDb, closeDb } = require('../src/db');

async function runAuthTests() {
  console.log('--- Starting Authentication Tests ---');

  // Setup isolated test database
  const testDbPath = path.join(__dirname, '../../data/test_auth.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  const testWal = testDbPath + '-wal';
  const testShm = testDbPath + '-shm';
  if (fs.existsSync(testWal)) fs.unlinkSync(testWal);
  if (fs.existsSync(testShm)) fs.unlinkSync(testShm);

  initDb(testDbPath);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Auth test server running on ${baseUrl}`);

  let validToken = null;
  const testUser = {
    name: 'Owner Admin',
    email: 'owner@tiffin.com',
    password: 'password123'
  };

  try {
    // 1. Successful Registration
    console.log('\n1. Testing Successful Registration...');
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });
    assert.strictEqual(regRes.status, 201, `Expected status 201, got ${regRes.status}`);
    const regData = await regRes.json();
    assert(regData.token, 'Registration must return a JWT token');
    assert(regData.user, 'Registration must return user info');
    assert.strictEqual(regData.user.name, testUser.name);
    assert.strictEqual(regData.user.email, testUser.email);
    assert.strictEqual(regData.user.password_hash, undefined, 'password_hash must NEVER be exposed');
    validToken = regData.token;
    console.log('   ✓ Successful registration passed');

    // 2. Duplicate Registration
    console.log('\n2. Testing Duplicate Registration...');
    const dupRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });
    assert.strictEqual(dupRes.status, 409, `Expected status 409 Conflict, got ${dupRes.status}`);
    const dupData = await dupRes.json();
    assert(dupData.error, 'Duplicate registration must return error');
    assert.match(dupData.message, /already exists/i);
    console.log('   ✓ Duplicate registration properly rejected with 409 Conflict');

    // 3. Successful Login
    console.log('\n3. Testing Successful Login...');
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password
      })
    });
    assert.strictEqual(loginRes.status, 200, `Expected status 200, got ${loginRes.status}`);
    const loginData = await loginRes.json();
    assert(loginData.token, 'Login must return a JWT token');
    assert(loginData.user, 'Login must return user info');
    assert.strictEqual(loginData.user.email, testUser.email);
    assert.strictEqual(loginData.user.password_hash, undefined, 'password_hash must NEVER be exposed');
    console.log('   ✓ Successful login passed');

    // 4. Wrong Password
    console.log('\n4. Testing Wrong Password...');
    const wrongPassRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: 'wrongpassword'
      })
    });
    assert.strictEqual(wrongPassRes.status, 401, `Expected status 401, got ${wrongPassRes.status}`);
    const wrongPassData = await wrongPassRes.json();
    assert(wrongPassData.error, 'Must return error');
    assert.strictEqual(wrongPassData.user, undefined);
    assert.strictEqual(wrongPassData.token, undefined);
    console.log('   ✓ Wrong password properly rejected with 401');

    // 5. Unknown User
    console.log('\n5. Testing Unknown User...');
    const unknownRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nobody@tiffin.com',
        password: 'password123'
      })
    });
    assert.strictEqual(unknownRes.status, 401, `Expected status 401, got ${unknownRes.status}`);
    const unknownData = await unknownRes.json();
    assert(unknownData.error, 'Must return error');
    console.log('   ✓ Unknown user properly rejected with 401');

    // 6. Missing / Invalid Token on Protected Route
    console.log('\n6. Testing Missing / Invalid Token...');
    // 6a. Missing token
    const noTokenRes = await fetch(`${baseUrl}/api/auth/me`);
    assert.strictEqual(noTokenRes.status, 401, `Expected status 401 for missing token, got ${noTokenRes.status}`);
    const noTokenData = await noTokenRes.json();
    assert.match(noTokenData.message, /token is required/i);
    console.log('   ✓ Missing token properly rejected with 401');

    // 6b. Invalid token
    const badTokenRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer this-is-an-invalid-token' }
    });
    assert.strictEqual(badTokenRes.status, 401, `Expected status 401 for invalid token, got ${badTokenRes.status}`);
    const badTokenData = await badTokenRes.json();
    assert.match(badTokenData.message, /invalid token/i);
    console.log('   ✓ Invalid token properly rejected with 401');

    // 7. Valid Token on Protected Route
    console.log('\n7. Testing Valid Token...');
    const validTokenRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    assert.strictEqual(validTokenRes.status, 200, `Expected status 200 for valid token, got ${validTokenRes.status}`);
    const validTokenData = await validTokenRes.json();
    assert(validTokenData.user, 'Protected route must return user');
    assert.strictEqual(validTokenData.user.email, testUser.email);
    assert.strictEqual(validTokenData.user.password_hash, undefined, 'password_hash must NEVER be exposed');
    console.log('   ✓ Valid token authenticated successfully');

    console.log('\nALL 7 AUTHENTICATION TESTS PASSED SUCCESSFULLY! 🎉\n');
  } finally {
    server.close();
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testWal)) fs.unlinkSync(testWal);
    if (fs.existsSync(testShm)) fs.unlinkSync(testShm);
  }
}

runAuthTests().catch(err => {
  console.error('Auth test suite failed:', err);
  process.exit(1);
});
