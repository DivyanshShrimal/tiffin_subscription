const { getDb } = require('../db');
const {
  isValidMonthString,
  isValidDateString,
  calculateMonthlyBill
} = require('../utils/billing');

/**
 * Formats current UTC date as YYYY-MM-DD
 */
function getTodayString() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns yesterday's UTC date as YYYY-MM-DD
 */
function getYesterdayString() {
  const dt = new Date();
  dt.setUTCDate(dt.getUTCDate() - 1);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Evaluates real-time subscription status for a customer.
 */
function evaluateStatus(subscription, pauses = []) {
  if (!subscription || subscription.status === 'cancelled') {
    return 'no_subscription';
  }

  const today = getTodayString();

  if (subscription.start_date > today) {
    return 'upcoming';
  }
  if (subscription.end_date && subscription.end_date < today) {
    return 'expired';
  }

  // Check if today falls in any pause period
  const activePause = pauses.find(p => today >= p.start_date && today <= p.end_date);
  if (activePause) {
    return 'paused';
  }

  return subscription.status === 'paused' ? 'paused' : 'active';
}

// 1. Create Customer
function createCustomer(req, res) {
  const { name, phone, email, address, notes } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Validation Error', message: 'Name is required' });
  }

  if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
    return res.status(400).json({ error: 'Validation Error', message: 'Phone number is required' });
  }

  const cleanPhone = phone.trim();
  const db = getDb();

  try {
    const existing = db.prepare('SELECT id FROM customers WHERE phone = ?').get(cleanPhone);
    if (existing) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Customer with phone number "${cleanPhone}" already exists`
      });
    }

    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO customers (name, phone, email, address, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name.trim(), cleanPhone, email ? email.trim() : null, address ? address.trim() : null, notes ? notes.trim() : null, now, now);

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({
      message: 'Customer created successfully',
      customer
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

// 2. List Customers with pagination, sorting & dynamic status
function listCustomers(req, res) {
  const db = getDb();
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;
    const search = req.query.search ? String(req.query.search).trim() : null;
    const statusFilter = req.query.status ? String(req.query.status).toLowerCase() : 'all';
    const sortBy = ['name', 'phone', 'created_at'].includes(req.query.sortBy) ? req.query.sortBy : 'created_at';
    const sortOrder = String(req.query.sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let query = 'SELECT c.* FROM customers c';
    const params = [];

    if (search) {
      query += ' WHERE (c.name LIKE ? OR c.phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY c.${sortBy} ${sortOrder}`;

    const allCustomers = db.prepare(query).all(...params);

    // Enrich each customer with their current subscription & dynamic status
    const enriched = allCustomers.map(cust => {
      const sub = db.prepare('SELECT * FROM subscriptions WHERE customer_id = ? ORDER BY id DESC LIMIT 1').get(cust.id);
      const pauses = db.prepare('SELECT * FROM pauses WHERE customer_id = ?').all(cust.id);
      const computedStatus = evaluateStatus(sub, pauses);
      return {
        ...cust,
        subscription: sub || null,
        status: computedStatus
      };
    });

    // Apply status filter if specified
    const filtered = statusFilter === 'all'
      ? enriched
      : enriched.filter(c => c.status === statusFilter);

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginated = filtered.slice(offset, offset + limit);

    return res.json({
      customers: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error listing customers:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

// 3. Search Customer by Phone
function searchCustomersByPhone(req, res) {
  const phone = req.query.phone ? String(req.query.phone).trim() : '';

  if (!phone) {
    return res.status(400).json({ error: 'Validation Error', message: 'Phone query parameter is required' });
  }

  const db = getDb();
  try {
    const customers = db.prepare('SELECT * FROM customers WHERE phone LIKE ? ORDER BY id DESC').all(`%${phone}%`);

    const enriched = customers.map(cust => {
      const sub = db.prepare('SELECT * FROM subscriptions WHERE customer_id = ? ORDER BY id DESC LIMIT 1').get(cust.id);
      const pauses = db.prepare('SELECT * FROM pauses WHERE customer_id = ?').all(cust.id);
      return {
        ...cust,
        subscription: sub || null,
        status: evaluateStatus(sub, pauses)
      };
    });

    return res.json({ customers: enriched });
  } catch (error) {
    console.error('Error searching customer by phone:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

// 4. Get Customer by ID
function getCustomerById(req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Validation Error', message: 'Invalid customer ID' });
  }

  const db = getDb();
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!customer) {
      return res.status(404).json({ error: 'Not Found', message: 'Customer not found' });
    }

    const subscription = db.prepare('SELECT * FROM subscriptions WHERE customer_id = ? ORDER BY id DESC LIMIT 1').get(id) || null;
    const pauses = db.prepare('SELECT * FROM pauses WHERE customer_id = ? ORDER BY start_date DESC').all(id);
    const status = evaluateStatus(subscription, pauses);

    return res.json({
      customer,
      subscription,
      pauses,
      status
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

// 5. Update Customer
function updateCustomer(req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Validation Error', message: 'Invalid customer ID' });
  }

  const { name, phone, email, address, notes } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Validation Error', message: 'Name is required' });
  }

  if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
    return res.status(400).json({ error: 'Validation Error', message: 'Phone number is required' });
  }

  const cleanPhone = phone.trim();
  const db = getDb();

  try {
    const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(id);
    if (!customer) {
      return res.status(404).json({ error: 'Not Found', message: 'Customer not found' });
    }

    const duplicate = db.prepare('SELECT id FROM customers WHERE phone = ? AND id != ?').get(cleanPhone, id);
    if (duplicate) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Phone number "${cleanPhone}" is already assigned to another customer`
      });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE customers
      SET name = ?, phone = ?, email = ?, address = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(name.trim(), cleanPhone, email ? email.trim() : null, address ? address.trim() : null, notes ? notes.trim() : null, now, id);

    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    return res.json({
      message: 'Customer updated successfully',
      customer: updated
    });
  } catch (error) {
    console.error('Error updating customer:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

// 6. Delete Customer
function deleteCustomer(req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Validation Error', message: 'Invalid customer ID' });
  }

  const db = getDb();
  try {
    const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(id);
    if (!customer) {
      return res.status(404).json({ error: 'Not Found', message: 'Customer not found' });
    }

    db.prepare('DELETE FROM customers WHERE id = ?').run(id);
    return res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

// 7. Subscribe Customer
function subscribeCustomer(req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Validation Error', message: 'Invalid customer ID' });
  }

  const { planName, monthlyPrice, startDate, endDate } = req.body || {};

  if (!planName || typeof planName !== 'string' || planName.trim().length === 0) {
    return res.status(400).json({ error: 'Validation Error', message: 'planName is required' });
  }

  const price = Number(monthlyPrice);
  if (isNaN(price) || price < 0) {
    return res.status(400).json({ error: 'Validation Error', message: 'monthlyPrice must be a non-negative number' });
  }

  if (!startDate || !isValidDateString(startDate)) {
    return res.status(400).json({ error: 'Validation Error', message: 'Valid startDate (YYYY-MM-DD) is required' });
  }

  if (endDate && !isValidDateString(endDate)) {
    return res.status(400).json({ error: 'Validation Error', message: 'endDate must be in YYYY-MM-DD format' });
  }

  if (endDate && startDate > endDate) {
    return res.status(400).json({ error: 'Validation Error', message: 'startDate cannot be after endDate' });
  }

  const db = getDb();
  try {
    const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(id);
    if (!customer) {
      return res.status(404).json({ error: 'Not Found', message: 'Customer not found' });
    }

    const now = new Date().toISOString();

    // Mark any existing active subscriptions as cancelled
    db.prepare(`
      UPDATE subscriptions
      SET status = 'cancelled', updated_at = ?
      WHERE customer_id = ? AND status IN ('active', 'paused')
    `).run(now, id);

    // Insert new subscription
    const insertResult = db.prepare(`
      INSERT INTO subscriptions (customer_id, plan_name, monthly_price, start_date, end_date, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(id, planName.trim(), price, startDate.trim(), endDate ? endDate.trim() : null, now, now);

    const subscription = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(insertResult.lastInsertRowid);
    return res.status(201).json({
      message: 'Subscription created successfully',
      subscription
    });
  } catch (error) {
    console.error('Error subscribing customer:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

// 8. Pause Subscription
function pauseCustomer(req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Validation Error', message: 'Invalid customer ID' });
  }

  const { startDate, endDate, reason } = req.body || {};

  if (!startDate || !isValidDateString(startDate)) {
    return res.status(400).json({ error: 'Validation Error', message: 'Valid startDate (YYYY-MM-DD) is required' });
  }

  if (!endDate || !isValidDateString(endDate)) {
    return res.status(400).json({ error: 'Validation Error', message: 'Valid endDate (YYYY-MM-DD) is required' });
  }

  if (startDate > endDate) {
    return res.status(400).json({ error: 'Validation Error', message: 'startDate cannot be after endDate' });
  }

  const db = getDb();
  try {
    const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(id);
    if (!customer) {
      return res.status(404).json({ error: 'Not Found', message: 'Customer not found' });
    }

    const subscription = db.prepare(`
      SELECT * FROM subscriptions
      WHERE customer_id = ? AND status IN ('active', 'paused')
      ORDER BY id DESC LIMIT 1
    `).get(id);

    if (!subscription) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Customer does not have an active subscription to pause'
      });
    }

    const now = new Date().toISOString();
    const insertResult = db.prepare(`
      INSERT INTO pauses (customer_id, subscription_id, start_date, end_date, reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, subscription.id, startDate.trim(), endDate.trim(), reason ? reason.trim() : null, now, now);

    // If pause period covers today, update subscription status to 'paused'
    const today = getTodayString();
    if (today >= startDate.trim() && today <= endDate.trim()) {
      db.prepare("UPDATE subscriptions SET status = 'paused', updated_at = ? WHERE id = ?").run(now, subscription.id);
    }

    const pause = db.prepare('SELECT * FROM pauses WHERE id = ?').get(insertResult.lastInsertRowid);
    return res.status(201).json({
      message: 'Subscription paused successfully',
      pause
    });
  } catch (error) {
    console.error('Error pausing subscription:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

// 9. Resume Subscription
function resumeCustomer(req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Validation Error', message: 'Invalid customer ID' });
  }

  const db = getDb();
  try {
    const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(id);
    if (!customer) {
      return res.status(404).json({ error: 'Not Found', message: 'Customer not found' });
    }

    const subscription = db.prepare(`
      SELECT * FROM subscriptions
      WHERE customer_id = ? AND status IN ('active', 'paused')
      ORDER BY id DESC LIMIT 1
    `).get(id);

    if (!subscription) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Customer does not have an active or paused subscription'
      });
    }

    const today = getTodayString();
    const yesterday = getYesterdayString();
    const now = new Date().toISOString();

    // Check for any ongoing or future pause covering today
    const activePauses = db.prepare(`
      SELECT * FROM pauses
      WHERE customer_id = ? AND end_date >= ?
      ORDER BY start_date ASC
    `).all(id, today);

    for (const p of activePauses) {
      if (p.start_date <= today) {
        // Close the pause so it ends yesterday; past days are preserved, and customer is active starting today
        const adjustedEnd = yesterday;
        db.prepare('UPDATE pauses SET end_date = ?, updated_at = ? WHERE id = ?').run(adjustedEnd, now, p.id);
      } else {
        // Future pause scheduled: set end_date = start_date or adjust to not affect future
        // We preserve historical pause record
        db.prepare('UPDATE pauses SET updated_at = ? WHERE id = ?').run(now, p.id);
      }
    }

    // Set subscription status back to active
    db.prepare("UPDATE subscriptions SET status = 'active', updated_at = ? WHERE id = ?").run(now, subscription.id);

    const updatedSub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subscription.id);
    return res.json({
      message: 'Subscription resumed successfully',
      subscription: updatedSub
    });
  } catch (error) {
    console.error('Error resuming subscription:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

// 10. Get Customer Status
function getCustomerStatus(req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Validation Error', message: 'Invalid customer ID' });
  }

  const db = getDb();
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!customer) {
      return res.status(404).json({ error: 'Not Found', message: 'Customer not found' });
    }

    const subscription = db.prepare('SELECT * FROM subscriptions WHERE customer_id = ? ORDER BY id DESC LIMIT 1').get(id) || null;
    const pauses = db.prepare('SELECT * FROM pauses WHERE customer_id = ? ORDER BY start_date DESC').all(id);

    const today = getTodayString();
    const activePause = pauses.find(p => today >= p.start_date && today <= p.end_date) || null;
    const status = evaluateStatus(subscription, pauses);

    return res.json({
      customer,
      subscription,
      status,
      activePause,
      recentPauses: pauses.slice(0, 5)
    });
  } catch (error) {
    console.error('Error getting status:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

// 11. Calculate Monthly Bill for Customer
function getCustomerBill(req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Validation Error', message: 'Invalid customer ID' });
  }

  const month = req.query.month ? String(req.query.month).trim() : '';
  if (!isValidMonthString(month)) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Query parameter "month" is required in YYYY-MM format (e.g. ?month=2026-09)'
    });
  }

  const db = getDb();
  try {
    const customer = db.prepare('SELECT id, name, phone, email FROM customers WHERE id = ?').get(id);
    if (!customer) {
      return res.status(404).json({ error: 'Not Found', message: 'Customer not found' });
    }

    // Find the subscription applicable to the customer
    const subscription = db.prepare(`
      SELECT * FROM subscriptions
      WHERE customer_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(id);

    if (!subscription) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Customer does not have any subscription on file'
      });
    }

    // Get all pauses
    const pauses = db.prepare('SELECT * FROM pauses WHERE customer_id = ?').all(id);

    // Deterministic billing engine calculation
    const bill = calculateMonthlyBill({
      monthStr: month,
      monthlyPlanPrice: subscription.monthly_price,
      subscription,
      pauses
    });

    return res.json({
      customer,
      month: bill.month,
      monthlyPlanPrice: bill.monthlyPlanPrice,
      totalWeekdaysInMonth: bill.totalWeekdaysInMonth,
      eligibleWeekdays: bill.eligibleWeekdays,
      pausedWeekdays: bill.pausedWeekdays,
      servedWeekdays: bill.servedWeekdays,
      dailyRate: bill.dailyRate,
      totalBill: bill.totalBill,
      dailyBreakdown: bill.dailyBreakdown
    });
  } catch (error) {
    console.error('Error calculating bill:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

const { processCustomerCsvImport } = require('../utils/csvImport');

// 12. Import Customers from CSV (T4)
function importCustomers(req, res) {
  try {
    let csvContent = '';

    if (req.file && req.file.buffer) {
      csvContent = req.file.buffer.toString('utf8');
    } else if (req.body && typeof req.body.csv === 'string') {
      csvContent = req.body.csv;
    } else if (typeof req.body === 'string') {
      csvContent = req.body;
    }

    if (!csvContent || csvContent.trim().length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'CSV content or file is required. Upload a file or provide a csv string.'
      });
    }

    const report = processCustomerCsvImport(csvContent);
    return res.status(200).json(report);
  } catch (error) {
    console.error('Error importing customers:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
}

module.exports = {
  createCustomer,
  listCustomers,
  searchCustomersByPhone,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  subscribeCustomer,
  pauseCustomer,
  resumeCustomer,
  getCustomerStatus,
  getCustomerBill,
  importCustomers
};
