const assert = require('assert');
const { initDb, closeDb } = require('../src/db');

console.log('Testing SQLite initialization...');
const db = initDb();

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('Created Tables:', tables.map(t => t.name));

const tableNames = tables.map(t => t.name);
assert(tableNames.includes('users'), 'users table must exist');
assert(tableNames.includes('customers'), 'customers table must exist');
assert(tableNames.includes('subscriptions'), 'subscriptions table must exist');
assert(tableNames.includes('pauses'), 'pauses table must exist');
assert(tableNames.includes('outbox'), 'outbox table must exist');
assert(tableNames.includes('subscription_transfers'), 'subscription_transfers table must exist');

// Test foreign key constraint enforcement
const pragmaFk = db.prepare('PRAGMA foreign_keys').get();
assert.strictEqual(pragmaFk.foreign_keys, 1, 'Foreign keys pragma must be ON');

// Verify indexes
const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(i => i.name);
console.log('Created Indexes:', indexes);
assert(indexes.includes('idx_customers_phone'), 'idx_customers_phone must exist');
assert(indexes.includes('idx_pauses_dates'), 'idx_pauses_dates must exist');

closeDb();
console.log('DB initialization & schema verification PASSED successfully!');
