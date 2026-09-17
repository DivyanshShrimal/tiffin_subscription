const assert = require('assert');
const http = require('http');
const app = require('../src/app');
const { initDb, closeDb } = require('../src/db');

async function runHealthTest() {
  initDb();

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`Test server running on port ${port}`);

  try {
    // 1. Test GET /
    const rootRes = await fetch(`http://localhost:${port}/`);
    assert.strictEqual(rootRes.status, 200, 'Root endpoint should return 200');
    const rootData = await rootRes.json();
    console.log('Root response:', rootData);
    assert.strictEqual(rootData.status, 'running');

    // 2. Test GET /api/health
    const healthRes = await fetch(`http://localhost:${port}/api/health`);
    assert.strictEqual(healthRes.status, 200, 'Health endpoint should return 200');
    const healthData = await healthRes.json();
    console.log('Health response:', healthData);
    assert.strictEqual(healthData.status, 'ok');
    assert.strictEqual(healthData.database, 'connected');
    assert(healthData.timestamp, 'Health response must contain timestamp');

    // 3. Test 404
    const notFoundRes = await fetch(`http://localhost:${port}/api/nonexistent`);
    assert.strictEqual(notFoundRes.status, 404);

    console.log('Server and Health check tests PASSED successfully!');
  } finally {
    server.close();
    closeDb();
  }
}

runHealthTest().catch(err => {
  console.error('Health test failed:', err);
  process.exit(1);
});
