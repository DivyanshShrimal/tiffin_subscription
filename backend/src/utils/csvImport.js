const { getDb } = require('../db');
const { isValidDateString } = require('./billing');

const MONTH_MAP = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

/**
 * Normalizes diverse, messy date formats into clean YYYY-MM-DD.
 * Handles:
 * - YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
 * - DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 * - MM/DD/YYYY (if day > 12 or unambiguous)
 * - DD-Mon-YYYY (e.g. 15-Sep-2026, 15 September 2026)
 * - ISO string (e.g. 2026-09-15T00:00:00.000Z)
 */
function normalizeDate(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim();
  if (str.length === 0) return null;

  // 1. Check if already standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return isValidDateString(str) ? str : null;
  }

  // 2. ISO timestamp format
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    const part = str.split('T')[0];
    return isValidDateString(part) ? part : null;
  }

  // 3. YYYY/MM/DD or YYYY.MM.DD
  const ymdMatch = str.match(/^(\d{4})[/. ](\d{1,2})[/. ](\d{1,2})$/);
  if (ymdMatch) {
    const y = Number(ymdMatch[1]);
    const m = String(Number(ymdMatch[2])).padStart(2, '0');
    const d = String(Number(ymdMatch[3])).padStart(2, '0');
    const formatted = `${y}-${m}-${d}`;
    return isValidDateString(formatted) ? formatted : null;
  }

  // 4. DD-Mon-YYYY or DD Mon YYYY (e.g. "15-Sep-2026" or "15 September 2026")
  const namedMonthMatch = str.match(/^(\d{1,2})[-/ ]([A-Za-z]+)[-/ ](\d{4})$/);
  if (namedMonthMatch) {
    const day = Number(namedMonthMatch[1]);
    const monthKey = namedMonthMatch[2].toLowerCase();
    const year = Number(namedMonthMatch[3]);
    const monthNum = MONTH_MAP[monthKey];
    if (monthNum) {
      const formatted = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return isValidDateString(formatted) ? formatted : null;
    }
  }

  // 5. DD/MM/YYYY or MM/DD/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/);
  if (dmyMatch) {
    const p1 = Number(dmyMatch[1]);
    const p2 = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);

    let day, month;
    if (p1 > 12 && p2 <= 12) {
      // Unambiguously DD/MM/YYYY
      day = p1;
      month = p2;
    } else if (p2 > 12 && p1 <= 12) {
      // Unambiguously MM/DD/YYYY
      month = p1;
      day = p2;
    } else {
      // Default convention: DD/MM/YYYY
      day = p1;
      month = p2;
    }

    const formatted = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return isValidDateString(formatted) ? formatted : null;
  }

  // 6. Native Date parsing fallback
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsed.getUTCDate()).padStart(2, '0');
    const formatted = `${y}-${m}-${d}`;
    return isValidDateString(formatted) ? formatted : null;
  }

  return null;
}

/**
 * Parses raw CSV string into an array of objects.
 * Handles quoted cells with commas, quotes, and newlines.
 */
function parseCsv(csvText) {
  if (typeof csvText !== 'string') return [];
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const nonEmptyLines = lines.map(l => l.trim()).filter(l => l.length > 0);
  if (nonEmptyLines.length === 0) return [];

  // Parse header line
  const headerCells = parseCsvLine(nonEmptyLines[0]).map(h =>
    h.toLowerCase().trim().replace(/[\s_]+/g, '_')
  );

  const rows = [];
  for (let i = 1; i < nonEmptyLines.length; i++) {
    const cells = parseCsvLine(nonEmptyLines[i]);
    const rowObj = {};
    for (let j = 0; j < headerCells.length; j++) {
      rowObj[headerCells[j]] = cells[j] !== undefined ? cells[j].trim() : '';
    }
    rows.push({
      rowNumber: i + 1,
      raw: nonEmptyLines[i],
      data: rowObj
    });
  }

  return rows;
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Normalizes phone numbers (removes spaces, dashes, parentheses).
 */
function cleanPhone(raw) {
  if (!raw || typeof raw !== 'string') return '';
  // Strip non-digit characters except leading plus if any
  return raw.replace(/[\s\-\(\)\.]/g, '').trim();
}

/**
 * Processes messy customer import CSV text in a safe transaction.
 * Returns { imported, deduped, rejected }.
 */
function processCustomerCsvImport(csvContent) {
  const parsedRows = parseCsv(csvContent);

  const imported = [];
  const deduped = [];
  const rejected = [];

  if (parsedRows.length === 0) {
    return { imported, deduped, rejected };
  }

  const db = getDb();
  const seenPhonesInBatch = new Set();
  const now = new Date().toISOString();

  // Run in an atomic transaction
  const runImport = db.transaction(() => {
    for (const item of parsedRows) {
      const { rowNumber, data } = item;

      // Extract fields with multiple possible column name aliases
      const name = data.name || data.customer_name || data.fullname || '';
      const rawPhone = data.phone || data.mobile || data.phone_number || data.contact || '';
      const email = data.email || data.email_address || null;
      const planName = data.plan_name || data.plan || 'Standard Veg Plan';
      const rawPrice = data.monthly_price || data.price || data.plan_price || '3000';
      const rawStartDate = data.start_date || data.start || data.subscription_start || '';
      const rawEndDate = data.end_date || data.end || data.subscription_end || '';

      const phone = cleanPhone(rawPhone);

      // 1. Validation: Name required
      if (!name || name.trim().length === 0) {
        rejected.push({
          row: rowNumber,
          phone: rawPhone,
          name: '',
          reason: 'Blank required field: name is missing'
        });
        continue;
      }

      // 2. Validation: Phone required
      if (!phone || phone.length < 5) {
        rejected.push({
          row: rowNumber,
          phone: rawPhone,
          name: name.trim(),
          reason: 'Blank or invalid phone number'
        });
        continue;
      }

      // 3. Validation: Start Date required and valid
      if (!rawStartDate) {
        rejected.push({
          row: rowNumber,
          phone,
          name: name.trim(),
          reason: 'Blank required field: start_date is missing'
        });
        continue;
      }

      const normalizedStartDate = normalizeDate(rawStartDate);
      if (!normalizedStartDate) {
        rejected.push({
          row: rowNumber,
          phone,
          name: name.trim(),
          reason: `Invalid start_date format: "${rawStartDate}"`
        });
        continue;
      }

      // 4. Validation: End Date (if provided)
      let normalizedEndDate = null;
      if (rawEndDate && rawEndDate.trim().length > 0) {
        normalizedEndDate = normalizeDate(rawEndDate);
        if (!normalizedEndDate) {
          rejected.push({
            row: rowNumber,
            phone,
            name: name.trim(),
            reason: `Invalid end_date format: "${rawEndDate}"`
          });
          continue;
        }

        if (normalizedStartDate > normalizedEndDate) {
          rejected.push({
            row: rowNumber,
            phone,
            name: name.trim(),
            reason: `start_date (${normalizedStartDate}) cannot be after end_date (${normalizedEndDate})`
          });
          continue;
        }
      }

      // 5. Validation: Monthly Price
      const priceNum = Number(rawPrice);
      if (isNaN(priceNum) || priceNum < 0) {
        rejected.push({
          row: rowNumber,
          phone,
          name: name.trim(),
          reason: `Invalid monthly_price: "${rawPrice}". Must be a non-negative number.`
        });
        continue;
      }

      // 6. Deduplication: Check if phone already exists in DB or within current import batch
      if (seenPhonesInBatch.has(phone)) {
        deduped.push({
          row: rowNumber,
          phone,
          name: name.trim(),
          reason: `Duplicate phone number "${phone}" already encountered in current import file`
        });
        continue;
      }

      const existingCustomer = db.prepare('SELECT id, name FROM customers WHERE phone = ?').get(phone);
      if (existingCustomer) {
        seenPhonesInBatch.add(phone);
        deduped.push({
          row: rowNumber,
          phone,
          name: name.trim(),
          existingCustomerId: existingCustomer.id,
          reason: `Duplicate phone number "${phone}" already belongs to existing customer "${existingCustomer.name}"`
        });
        continue;
      }

      seenPhonesInBatch.add(phone);

      // 7. Insert clean customer and subscription
      const insertCust = db.prepare(`
        INSERT INTO customers (name, phone, email, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(name.trim(), phone, email ? email.trim().toLowerCase() : null, now, now);

      const customerId = insertCust.lastInsertRowid;

      const insertSub = db.prepare(`
        INSERT INTO subscriptions (customer_id, plan_name, monthly_price, start_date, end_date, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(
        customerId,
        planName.trim(),
        priceNum,
        normalizedStartDate,
        normalizedEndDate,
        now,
        now
      );

      imported.push({
        row: rowNumber,
        customerId,
        subscriptionId: insertSub.lastInsertRowid,
        name: name.trim(),
        phone,
        email: email ? email.trim() : null,
        planName: planName.trim(),
        monthlyPrice: priceNum,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate
      });
    }
  });

  runImport();

  return {
    imported,
    deduped,
    rejected
  };
}

module.exports = {
  normalizeDate,
  parseCsv,
  processCustomerCsvImport
};
