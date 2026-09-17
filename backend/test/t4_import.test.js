const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const { initDb, closeDb } = require('../src/db');

async function runT4Tests() {
  console.log('--- Starting T4: Messy Customer Import Automated Tests ---');

  const testDbPath = path.join(__dirname, '../../data/test_t4.db');
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
  console.log(`T4 test server running on ${baseUrl}`);

  try {
    // Register user & get JWT
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Importer Admin',
        email: 'admin@tiffin.com',
        password: 'password123'
      })
    });
    const { token } = await regRes.json();
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };

    // Pre-insert an existing customer to test deduplication against existing DB
    await fetch(`${baseUrl}/api/customers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Existing Customer', phone: '9888888888' })
    });

    // 1. Messy CSV with Mixed Dates, Duplicate Phones, Blank Fields, and Invalid Rows
    console.log('\n1. Testing Messy CSV Import...');
    const messyCsv = `name,phone,email,plan_name,monthly_price,start_date,end_date
Rohan Verma,9876500101,rohan@example.com,Standard Veg,3000,2026-09-01,2026-12-31
Geeta Iyer,9876500102,geeta@example.com,Deluxe Jain,3200,15/09/2026,
Karan Singh,9876500103,karan@example.com,North Indian,3000,15-Sep-2026,
Sneha Roy,9876500104,sneha@example.com,South Indian,3000,2026/10/01,2026/11/30
Duplicate In File,9876500101,dup@example.com,Standard,3000,2026-09-01,
Existing In DB,9888888888,already@example.com,Standard,3000,2026-09-01,
,9876500105,blankname@example.com,Standard,3000,2026-09-01,
Invalid Price Customer,9876500106,price@example.com,Standard,-500,2026-09-01,
Bad Date Customer,9876500107,date@example.com,Standard,3000,not-a-valid-date,
Inverted Dates Customer,9876500108,invert@example.com,Standard,3000,2026-09-30,2026-09-01`;

    const importRes = await fetch(`${baseUrl}/api/customers/import`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ csv: messyCsv })
    });

    assert.strictEqual(importRes.status, 200);
    const report = await importRes.json();
    assert(Array.isArray(report.imported), 'report must have imported array');
    assert(Array.isArray(report.deduped), 'report must have deduped array');
    assert(Array.isArray(report.rejected), 'report must have rejected array');

    console.log(`   Imported: ${report.imported.length}`);
    console.log(`   Deduped:  ${report.deduped.length}`);
    console.log(`   Rejected: ${report.rejected.length}`);

    // Verify Imported Rows (4 valid rows: Rohan, Geeta, Karan, Sneha)
    assert.strictEqual(report.imported.length, 4, 'Should import exactly 4 valid rows');
    const importedNames = report.imported.map(r => r.name);
    assert(importedNames.includes('Rohan Verma'));
    assert(importedNames.includes('Geeta Iyer'));
    assert(importedNames.includes('Karan Singh'));
    assert(importedNames.includes('Sneha Roy'));

    // Check date normalizations:
    const geeta = report.imported.find(r => r.name === 'Geeta Iyer');
    assert.strictEqual(geeta.startDate, '2026-09-15', 'DD/MM/YYYY (15/09/2026) normalized to 2026-09-15');

    const karan = report.imported.find(r => r.name === 'Karan Singh');
    assert.strictEqual(karan.startDate, '2026-09-15', '15-Sep-2026 normalized to 2026-09-15');

    const sneha = report.imported.find(r => r.name === 'Sneha Roy');
    assert.strictEqual(sneha.startDate, '2026-10-01', '2026/10/01 normalized to 2026-10-01');
    assert.strictEqual(sneha.endDate, '2026-11-30', '2026/11/30 normalized to 2026-11-30');
    console.log('   ✓ Mixed date formats normalized to YYYY-MM-DD');

    // Verify Deduped Rows (2 rows: Duplicate in file + Existing in DB)
    assert.strictEqual(report.deduped.length, 2, 'Should dedupe exactly 2 rows');
    const dedupedPhones = report.deduped.map(r => r.phone);
    assert(dedupedPhones.includes('9876500101'), 'Duplicate in file deduped');
    assert(dedupedPhones.includes('9888888888'), 'Existing in DB deduped');
    console.log('   ✓ Duplicate phone numbers correctly identified and reported under deduped');

    // Verify Rejected Rows (4 rows: blank name, negative price, bad date, inverted dates)
    assert.strictEqual(report.rejected.length, 4, 'Should reject exactly 4 invalid rows');
    const rejectReasons = report.rejected.map(r => r.reason);
    assert(rejectReasons.some(r => /name is missing/i.test(r)), 'Blank name rejected');
    assert(rejectReasons.some(r => /monthly_price/i.test(r)), 'Negative price rejected');
    assert(rejectReasons.some(r => /Invalid start_date/i.test(r)), 'Invalid date rejected');
    assert(rejectReasons.some(r => /cannot be after/i.test(r)), 'Inverted dates rejected');
    console.log('   ✓ Invalid/incomplete rows properly rejected with clear reasons');

    // 2. Test Direct raw CSV via text/csv Content-Type
    console.log('\n2. Testing Direct text/csv Content-Type Upload...');
    const cleanCsv = `name,phone,email,plan_name,monthly_price,start_date
Vikram Malhotra,9876500201,vikram@example.com,Executive Plan,3500,2026-09-01`;

    const textUploadRes = await fetch(`${baseUrl}/api/customers/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/csv',
        Authorization: `Bearer ${token}`
      },
      body: cleanCsv
    });
    assert.strictEqual(textUploadRes.status, 200);
    const textReport = await textUploadRes.json();
    assert.strictEqual(textReport.imported.length, 1);
    assert.strictEqual(textReport.imported[0].name, 'Vikram Malhotra');
    console.log('   ✓ Direct text/csv payload successfully processed');

    // 3. Verify Database State
    const searchRes = await fetch(`${baseUrl}/api/customers/search?phone=9876500201`, {
      headers: authHeaders
    });
    const searchData = await searchRes.json();
    assert.strictEqual(searchData.customers.length, 1);
    assert.strictEqual(searchData.customers[0].name, 'Vikram Malhotra');
    console.log('   ✓ Imported customer persisted and searchable in database');

    console.log('\nALL T4 MESSY CUSTOMER IMPORT TESTS PASSED SUCCESSFULLY! 🎉\n');
  } finally {
    server.close();
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testWal)) fs.unlinkSync(testWal);
    if (fs.existsSync(testShm)) fs.unlinkSync(testShm);
  }
}

runT4Tests().catch(err => {
  console.error('T4 test suite failed:', err);
  process.exit(1);
});
